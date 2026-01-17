#!/usr/bin/env npx tsx
/**
 * RSS Ingest Test Suite
 *
 * Tests parsing quality, consistency, and edge cases for RSS import.
 * Mirrors the structure of test-pdf-ingest.ts for consistency.
 *
 * Usage:
 *   pnpm ingest-rss:test        # Quick fixtures (PR gate, <30s)
 *   pnpm ingest-rss:test:full   # All fixtures (nightly)
 *   pnpm ingest-rss:report      # JSON report to artifacts/
 *
 * Pitfalls & Mitigations:
 *   - Remote URL tests can hang: Use timeout + fallback to local mock
 *   - Silent failures: Every await has logging; failures set process.exitCode
 *   - Report truncation: Console shows summary only; details go to JSON
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type IngestionMeta, RSSAtomicAdapter } from "../src/atomicAdapter";
import { RSSIngestor } from "../src/index";
import { RSSParser } from "../src/parser";
import {
  computeRssStatsFromMeta,
  RSS_QUALITY_THRESHOLDS,
  type RssIngestStats,
} from "../src/rssStats";

function writeLine(line: string): void {
  process.stdout.write(line.endsWith("\n") ? line : `${line}\n`);
}

function writeErrorLine(line: string): void {
  process.stderr.write(line.endsWith("\n") ? line : `${line}\n`);
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }
  return String(error);
}

// ============================================================================
// Quality Gate Thresholds
// ============================================================================

const QUALITY_THRESHOLDS = RSS_QUALITY_THRESHOLDS;

/** Warning types for RSS parsing events */
type RssWarning =
  | "low_content_rate"
  | "low_title_rate"
  | "high_snippet_ratio"
  | "high_html_residue"
  | "low_avg_content"
  | "few_items"
  | "encoding_issues";

/** Gate failure reasons */
type GateFailureReason =
  | "content_rate_too_low"
  | "title_rate_too_low"
  | "snippet_ratio_exceeded"
  | "html_residue_exceeded"
  | "avg_content_too_short"
  | "too_few_items"
  | "fetch_error"
  | "parse_error"
  | "timeout";

// ============================================================================
// Test Fixtures
// ============================================================================

interface RssIngestFixture {
  name: string;
  description: string;
  source: { type: "url"; url: string } | { type: "mock"; xml: string };
  quick?: boolean;
  regression?: boolean;
  expectDegradation?: boolean;
  expectedMinItems?: number;
  timeout?: number;
}

// Local mock fixtures for reliable quick tests
const LOCAL_FIXTURES: RssIngestFixture[] = [
  {
    name: "minimal-rss",
    description: "Minimal valid RSS feed (local mock)",
    source: {
      type: "mock",
      xml: createMockRss([
        {
          title: "Test Article 1",
          content:
            "This is the first test article with enough content to pass validation checks. It contains multiple sentences to ensure the content length exceeds the snippet threshold of 100 characters.",
          link: "https://example.com/1",
        },
        {
          title: "Test Article 2",
          content:
            "Second article continues with more substantial content for testing purposes. This paragraph also needs to be long enough to avoid being classified as a snippet in our quality metrics.",
          link: "https://example.com/2",
        },
      ]),
    },
    quick: true,
    regression: true,
    expectedMinItems: 2,
  },
  {
    name: "html-content",
    description: "RSS with HTML content (local mock)",
    source: {
      type: "mock",
      xml: createMockRss([
        {
          title: "HTML Article",
          content:
            "<p>This is a <strong>paragraph</strong> with HTML tags that should be cleaned properly by our content extractor.</p><p>Second paragraph here with additional content to make this article long enough to pass the snippet threshold check.</p>",
          link: "https://example.com/html",
        },
      ]),
    },
    quick: true,
    regression: true,
    expectedMinItems: 1,
  },
  {
    name: "snippet-feed",
    description: "RSS with short snippets (local mock)",
    source: {
      type: "mock",
      xml: createMockRss([
        { title: "Short 1", content: "Brief.", link: "https://example.com/s1" },
        { title: "Short 2", content: "Also brief.", link: "https://example.com/s2" },
        {
          title: "Long Article",
          content:
            "This article has much more content and should not be considered a snippet because it exceeds the threshold.",
          link: "https://example.com/long",
        },
      ]),
    },
    quick: true,
    expectDegradation: true, // Expected to have high snippet ratio
    expectedMinItems: 3,
  },
  {
    name: "missing-content",
    description: "RSS with missing content fields (local mock)",
    source: {
      type: "mock",
      xml: createMockRss([
        { title: "Title Only", content: "", link: "https://example.com/empty" },
        {
          title: "Has Content",
          content:
            "This one has content that should be extracted properly. Adding more text to ensure it passes the minimum content length requirements for our quality gates.",
          link: "https://example.com/has",
        },
      ]),
    },
    quick: true,
    expectDegradation: true, // Expected to have low content rate
    expectedMinItems: 2,
  },
];

