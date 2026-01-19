/**
 * Web Tools Module
 *
 * Provides web search and fetch capabilities for agents.
 */

export {
  createWebSearchToolServer,
  type IWebSearchProvider,
  JinaWebSearchProvider,
  MockWebSearchProvider,
  SerperWebSearchProvider,
  TavilyWebSearchProvider,
  type WebFetchResult,
  type WebSearchOptions,
  type WebSearchResult,
  WebSearchToolServer,
} from "./webSearchServer";
