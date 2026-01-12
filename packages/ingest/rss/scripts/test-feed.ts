import { RSSIngestor } from "../src/index";

async function main() {
  const ingestor = new RSSIngestor();

  // Test 1: Product Hunt (simple)
  console.log("--- Testing Product Hunt RSS ---");
  try {
    const phResults = await ingestor.fetchFeed({
      url: "https://www.producthunt.com/feed",
      platform: "Product Hunt",
    });
    console.log(`Fetched ${phResults.length} items from Product Hunt.`);
    if (phResults.length > 0) {
      const first = phResults[0];
      console.log("Sample Doc:", JSON.stringify(first.doc, null, 2));
      console.log("Sample Blocks:", first.blocks.length);
      console.log("Sample Block Text Preview:", first.blocks[0].text.substring(0, 100));
    }
  } catch (err) {
    console.error("PH Error:", err);
  }

  // Test 2: Reddit (requires User-Agent headers)
  console.log("\n--- Testing Reddit RSS ---");
  try {
    const redditResults = await ingestor.fetchFeed({
      // Using a safe SFW subreddit
      url: "https://www.reddit.com/r/typescript/.rss",
      platform: "Reddit",
    });
    console.log(`Fetched ${redditResults.length} items from Reddit.`);
    if (redditResults.length > 0) {
      const first = redditResults[0];
      console.log("Sample Doc Title:", first.doc.title);
    }
  } catch (err) {
    console.error("Reddit Error:", err);
  }
}

main().catch(console.error);