// Remote URL fixtures for comprehensive testing
const REMOTE_FIXTURES: RssIngestFixture[] = [
  {
    name: "bbc-news",
    description: "BBC News RSS feed",
    source: { type: "url", url: "https://feeds.bbci.co.uk/news/rss.xml" },
    quick: true,
    expectedMinItems: 10,
    timeout: 15000,
  },
  {
    name: "hn-frontpage",
    description: "Hacker News front page",
    source: { type: "url", url: "https://hnrss.org/frontpage" },
    quick: false,
    expectedMinItems: 20,
    timeout: 15000,
  },
  {
    name: "reddit-programming",
    description: "Reddit r/programming",
    source: { type: "url", url: "https://www.reddit.com/r/programming/.rss" },
    quick: false,
    expectedMinItems: 10,
    timeout: 20000,
  },
];

const RSS_FIXTURES: RssIngestFixture[] = [...LOCAL_FIXTURES, ...REMOTE_FIXTURES];

/**
 * Create a mock RSS XML string for testing.
 */
function createMockRss(items: Array<{ title: string; content: string; link: string }>): string {
  const itemsXml = items
    .map(
      (item) => `
    <item>
      <title>${escapeXml(item.title)}</title>
      <description>${escapeXml(item.content)}</description>
      <link>${escapeXml(item.link)}</link>
      <guid>${escapeXml(item.link)}</guid>
      <pubDate>${new Date().toUTCString()}</pubDate>
    </item>
  `
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <link>https://example.com</link>
    <description>Test RSS feed for quality testing</description>
    ${itemsXml}
  </channel>
</rss>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ============================================================================
// Test Result Types
// ============================================================================

interface RssIngestResult {
  fixture: string;
  description: string;
  success: boolean;
  regression?: boolean;
  stats: RssIngestStats;
  warnings?: RssWarning[];
  gated?: {
    passed: boolean;
    failureReason?: GateFailureReason;
    details?: string;
  };
  durationMs: number;
  error?: string;
  sampleTitles?: string[];
}

interface RssIngestReport {
  timestamp: string;
  environment: {
    nodeVersion: string;
    platform: string;
  };
  thresholds: typeof QUALITY_THRESHOLDS;
  summary: {
    total: number;
    passed: number;
    failed: number;
    gatedFailures: number;
    withWarnings: number;
    quickMode: boolean;
  };
  results: RssIngestResult[];
}

// ============================================================================
// Analysis Functions
// ============================================================================

function computeWarnings(stats: RssIngestStats): RssWarning[] {
  const warnings: RssWarning[] = [];

  // Warn at 80% of threshold (early warning)
  if (stats.contentExtractionRate < QUALITY_THRESHOLDS.minContentExtractionRate * 1.1) {
    warnings.push("low_content_rate");
  }
  if (stats.titleExtractionRate < QUALITY_THRESHOLDS.minTitleExtractionRate * 1.1) {
    warnings.push("low_title_rate");
  }
  if (stats.snippetRatio > QUALITY_THRESHOLDS.maxSnippetRatio * 0.8) {
    warnings.push("high_snippet_ratio");
  }
  if (stats.htmlResidueRatio > QUALITY_THRESHOLDS.maxHtmlResidueRatio * 0.8) {
    warnings.push("high_html_residue");
  }
  if (stats.avgContentLength < QUALITY_THRESHOLDS.minAvgContentLength * 1.5) {
    warnings.push("low_avg_content");
  }
  if (stats.totalItems < 5) {
    warnings.push("few_items");
  }
  if (stats.itemsWithEncodingIssues > 0) {
    warnings.push("encoding_issues");
  }

  return warnings;
}

function checkQualityGate(
  stats: RssIngestStats,
  quickMode: boolean,
  expectDegradation?: boolean
): RssIngestResult["gated"] {
  // Gate checks only in full mode
  if (quickMode) {
    return undefined;
  }

  // Skip gate for expected degradation fixtures
  if (expectDegradation) {
    return { passed: true };
  }

  // Check each threshold
  if (stats.contentExtractionRate < QUALITY_THRESHOLDS.minContentExtractionRate) {
    return {
      passed: false,
      failureReason: "content_rate_too_low",
      details: `${(stats.contentExtractionRate * 100).toFixed(1)}% < ${QUALITY_THRESHOLDS.minContentExtractionRate * 100}%`,
    };
  }

  if (stats.titleExtractionRate < QUALITY_THRESHOLDS.minTitleExtractionRate) {
    return {
      passed: false,
      failureReason: "title_rate_too_low",
      details: `${(stats.titleExtractionRate * 100).toFixed(1)}% < ${QUALITY_THRESHOLDS.minTitleExtractionRate * 100}%`,
    };
  }

  if (stats.snippetRatio > QUALITY_THRESHOLDS.maxSnippetRatio) {
    return {
      passed: false,
      failureReason: "snippet_ratio_exceeded",
      details: `${(stats.snippetRatio * 100).toFixed(1)}% > ${QUALITY_THRESHOLDS.maxSnippetRatio * 100}%`,
    };
  }

  if (stats.htmlResidueRatio > QUALITY_THRESHOLDS.maxHtmlResidueRatio) {
    return {
      passed: false,
      failureReason: "html_residue_exceeded",
      details: `${(stats.htmlResidueRatio * 100).toFixed(1)}% > ${QUALITY_THRESHOLDS.maxHtmlResidueRatio * 100}%`,
    };
  }

  if (stats.avgContentLength < QUALITY_THRESHOLDS.minAvgContentLength) {
    return {
      passed: false,
      failureReason: "avg_content_too_short",
      details: `${stats.avgContentLength} < ${QUALITY_THRESHOLDS.minAvgContentLength}`,
    };
  }

  if (stats.totalItems < QUALITY_THRESHOLDS.minItemCount) {
    return {
      passed: false,
      failureReason: "too_few_items",
      details: `${stats.totalItems} < ${QUALITY_THRESHOLDS.minItemCount}`,
    };
  }

  return { passed: true };
}

// ============================================================================
// Test Runner
// ============================================================================
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: test runner logic
async function runRssIngestTests(quickMode: boolean): Promise<RssIngestReport> {
  const ingestor = new RSSIngestor();
  const parser = new RSSParser();
  const results: RssIngestResult[] = [];

  // Filter fixtures based on mode
  const fixtures = quickMode ? RSS_FIXTURES.filter((f) => f.quick) : RSS_FIXTURES;

  writeLine(`  Running ${fixtures.length} fixtures...\n`);

  for (const fixture of fixtures) {
    const startTime = Date.now();
    const timeout = fixture.timeout || 15000;

    try {
      process.stdout.write(`  [${fixture.name}] `);

      let metas: IngestionMeta[];

      if (fixture.source.type === "mock") {
        // Parse mock XML directly
        const items = await parser.parse(fixture.source.xml);
        metas = RSSAtomicAdapter.toIngestionMetaBatch(items, { url: "mock://test" });
      } else {
        // Fetch from URL with timeout
        metas = await Promise.race([
          ingestor.fetchFeedForIngestion({ url: fixture.source.url }, { timeout }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout)
          ),
        ]);
      }

      const durationMs = Date.now() - startTime;
      const stats = computeRssStatsFromMeta(metas);
      const warnings = computeWarnings(stats);
      const gated = checkQualityGate(stats, quickMode, fixture.expectDegradation);

      const gatePassed = gated?.passed ?? true;
      const meetsMinItems =
        !fixture.expectedMinItems || stats.totalItems >= fixture.expectedMinItems;
      const success = gatePassed && meetsMinItems;

      writeLine(
        `${success ? "✓" : "✗"} ${durationMs}ms (${stats.totalItems} items, ${stats.avgContentLength} avg chars)`
      );

      results.push({
        fixture: fixture.name,
        description: fixture.description,
        success,
        regression: fixture.regression,
        stats,
        warnings: warnings.length > 0 ? warnings : undefined,
        gated,
        durationMs,
        sampleTitles: metas.slice(0, 3).map((m) => m.title.slice(0, 40)),
      });
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      const isTimeout = errorMsg.includes("Timeout") || errorMsg.includes("timeout");
      const isFetchError = errorMsg.includes("fetch") || errorMsg.includes("ENOTFOUND");

      writeLine(`✗ ERROR (${durationMs}ms): ${errorMsg.slice(0, 60)}...`);

      const emptyStats: RssIngestStats = {
        totalItems: 0,
        itemsWithContent: 0,
        itemsWithTitle: 0,
        itemsWithSourceId: 0,
        avgContentLength: 0,
        minContentLength: 0,
        maxContentLength: 0,
        snippetItems: 0,
        snippetRatio: 0,
        contentExtractionRate: 0,
        titleExtractionRate: 0,
        sourceIdRate: 0,
        itemsWithHtmlResidue: 0,
        htmlResidueRatio: 0,
        itemsWithEncodingIssues: 0,
      };

      results.push({
        fixture: fixture.name,
        description: fixture.description,
        success: false,
        regression: fixture.regression,
        stats: emptyStats,
        gated: quickMode
          ? undefined
          : {
              passed: false,
              failureReason: isTimeout ? "timeout" : isFetchError ? "fetch_error" : "parse_error",
              details: errorMsg,
            },
        durationMs,
        error: errorMsg,
      });
    }
  }

  // Compute summary
  const passed = results.filter((r) => r.success).length;
  const gatedFailures = results.filter((r) => r.gated && !r.gated.passed).length;
  const withWarnings = results.filter((r) => r.warnings && r.warnings.length > 0).length;

  return {
    timestamp: new Date().toISOString(),
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
    },
    thresholds: QUALITY_THRESHOLDS,
    summary: {
      total: results.length,
      passed,
      failed: results.length - passed,
      gatedFailures,
      withWarnings,
      quickMode,
    },
    results,
  };
}

