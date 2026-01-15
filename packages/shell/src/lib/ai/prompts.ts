export interface AIPrompt {
  id: string;
  label: string;
  description: string;
  systemPrompt?: string; // Optional override for system prompt
  userPromptTemplate: string; // Template with {{context}} and {{input}}
  icon?: string; // Icon name for UI
}

export const AI_PROMPTS: AIPrompt[] = [
  {
    id: "explain",
    label: "Explain",
    description: "Explain the text in simple terms",
    userPromptTemplate:
      "Explain the following text in simple terms suitable for a language learner:\n\n{{context}}",
    icon: "BookOpen",
  },
  {
    id: "summarize",
    label: "Summarize",
    description: "Summarize the key points",
    userPromptTemplate: "Summarize the key points of the following text:\n\n{{context}}",
    icon: "FileText",
  },
  {
    id: "translate",
    label: "Translate",
    description: "Translate to user's native language",
    userPromptTemplate:
      "Translate the following text to the user's native language (assume matches their locale settings if known, otherwise infer):\n\n{{context}}",
    icon: "Languages",
  },
  {
    id: "grammar",
    label: "Analyze Grammar",
    description: "Break down the grammar and sentence structure",
    userPromptTemplate:
      "Analyze the grammar and sentence structure of the following text. Highlight any complex patterns, idioms, or phrasal verbs:\n\n{{context}}",
    icon: "Search",
  },
  {
    id: "vocabulary",
    label: "Extract Vocabulary",
    description: "List key vocabulary words with definitions",
    userPromptTemplate:
      "Extract the key vocabulary words from the following text. For each word, provide a definition, part of speech, and an example sentence:\n\n{{context}}",
    icon: "List",
  },
];

export function formatPrompt(prompt: AIPrompt, context: string, input?: string): string {
  let text = prompt.userPromptTemplate.replace("{{context}}", context);
  if (input) {
    text = text.replace("{{input}}", input);
  }
  return text;
}
