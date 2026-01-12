/**
 * Default RSS Feed Sources
 *
 * Curated list of reliable RSS feeds for language learning and general reading.
 * Includes news, tech, and educational content in multiple languages.
 */

export interface DefaultFeed {
  url: string;
  name: string;
  language: "en" | "zh" | "multi";
  category: "news" | "tech" | "education" | "science" | "general";
  description: string;
  /** Whether this feed typically provides full content or just snippets */
  fullContent: boolean;
}

/**
 * English language feeds
 */
export const ENGLISH_FEEDS: DefaultFeed[] = [
  // News
  {
    url: "https://feeds.bbci.co.uk/news/world/rss.xml",
    name: "BBC World News",
    language: "en",
    category: "news",
    description: "International news from BBC",
    fullContent: false,
  },
  {
    url: "https://feeds.npr.org/1001/rss.xml",
    name: "NPR News",
    language: "en",
    category: "news",
    description: "National and international news from NPR",
    fullContent: false,
  },
  {
    url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",
    name: "New York Times World",
    language: "en",
    category: "news",
    description: "World news from NYT",
    fullContent: false,
  },

  // Education / Language Learning
  {
    url: "https://learningenglish.voanews.com/api/z-pqpevi-qii",
    name: "VOA Learning English",
    language: "en",
    category: "education",
    description: "News in simplified English for learners",
    fullContent: true,
  },

  // Tech
  {
    url: "https://hnrss.org/frontpage",
    name: "Hacker News",
    language: "en",
    category: "tech",
    description: "Top stories from Hacker News",
    fullContent: false,
  },
  {
    url: "https://techcrunch.com/feed/",
    name: "TechCrunch",
    language: "en",
    category: "tech",
    description: "Technology news and analysis",
    fullContent: false,
  },
  {
    url: "https://feeds.arstechnica.com/arstechnica/index",
    name: "Ars Technica",
    language: "en",
    category: "tech",
    description: "Technology news and analysis",
    fullContent: false,
  },

  // Science
  {
    url: "https://www.nature.com/nature.rss",
    name: "Nature",
    language: "en",
    category: "science",
    description: "Scientific research and news",
    fullContent: false,
  },
  {
    url: "https://www.sciencedaily.com/rss/all.xml",
    name: "Science Daily",
    language: "en",
    category: "science",
    description: "Latest science news",
    fullContent: false,
  },
];

/**
 * Chinese language feeds (via RSSHub and direct sources)
 */
export const CHINESE_FEEDS: DefaultFeed[] = [
  // RSSHub instances for Chinese content
  {
    url: "https://rsshub.app/zhihu/daily",
    name: "知乎日报",
    language: "zh",
    category: "general",
    description: "Daily curated content from Zhihu",
    fullContent: true,
  },
  {
    url: "https://rsshub.app/sspai/matrix",
    name: "少数派 Matrix",
    language: "zh",
    category: "tech",
    description: "Tech articles from SSPAI",
    fullContent: true,
  },
  {
    url: "https://rsshub.app/36kr/newsflashes",
    name: "36氪快讯",
    language: "zh",
    category: "tech",
    description: "Tech news from 36Kr",
    fullContent: false,
  },
  {
    url: "https://rsshub.app/infzm/news",
    name: "南方周末",
    language: "zh",
    category: "news",
    description: "News from Southern Weekly",
    fullContent: false,
  },
];

/**
 * RSSHub mirror instances (fallback when main instance is unavailable)
 */
export const RSSHUB_INSTANCES = [
  "https://rsshub.app",
  "https://rsshub.rssforever.com",
  "https://hub.slarker.me",
  "https://rsshub.feeded.xyz",
] as const;

/**
 * Get all default feeds
 */
export function getAllDefaultFeeds(): DefaultFeed[] {
  return [...ENGLISH_FEEDS, ...CHINESE_FEEDS];
}

/**
 * Get feeds by language
 */
export function getFeedsByLanguage(language: DefaultFeed["language"]): DefaultFeed[] {
  return getAllDefaultFeeds().filter((f) => f.language === language);
}

/**
 * Get feeds by category
 */
export function getFeedsByCategory(category: DefaultFeed["category"]): DefaultFeed[] {
  return getAllDefaultFeeds().filter((f) => f.category === category);
}

/**
 * Convert RSSHub path to use a different instance
 */
export function switchRSSHubInstance(url: string, newInstance: string): string {
  for (const instance of RSSHUB_INSTANCES) {
    if (url.startsWith(instance)) {
      return url.replace(instance, newInstance);
    }
  }
  return url;
}

/**
 * Check if a URL is an RSSHub feed
 */
export function isRSSHubFeed(url: string): boolean {
  return RSSHUB_INSTANCES.some((instance) => url.startsWith(instance));
}
