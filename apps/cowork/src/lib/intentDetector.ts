/**
 * Intent Detector
 * Auto-detects whether user input is a task request or simple chat
 */

export type Intent = "task" | "chat";

export interface IntentResult {
  intent: Intent;
  confidence: "high" | "medium" | "low";
  reason: string;
}

// Action verbs that indicate task intent (Chinese)
const TASK_PATTERNS_ZH = [
  /^(帮我|请|能不能|可以|麻烦).*(创建|写|改|修|删|生成|实现|添加|移除|更新|重构)/,
  /^(创建|写|改|修改|删除|生成|实现|添加|移除|更新|重构|修复|优化)/,
];

// Action verbs that indicate task intent (English)
const TASK_PATTERNS_EN = [
  /^(create|make|build|fix|refactor|implement|write|delete|update|add|remove|rename|move)\s/i,
  /^(please|can you|could you).*(create|make|build|fix|refactor|implement|write|delete|update)/i,
];

// Patterns that indicate chat/question intent
const CHAT_PATTERNS = [
  /^(hi|hello|hey|你好|嗨|早上好|晚上好)/i,
  /^(what|who|where|when|why|how|which|什么|谁|哪|何时|为什么|怎么|如何)/i,
  /\?$/, // Ends with question mark
  /^(explain|tell me|describe|show me|解释|告诉我|描述|说明)/i,
];

/**
 * Detect intent from user input
 * @param input User input text
 * @returns Intent result with confidence
 */
export function detectIntent(input: string): IntentResult {
  const trimmed = input.trim();

  if (!trimmed) {
    return { intent: "chat", confidence: "high", reason: "empty input" };
  }

  // Check for explicit chat patterns first
  for (const pattern of CHAT_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { intent: "chat", confidence: "high", reason: "matches chat pattern" };
    }
  }

  // Check for task patterns (Chinese)
  for (const pattern of TASK_PATTERNS_ZH) {
    if (pattern.test(trimmed)) {
      return { intent: "task", confidence: "high", reason: "matches Chinese task pattern" };
    }
  }

  // Check for task patterns (English)
  for (const pattern of TASK_PATTERNS_EN) {
    if (pattern.test(trimmed)) {
      return { intent: "task", confidence: "high", reason: "matches English task pattern" };
    }
  }

  // Short messages are likely chat
  if (trimmed.length < 20) {
    return { intent: "chat", confidence: "medium", reason: "short message" };
  }

  // Default to chat with low confidence (conservative approach)
  return { intent: "chat", confidence: "low", reason: "no clear pattern matched" };
}

/**
 * Check if we should prompt the user to confirm task creation
 * Only prompt when intent is medium/low confidence task
 */
export function shouldPromptForTask(result: IntentResult): boolean {
  return result.intent === "task" && result.confidence !== "high";
}
