import { ParseError } from "../errors";
import type { FileParser, ParseResult } from "../types";

export interface EPUBParserOptions {
  maxChapters?: number;
}

export class EPUBParser implements FileParser {
  readonly extensions = [".epub"];
  readonly mimeTypes = ["application/epub+zip"];

  async parse(content: Buffer, options?: EPUBParserOptions): Promise<ParseResult> {
    try {
      const EPubModule = await import("epub2");
      // biome-ignore lint/suspicious/noExplicitAny: library import
      const EPub = (EPubModule as any).default || EPubModule;

      return new Promise((resolve, reject) => {
        const epub = new EPub(content);

        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: epub parsing logic
        epub.on("end", async () => {
          try {
            const title = epub.metadata?.title || "Untitled";
            const blocks: string[] = [];
            const flow = epub.flow || [];
            const max = options?.maxChapters || flow.length;

            for (let i = 0; i < Math.min(flow.length, max); i++) {
              const item = flow[i];
              if (item?.id) {
                const text = await this.getChapter(epub, item.id);
                if (text) {
                  blocks.push(...this.htmlToBlocks(text));
                }
              }
            }

            resolve({
              title,
              blocks,
              rawContent: blocks.join("\n\n"),
              metadata: {
                author: epub.metadata?.creator,
                publisher: epub.metadata?.publisher,
              },
            });
          } catch (e) {
            reject(new ParseError("Failed to extract EPUB", { cause: e }));
          }
        });

        epub.on("error", (e: Error) => reject(new ParseError("EPUB error", { cause: e })));
        epub.parse();
      });
    } catch (error) {
      throw new ParseError("Failed to parse EPUB", { cause: error });
    }
  }

  // biome-ignore lint/suspicious/noExplicitAny: library type
  private getChapter(epub: any, id: string): Promise<string> {
    return new Promise((resolve) => {
      epub.getChapter(id, (err: Error | null, text: string) => resolve(err ? "" : text || ""));
    });
  }

  private htmlToBlocks(html: string): string[] {
    const text = html
      .replace(/<p[^>]*>/gi, "\n\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"');
    return text
      .split(/\n\s*\n/)
      .map((b) => b.trim())
      .filter((b) => b.length > 0);
  }
}
