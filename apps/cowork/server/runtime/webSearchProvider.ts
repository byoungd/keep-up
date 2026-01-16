import type {
  IWebSearchProvider,
  WebFetchResult,
  WebSearchOptions,
  WebSearchResult,
} from "@ku0/agent-runtime";

const SERPER_ENDPOINT = "https://google.serper.dev/search";
const MAX_FETCH_CHARS = 20000;

type SerperResult = {
  title?: string;
  link?: string;
  snippet?: string;
  date?: string;
};

type SerperResponse = {
  organic?: SerperResult[];
  news?: SerperResult[];
};

export function createWebSearchProvider(logger?: Pick<Console, "warn">): IWebSearchProvider {
  const apiKey = process.env.SERPER_API_KEY ?? process.env.SERPER_KEY;
  const endpoint = process.env.SERPER_API_URL ?? SERPER_ENDPOINT;
  if (!apiKey) {
    logger?.warn?.("Web search disabled: missing SERPER_API_KEY.");
    return new UnavailableWebSearchProvider();
  }
  return new SerperWebSearchProvider(apiKey, endpoint);
}

class UnavailableWebSearchProvider implements IWebSearchProvider {
  readonly name = "unavailable";

  async search(): Promise<WebSearchResult[]> {
    throw new Error("Web search is not configured. Set SERPER_API_KEY to enable.");
  }

  async fetch(): Promise<WebFetchResult> {
    throw new Error("Web fetch is not configured. Set SERPER_API_KEY to enable.");
  }
}

class SerperWebSearchProvider implements IWebSearchProvider {
  readonly name = "serper";
  private readonly apiKey: string;
  private readonly endpoint: string;

  constructor(apiKey: string, endpoint: string) {
    this.apiKey = apiKey;
    this.endpoint = endpoint;
  }

  async search(query: string, options?: WebSearchOptions): Promise<WebSearchResult[]> {
    const body: Record<string, unknown> = {
      q: query,
      num: options?.maxResults ?? 6,
    };

    const freshness = options?.freshness;
    if (freshness) {
      body.tbs = `qdr:${mapFreshness(freshness)}`;
    }

    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": this.apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Serper API error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as SerperResponse;
    const rawResults = [...(data.organic ?? []), ...(data.news ?? [])];
    const mapped = rawResults
      .map((result) => mapSerperResult(result))
      .filter((result): result is WebSearchResult => result !== null);

    return applyDomainFilters(mapped, options);
  }

  async fetch(url: string): Promise<WebFetchResult> {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "KeepUp Cowork/1.0",
      },
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Fetch failed (${response.status}): ${errorText}`);
    }

    const contentType = response.headers.get("content-type") ?? "text/plain";
    const raw = await response.text();
    const content = normalizeContent(raw, contentType);

    return {
      url,
      title: extractTitle(raw) ?? url,
      content,
      contentType,
    };
  }
}

function mapFreshness(freshness: NonNullable<WebSearchOptions["freshness"]>): string {
  switch (freshness) {
    case "day":
      return "d";
    case "week":
      return "w";
    case "month":
      return "m";
    case "year":
      return "y";
    default:
      return "m";
  }
}

function mapSerperResult(result: SerperResult): WebSearchResult | null {
  if (!result.link || !result.title) {
    return null;
  }
  return {
    title: result.title,
    url: result.link,
    snippet: result.snippet ?? "",
    publishedDate: result.date,
  };
}

function applyDomainFilters(
  results: WebSearchResult[],
  options?: WebSearchOptions
): WebSearchResult[] {
  const allowed = options?.allowedDomains?.map((domain) => domain.toLowerCase());
  const blocked = options?.blockedDomains?.map((domain) => domain.toLowerCase());

  return results.filter((result) => {
    try {
      const host = new URL(result.url).hostname.toLowerCase();
      if (allowed && allowed.length > 0 && !allowed.some((domain) => host.includes(domain))) {
        return false;
      }
      if (blocked?.some((domain) => host.includes(domain))) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  });
}

function normalizeContent(raw: string, contentType: string): string {
  const trimmed = raw.length > MAX_FETCH_CHARS ? raw.slice(0, MAX_FETCH_CHARS) : raw;
  if (contentType.includes("text/html")) {
    return stripHtml(trimmed);
  }
  return trimmed;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title>([^<]+)<\/title>/i);
  if (!match) {
    return null;
  }
  return match[1]?.trim() ?? null;
}
