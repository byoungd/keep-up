import { RSSIngestor } from "@ku0/ingest-rss";
import { NextResponse } from "next/server";
import { z } from "zod";

const RequestSchema = z.object({
  url: z.string().url(),
  etag: z.string().optional(),
  lastModified: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = RequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { url, etag, lastModified } = parsed.data;

    const ingestor = new RSSIngestor();
    const report = await ingestor.fetchFeedWithStats(
      { url },
      {
        etag,
        lastModified,
        timeout: 15000,
        dedupe: true,
      }
    );

    // If feed wasn't modified, return 304-like response
    if (!report.fetch.modified) {
      return NextResponse.json({
        modified: false,
        etag: report.fetch.etag,
        lastModified: report.fetch.lastModified,
      });
    }

    // Transform items to a frontend-friendly format
    const items = report.items.map((item) => ({
      id: item.doc.id,
      title: item.doc.title,
      url: item.raw.link || url,
      content: item.doc.blocks.map((b) => b.text).join("\n"),
      contentHtml: item.doc.blocks.map((b) => b.text).join("<br/>"),
      publishedAt: item.doc.createdAt,
      author: item.raw.author || null,
      guid: item.originalId,
    }));

    return NextResponse.json({
      modified: true,
      etag: report.fetch.etag,
      lastModified: report.fetch.lastModified,
      items,
      stats: report.stats.deduped,
      quality: report.quality,
    });
  } catch (error) {
    console.error("[RSS Fetch Error]", error);

    const message = error instanceof Error ? error.message : "Unknown error";
    const isTimeout = message.includes("timeout") || message.includes("ETIMEDOUT");
    const isNetwork = message.includes("ENOTFOUND") || message.includes("ECONNREFUSED");

    return NextResponse.json(
      {
        error: isTimeout
          ? "Feed request timed out"
          : isNetwork
            ? "Could not reach feed URL"
            : "Failed to fetch feed",
        details: message,
      },
      { status: isTimeout || isNetwork ? 502 : 500 }
    );
  }
}
