import { TokenTracker } from "@ku0/ai-core";

const DEFAULT_MODEL = "gpt-4o";
const tracker = new TokenTracker();

export function countTokens(text: string, model: string = DEFAULT_MODEL): number {
  if (!text) {
    return 0;
  }
  return tracker.countTokens(text, model);
}
