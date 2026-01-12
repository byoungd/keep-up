export type ChatMessage = { role: "user" | "assistant"; content: string };

type BuildContextOptions = {
  prompt: string;
  context?: string;
  history?: ChatMessage[];
  maxMessages?: number;
  charBudget?: number;
  minUserChars?: number;
};

type BuildContextResult = {
  messages: ChatMessage[];
  trimmedHistory: number;
  appliedContext: boolean;
  inputLength: number;
};

const DEFAULT_MAX_MESSAGES = 12;
const DEFAULT_CHAR_BUDGET = 12_000;
const DEFAULT_MIN_USER_CHARS = 2000;

function approximateLength(parts: string[]): number {
  return parts.reduce((sum, part) => sum + part.length, 0);
}

function clampHistory(
  history: ChatMessage[],
  maxMessages: number,
  charBudget: number
): ChatMessage[] {
  const safeMax = Math.max(1, maxMessages);
  const sliced = history.slice(-safeMax);
  const result: ChatMessage[] = [];
  let remaining = Math.max(charBudget, 0);

  for (let i = sliced.length - 1; i >= 0; i -= 1) {
    const candidate = sliced[i];
    const length = candidate.content.length;
    if (length <= remaining) {
      result.unshift(candidate);
      remaining -= length;
      continue;
    }

    if (remaining <= 0) {
      break;
    }

    const truncated = candidate.content.slice(-remaining);
    result.unshift({ ...candidate, content: truncated });
    remaining = 0;
    break;
  }

  return result;
}

function clampUserContent(content: string, maxChars: number): string {
  if (maxChars <= 0) {
    return "";
  }
  if (content.length <= maxChars) {
    return content;
  }
  return content.slice(-maxChars);
}

export function buildChatMessages(options: BuildContextOptions): BuildContextResult {
  const maxMessages = options.maxMessages ?? DEFAULT_MAX_MESSAGES;
  const charBudget = options.charBudget ?? DEFAULT_CHAR_BUDGET;
  const minUserChars = Math.min(options.minUserChars ?? DEFAULT_MIN_USER_CHARS, charBudget);
  const history = options.history ?? [];
  const historyLength = history.length;

  const historyBudget = Math.max(charBudget - minUserChars, 0);
  const trimmedHistory = clampHistory(history, maxMessages, historyBudget);
  const appliedContext = Boolean(options.context && options.context.trim().length > 0);
  const userContentRaw = appliedContext
    ? `Context: ${options.context}\n\nTask: ${options.prompt}`
    : options.prompt;
  const remainingForUser = Math.max(
    charBudget - approximateLength(trimmedHistory.map((m) => m.content)),
    0
  );
  const userContent = clampUserContent(userContentRaw, remainingForUser);

  const messages: ChatMessage[] = [...trimmedHistory, { role: "user", content: userContent }];
  const inputLength = approximateLength(messages.map((m) => m.content));

  return {
    messages,
    trimmedHistory: Math.max(0, historyLength - trimmedHistory.length),
    appliedContext,
    inputLength,
  };
}
