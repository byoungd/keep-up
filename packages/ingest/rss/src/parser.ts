import Parser from "rss-parser";
import type { RSSItem } from "./types";

export class RSSParser {
  private parser: Parser;

  constructor() {
    this.parser = new Parser({
      customFields: {
        item: ["content:encoded", "content", "description", "author"],
      },
    });
  }

  async parse(xml: string): Promise<RSSItem[]> {
    try {
      const feed = await this.parser.parseString(xml);
      return feed.items as RSSItem[];
    } catch (error) {
      throw new Error(
        `Failed to parse RSS XML: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
