#!/usr/bin/env npx tsx
/**
 * Test script for default RSS feeds
 *
 * Tests connectivity and parsing for all default feeds.
 * Run with: pnpm --filter @ku0/ingest-rss test:feeds
 */

import {
  getAllDefaultFeeds,
  isRSSHubFeed,
  RSSHUB_INSTANCES,
  switchRSSHubInstance,
} from "../src/defaultFeeds";
import { RSSIngestor } from "../src/index";

function writeLine(line: string): void {
  process.stdout.write(line.endsWith("\n") ? line : `${line}\n`);
}

function writeErrorLine(line: string): void {
  process.stderr.write(line.endsWith("\n") ? line : `${line}\n`);
}

interface TestResult {
  name: string;
  url: string;
  success: boolean;
  itemCount?: number;
  sampleTitle?: string;
  error?: string;
  duration: number;
}

async function testFeed(name: string, url: string, ingestor: RSSIngestor): Promise<TestResult> {
  const start = Date.now();

  try {
    const result = await ingestor.fetchFeedEnhanced({ url }, { timeout: 15000 });

    const duration = Date.now() - start;
    const firstItem = result.items[0];

    return {
      name,
      url,
      success: true,
      itemCount: result.items.length,
      sampleTitle: firstItem?.doc.title?.slice(0, 60),
      duration,
    };
  } catch (error) {
    return {
      name,
      url,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    };
  }
}

async function testRSSHubInstance(instance: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${instance}/`, {
      signal: controller.signal,
      headers: { "User-Agent": "LinguaStream/1.0" },
    });

    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: test runner logic
async function main() {
  writeLine("🔍 Testing Default RSS Feeds\n");
  writeLine("=".repeat(60));

  const ingestor = new RSSIngestor();
  const feeds = getAllDefaultFeeds();
  const results: TestResult[] = [];

  // First, test RSSHub instances
  writeLine("\n📡 Testing RSSHub Instances:\n");
  let workingRSSHubInstance: string | null = null;

  for (const instance of RSSHUB_INSTANCES) {
    const isWorking = await testRSSHubInstance(instance);
    const status = isWorking ? "✅" : "❌";
    writeLine(`  ${status} ${instance}`);

    if (isWorking && !workingRSSHubInstance) {
      workingRSSHubInstance = instance;
    }
  }

  writeLine(`\n${"=".repeat(60)}`);
  writeLine("\n📰 Testing Individual Feeds:\n");

  for (const feed of feeds) {
    let url = feed.url;

    // Switch to working RSSHub instance if needed
    if (isRSSHubFeed(url) && workingRSSHubInstance) {
      url = switchRSSHubInstance(url, workingRSSHubInstance);
    }

    process.stdout.write(`  Testing ${feed.name}... `);

    const result = await testFeed(feed.name, url, ingestor);
    results.push(result);

    if (result.success) {
      writeLine(`✅ ${result.itemCount} items (${result.duration}ms)`);
      if (result.sampleTitle) {
        writeLine(`     Sample: "${result.sampleTitle}..."`);
      }
    } else {
      writeLine(`❌ ${result.error}`);
    }
  }

  // Summary
  writeLine(`\n${"=".repeat(60)}`);
  writeLine("\n📊 Summary:\n");

  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  writeLine(`  Total feeds: ${results.length}`);
  writeLine(`  Successful: ${successful.length}`);
  writeLine(`  Failed: ${failed.length}`);

  if (failed.length > 0) {
    writeLine("\n  Failed feeds:");
    for (const f of failed) {
      writeLine(`    - ${f.name}: ${f.error}`);
    }
  }

  const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
  writeLine(`\n  Average fetch time: ${Math.round(avgDuration)}ms`);

  // Exit with error if any feeds failed
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  writeErrorLine(`Unhandled error: ${message}`);
});