// ============================================================================
// Output Formatters
// ============================================================================
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: test report logic
function printHumanReport(report: RssIngestReport): void {
  writeLine(`\n${"=".repeat(80)}`);
  writeLine("📡 RSS INGEST TEST REPORT");
  writeLine("=".repeat(80));
  writeLine(`Timestamp: ${report.timestamp}`);
  writeLine(`Node: ${report.environment.nodeVersion}, Platform: ${report.environment.platform}`);
  writeLine(`Mode: ${report.summary.quickMode ? "QUICK (PR gate)" : "FULL (nightly)"}`);
  writeLine(`Summary: ${report.summary.passed}/${report.summary.total} passed`);

  if (!report.summary.quickMode) {
    writeLine(
      `Gate: ${report.summary.gatedFailures} failures, ${report.summary.withWarnings} with warnings`
    );
    writeLine(
      `Thresholds: content>${QUALITY_THRESHOLDS.minContentExtractionRate * 100}%, title>${QUALITY_THRESHOLDS.minTitleExtractionRate * 100}%, snippet<${QUALITY_THRESHOLDS.maxSnippetRatio * 100}%`
    );
  }

  // Summary table
  writeLine("\n┌────────────────────┬───────┬─────────┬─────────┬─────────┬──────┬─────────┐");
  writeLine("│ Fixture            │ Items │ Content │ Title   │ Snippet │ Warn │ Status  │");
  writeLine("├────────────────────┼───────┼─────────┼─────────┼─────────┼──────┼─────────┤");

  for (const r of report.results) {
    const content = `${(r.stats.contentExtractionRate * 100).toFixed(0)}%`;
    const title = `${(r.stats.titleExtractionRate * 100).toFixed(0)}%`;
    const snippet = `${(r.stats.snippetRatio * 100).toFixed(0)}%`;
    const warn = r.warnings ? String(r.warnings.length) : "-";
    const regMark = r.regression ? "[R]" : "";
    const status = r.success ? "✅ PASS" : "❌ FAIL";

    writeLine(
      `│ ${(r.fixture + regMark).padEnd(18)} │ ${String(r.stats.totalItems).padStart(5)} │ ${content.padStart(7)} │ ${title.padStart(7)} │ ${snippet.padStart(7)} │ ${warn.padStart(4)} │ ${status.padEnd(7)} │`
    );
  }

  writeLine("└────────────────────┴───────┴─────────┴─────────┴─────────┴──────┴─────────┘");

  // Warnings detail
  const withWarnings = report.results.filter((r) => r.warnings && r.warnings.length > 0);
  if (withWarnings.length > 0) {
    writeLine("\n⚠️  WARNINGS:");
    for (const r of withWarnings) {
      writeLine(`   ${r.fixture}: ${r.warnings?.join(", ")}`);
    }
  }

  // Gate failures detail
  const gateFailures = report.results.filter((r) => r.gated && !r.gated.passed);
  if (gateFailures.length > 0) {
    writeLine("\n🚫 GATE FAILURES:");
    for (const r of gateFailures) {
      writeLine(`   ${r.fixture}: ${r.gated?.failureReason} (${r.gated?.details || "no details"})`);
    }
  }

  // Other failures
  const otherFailures = report.results.filter((r) => !r.success && (!r.gated || r.gated.passed));
  if (otherFailures.length > 0) {
    writeLine("\n❌ FAILURES:");
    for (const f of otherFailures) {
      writeLine(`   ${f.fixture}: ${f.error || "unknown error"}`);
    }
  }

  // Sample titles
  const withSamples = report.results.filter((r) => r.sampleTitles && r.sampleTitles.length > 0);
  if (withSamples.length > 0 && !report.summary.quickMode) {
    writeLine("\n📰 SAMPLE TITLES:");
    for (const r of withSamples.slice(0, 3)) {
      writeLine(`   ${r.fixture}:`);
      for (const t of (r.sampleTitles ?? []).slice(0, 2)) {
        writeLine(`     - "${t}..."`);
      }
    }
  }

  // Performance
  const totalDuration = report.results.reduce((sum, r) => sum + r.durationMs, 0);
  const avgDuration = report.results.length > 0 ? totalDuration / report.results.length : 0;
  writeLine(`\n⏱️  Performance: Total ${totalDuration}ms, Avg ${avgDuration.toFixed(0)}ms`);

  // CI gate result
  if (report.summary.failed > 0) {
    writeLine("\n🚨 CI GATE: FAILED");
    process.exitCode = 1;
  } else {
    writeLine("\n✅ CI GATE: PASSED");
  }
}

function outputJsonReport(report: RssIngestReport): void {
  const artifactsDir = join(__dirname, "..", "artifacts");
  if (!existsSync(artifactsDir)) {
    mkdirSync(artifactsDir, { recursive: true });
  }

  const outputPath = join(artifactsDir, "rss-ingest-report.json");
  writeFileSync(outputPath, JSON.stringify(report, null, 2));
  writeLine(`\nJSON report written to: ${outputPath}`);
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const isJsonMode = process.argv.includes("--json");
  const isQuickMode = process.argv.includes("--quick");

  writeLine("📡 RSS Ingest Test Suite\n");
  writeLine(`Mode: ${isQuickMode ? "QUICK (PR gate)" : "FULL (nightly)"}`);
  writeLine("Testing parsing quality and consistency...\n");

  try {
    const report = await runRssIngestTests(isQuickMode);

    if (isJsonMode) {
      outputJsonReport(report);
    }

    printHumanReport(report);
  } catch (error) {
    writeErrorLine(`\n❌ FATAL ERROR: ${formatError(error)}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  writeErrorLine(`Unhandled error: ${formatError(error)}`);
  process.exitCode = 1;
});
