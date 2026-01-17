import { describe, expect, it } from "vitest";
import { evaluateRssQuality, RSS_QUALITY_THRESHOLDS, type RssIngestStats } from "../rssStats";

const passingStats: RssIngestStats = {
  totalItems: 5,
  itemsWithContent: 5,
  itemsWithTitle: 5,
  itemsWithSourceId: 5,
  avgContentLength: 200,
  minContentLength: 50,
  maxContentLength: 500,
  snippetItems: 1,
  snippetRatio: 0.2,
  contentExtractionRate: 1,
  titleExtractionRate: 1,
  sourceIdRate: 1,
  itemsWithHtmlResidue: 0,
  htmlResidueRatio: 0,
  itemsWithEncodingIssues: 0,
};

describe("evaluateRssQuality", () => {
  it("passes when metrics meet thresholds", () => {
    const report = evaluateRssQuality(passingStats);
    expect(report.passed).toBe(true);
    expect(report.reasons).toEqual([]);
    expect(report.thresholds).toBe(RSS_QUALITY_THRESHOLDS);
  });

  it("collects all failing reasons against thresholds", () => {
    const failing: RssIngestStats = {
      totalItems: 1,
      itemsWithContent: 0,
      itemsWithTitle: 0,
      itemsWithSourceId: 0,
      avgContentLength: 10,
      minContentLength: 5,
      maxContentLength: 10,
      snippetItems: 1,
      snippetRatio: 1,
      contentExtractionRate: 0,
      titleExtractionRate: 0,
      sourceIdRate: 0,
      itemsWithHtmlResidue: 1,
      htmlResidueRatio: 1,
      itemsWithEncodingIssues: 0,
    };

    const report = evaluateRssQuality(failing);
    expect(report.passed).toBe(false);
    expect(report.reasons).toEqual([
      "content_rate_too_low",
      "title_rate_too_low",
      "snippet_ratio_exceeded",
      "html_residue_exceeded",
      "avg_content_too_short",
    ]);
  });
});
