export type CoworkRequestOptions = RequestInit & { baseUrl?: string };

export function resolveCoworkBaseUrl(override?: string): string {
  if (override?.trim()) {
    return override.trim();
  }
  const env =
    process.env.KEEPUP_COWORK_URL ??
    process.env.KEEPUP_GATEWAY_URL ??
    process.env.COWORK_BASE_URL ??
    process.env.COWORK_URL;
  return env?.trim() ? env.trim() : "http://localhost:3000";
}

export async function fetchCoworkJson<T>(
  path: string,
  options: CoworkRequestOptions = {}
): Promise<T> {
  const baseUrl = resolveCoworkBaseUrl(options.baseUrl);
  const url = new URL(path, baseUrl);
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const errorMessage =
      data && typeof data === "object" && "error" in data
        ? String((data as { error?: string }).error ?? response.statusText)
        : response.statusText;
    throw new Error(errorMessage);
  }

  if (data && typeof data === "object" && "ok" in data && (data as { ok?: boolean }).ok === false) {
    const errorMessage =
      "error" in data
        ? String((data as { error?: string }).error ?? "Request failed")
        : "Request failed";
    throw new Error(errorMessage);
  }

  return data as T;
}
