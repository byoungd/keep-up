/**
 * Default Message Summarizer
 *
 * Implements context-aware summarization of conversation history using the LLM.
 */

import type { AgentMessage } from "../types";
import type { ISummarizer } from "./messageCompression";
import type { IAgentLLM } from "./orchestrator";

/**
 * Standard summarizer that uses the agent's own LLM to compress context.
 */
export class DefaultSummarizer implements ISummarizer {
  private readonly llm: IAgentLLM;
  private readonly systemPrompt: string;

  constructor(
    llm: IAgentLLM,
    systemPrompt = "You are an expert summarizer. Provide a concise summary of the conversation history provided, preserving all critical context, technical decisions, and current state. The summary will be used as context for the next turn."
  ) {
    this.llm = llm;
    this.systemPrompt = systemPrompt;
  }

  async summarize(messages: AgentMessage[]): Promise<string> {
    if (messages.length === 0) {
      return "";
    }

    const response = await this.llm.complete({
      messages: [
        {
          role: "system",
          content: this.systemPrompt,
        },
        {
          role: "user",
          content: `Please summarize the following conversation history:\n\n${this.formatMessages(messages)}`,
        },
      ],
      tools: [],
      temperature: 0.3, // Lower temperature for more stable summaries
    });

    return response.content ?? "Could not generate summary.";
  }

  private formatMessages(messages: AgentMessage[]): string {
    return messages
      .map((msg) => {
        let content = "";
        if ("content" in msg) {
          content = msg.content;
        } else if (msg.role === "tool" && msg.result) {
          content = `[Tool Result: ${JSON.stringify(msg.result)}]`;
        }
        return `[${msg.role.toUpperCase()}]: ${content}`;
      })
      .join("\n\n");
  }
}

/**
 * Create a new default summarizer.
 */
export function createDefaultSummarizer(llm: IAgentLLM, systemPrompt?: string): DefaultSummarizer {
  return new DefaultSummarizer(llm, systemPrompt);
}
