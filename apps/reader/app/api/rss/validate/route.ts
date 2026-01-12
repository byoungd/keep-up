import { type NextRequest, NextResponse } from "next/server";

/**
 * RSS Feed Validation API
 * Fetches and parses an RSS feed to extract metadata.
 *
 * GET /api/rss/validate?url=<feed_url>
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "URL parameter required" }, { status: 400 });
  }

  // Validate URL format
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return NextResponse.json({ error: "Invalid protocol" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  try {
    // Fetch the feed
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Reader/1.0 RSS Feed Validator",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
      },
      signal: AbortSignal.timeout(10000), // 10s timeout
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch feed: ${response.status}` },
        { status: 400 }
      );
    }

    const text = await response.text();

    // Basic validation - check if it looks like RSS/Atom
    if (!text.includes("<rss") && !text.includes("<feed") && !text.includes("<channel")) {
      return NextResponse.json(
        { error: "URL does not appear to be a valid RSS or Atom feed" },
        { status: 400 }
      );
    }

    // Extract title (simple regex, could use proper parser)
    const titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : null;

    // Extract description
    const descMatch = text.match(/<description[^>]*>([^<]+)<\/description>/i);
    const description = descMatch ? descMatch[1].trim() : null;

    // Count items
    const itemCount = (text.match(/<item/gi) || text.match(/<entry/gi) || []).length;

    return NextResponse.json({
      valid: true,
      title,
      description,
      itemCount,
      url,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Failed to validate feed: ${message}` }, { status: 500 });
  }
}
