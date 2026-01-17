import { RSSIngestor } from "../src/index";

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

async function main() {
  const ingestor = new RSSIngestor();

  // Test 1: Product Hunt (simple)
  writeLine("--- Testing Product Hunt RSS ---");
  try {
    const phResults = await ingestor.fetchFeed({
      url: "https://www.producthunt.com/feed",
      platform: "Product Hunt",
    });
    writeLine(`Fetched ${phResults.length} items from Product Hunt.`);
    if (phResults.length > 0) {
      const first = phResults[0];
      writeLine(`Sample Doc: ${JSON.stringify(first.doc, null, 2)}`);
      writeLine(`Sample Blocks: ${first.blocks.length}`);
      writeLine(`Sample Block Text Preview: ${first.blocks[0].text.substring(0, 100)}`);
    }
  } catch (err) {
    writeErrorLine(`PH Error: ${formatError(err)}`);
  }

  // Test 2: Reddit (requires User-Agent headers)
  writeLine("\n--- Testing Reddit RSS ---");
  try {
    const redditResults = await ingestor.fetchFeed({
      // Using a safe SFW subreddit
      url: "https://www.reddit.com/r/typescript/.rss",
      platform: "Reddit",
    });
    writeLine(`Fetched ${redditResults.length} items from Reddit.`);
    if (redditResults.length > 0) {
      const first = redditResults[0];
      writeLine(`Sample Doc Title: ${first.doc.title}`);
    }
  } catch (err) {
    writeErrorLine(`Reddit Error: ${formatError(err)}`);
  }
}

main().catch((error) => {
  writeErrorLine(`Unhandled error: ${formatError(error)}`);
});
