export function parseJsonFromText<T>(text: string): T {
  const jsonText = extractJsonPayload(text);
  return JSON.parse(jsonText) as T;
}

function extractJsonPayload(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return trimmed;
  }

  const objectStart = trimmed.indexOf("{");
  const arrayStart = trimmed.indexOf("[");
  const start = pickStartIndex(objectStart, arrayStart);
  if (start === -1) {
    throw new Error("No JSON payload found in response");
  }

  const isObject = trimmed[start] === "{";
  const end = trimmed.lastIndexOf(isObject ? "}" : "]");
  if (end === -1 || end <= start) {
    throw new Error("Incomplete JSON payload in response");
  }

  return trimmed.slice(start, end + 1);
}

function pickStartIndex(objectStart: number, arrayStart: number): number {
  if (objectStart === -1) {
    return arrayStart;
  }
  if (arrayStart === -1) {
    return objectStart;
  }
  return Math.min(objectStart, arrayStart);
}
