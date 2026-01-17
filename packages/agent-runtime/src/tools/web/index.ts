/**
 * Web Tools Module
 *
 * Provides web search and fetch capabilities for agents.
 */

export {
  createWebSearchToolServer,
  type IWebSearchProvider,
  MockWebSearchProvider,
  type WebFetchResult,
  type WebSearchOptions,
  type WebSearchResult,
  WebSearchToolServer,
} from "./webSearchServer";
