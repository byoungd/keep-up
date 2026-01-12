import { type IngestionMeta, RSSAtomicAdapter } from "./atomicAdapter";
import { RSSFetcher } from "./fetcher";
import { RSSParser } from "./parser";
import type { FeedSource, RSSIngestOptions, RSSItem } from "./types";

/**
 * Internal plugin contract for content sources.
 * This is not a public plugin API.
 */
export interface ContentSourcePlugin<TSource, TOptions, TMeta> {
  id: string;
  version: string;
  description: string;
  fetch(source: TSource, options?: TOptions): Promise<TMeta[]>;
}

export type RSSPluginDependencies = {
  fetch?: (source: FeedSource, options?: RSSIngestOptions) => Promise<string>;
  parse?: (xml: string) => Promise<RSSItem[]>;
};

/**
 * Create the RSS content source plugin.
 * Returns ingestion metadata for AtomicIngestionService.
 */
export function createRssPlugin(
  dependencies: RSSPluginDependencies = {}
): ContentSourcePlugin<FeedSource, RSSIngestOptions, IngestionMeta> {
  const parser = new RSSParser();
  const fetcher = dependencies.fetch ?? RSSFetcher.fetch;
  const parse = dependencies.parse ?? parser.parse.bind(parser);

  return {
    id: "rss",
    version: "1.0.0",
    description: "RSS feed ingestion (atomic ingestion meta only)",
    async fetch(source: FeedSource, options: RSSIngestOptions = {}) {
      const xml = await fetcher(source, options);
      const items = await parse(xml);
      return RSSAtomicAdapter.toIngestionMetaBatch(items, source);
    },
  };
}
