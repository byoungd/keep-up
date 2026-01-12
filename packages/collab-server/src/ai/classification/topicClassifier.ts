/**
 * Topic Classifier (Auto-Tagging)
 *
 * Automatically tags incoming content items with topic labels.
 * Uses a combination of keyword matching and LLM-based classification.
 *
 * Track 2: Intelligence & Logic (AI) - P2
 */

import type { ContentItem } from "../digest/types";
import type { AIGateway, AIRequestOptions } from "../gateway";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Classification result for a content item */
export interface ClassificationResult {
  /** Content item ID */
  itemId: string;
  /** Assigned topics */
  topics: TopicAssignment[];
  /** Classification method used */
  method: "keyword" | "llm" | "hybrid";
  /** Processing time in ms */
  processingTimeMs: number;
}

/** Topic assignment with confidence */
export interface TopicAssignment {
  /** Topic ID */
  id: string;
  /** Topic display name */
  name: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Source of assignment */
  source: "keyword" | "llm";
}

/** Topic definition */
export interface TopicDefinition {
  /** Unique topic ID */
  id: string;
  /** Display name */
  name: string;
  /** Keywords for matching */
  keywords: string[];
  /** Description for LLM context */
  description?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

export interface TopicClassifierConfig {
  /** Minimum keyword matches for assignment */
  minKeywordMatches: number;
  /** Minimum confidence for LLM assignment */
  minLLMConfidence: number;
  /** Maximum topics per item */
  maxTopicsPerItem: number;
  /** Whether to use LLM for classification */
  useLLMClassification: boolean;
  /** Fallback to keyword-only if LLM fails */
  fallbackToKeyword: boolean;
}

const DEFAULT_CONFIG: TopicClassifierConfig = {
  minKeywordMatches: 2,
  minLLMConfidence: 0.7,
  maxTopicsPerItem: 5,
  useLLMClassification: true,
  fallbackToKeyword: true,
};

// ─────────────────────────────────────────────────────────────────────────────
// Default Topics
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_TOPICS: TopicDefinition[] = [
  {
    id: "tech",
    name: "Technology",
    keywords: [
      "technology",
      "software",
      "hardware",
      "programming",
      "code",
      "developer",
      "app",
      "startup",
      "tech",
    ],
    description: "Technology news, software development, hardware, and startups",
  },
  {
    id: "ai",
    name: "AI & Machine Learning",
    keywords: [
      "ai",
      "artificial intelligence",
      "machine learning",
      "deep learning",
      "neural",
      "llm",
      "gpt",
      "model",
    ],
    description: "Artificial intelligence, machine learning, and related research",
  },
  {
    id: "business",
    name: "Business",
    keywords: [
      "business",
      "company",
      "market",
      "investment",
      "funding",
      "revenue",
      "growth",
      "acquisition",
    ],
    description: "Business news, markets, investments, and corporate updates",
  },
  {
    id: "science",
    name: "Science",
    keywords: [
      "science",
      "research",
      "study",
      "discovery",
      "experiment",
      "scientist",
      "physics",
      "biology",
    ],
    description: "Scientific research, discoveries, and academic studies",
  },
  {
    id: "design",
    name: "Design & UX",
    keywords: [
      "design",
      "ux",
      "ui",
      "user experience",
      "interface",
      "visual",
      "typography",
      "layout",
    ],
    description: "Design, user experience, interfaces, and visual design",
  },
  {
    id: "security",
    name: "Security",
    keywords: [
      "security",
      "privacy",
      "hack",
      "breach",
      "vulnerability",
      "encryption",
      "cyber",
      "attack",
    ],
    description: "Cybersecurity, privacy, and security-related news",
  },
  {
    id: "culture",
    name: "Culture",
    keywords: ["culture", "art", "music", "film", "book", "entertainment", "media", "social"],
    description: "Culture, arts, entertainment, and social trends",
  },
  {
    id: "health",
    name: "Health",
    keywords: [
      "health",
      "medical",
      "medicine",
      "disease",
      "treatment",
      "mental health",
      "wellness",
      "fitness",
    ],
    description: "Health, medicine, wellness, and fitness",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Topic Classifier
// ─────────────────────────────────────────────────────────────────────────────

export class TopicClassifier {
  private readonly config: TopicClassifierConfig;
  private readonly gateway: AIGateway;
  private readonly topics: TopicDefinition[];

  constructor(
    gateway: AIGateway,
    topics: TopicDefinition[] = DEFAULT_TOPICS,
    config: Partial<TopicClassifierConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.gateway = gateway;
    this.topics = topics;
  }

  /**
   * Classify a content item and assign topics.
   */
  async classify(item: ContentItem, options: AIRequestOptions): Promise<ClassificationResult> {
    const startTime = Date.now();

    // Step 1: Keyword-based classification
    const keywordTopics = this.classifyByKeywords(item);

    // Step 2: LLM-based classification (if enabled and needed)
    let llmTopics: TopicAssignment[] = [];
    let method: ClassificationResult["method"] = "keyword";

    if (this.config.useLLMClassification && keywordTopics.length < 2) {
      try {
        llmTopics = await this.classifyByLLM(item, options);
        method = keywordTopics.length > 0 ? "hybrid" : "llm";
      } catch (error) {
        console.warn("[TopicClassifier] LLM classification failed:", error);
        if (!this.config.fallbackToKeyword) {
          throw error;
        }
      }
    }

    // Step 3: Merge and deduplicate topics
    const allTopics = this.mergeTopics(keywordTopics, llmTopics);

    // Step 4: Limit to max topics
    const finalTopics = allTopics
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, this.config.maxTopicsPerItem);

    return {
      itemId: item.id,
      topics: finalTopics,
      method,
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Batch classify multiple items.
   */
  async classifyBatch(
    items: ContentItem[],
    options: AIRequestOptions
  ): Promise<Map<string, ClassificationResult>> {
    const results = new Map<string, ClassificationResult>();

    // Process in parallel with concurrency limit
    const batchSize = 5;
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map((item) => this.classify(item, options)));

      for (const result of batchResults) {
        results.set(result.itemId, result);
      }
    }

    return results;
  }

  /**
   * Get available topics.
   */
  getTopics(): TopicDefinition[] {
    return [...this.topics];
  }

  /**
   * Add a custom topic.
   */
  addTopic(topic: TopicDefinition): void {
    const existing = this.topics.findIndex((t) => t.id === topic.id);
    if (existing >= 0) {
      this.topics[existing] = topic;
    } else {
      this.topics.push(topic);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Internal Methods
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Classify using keyword matching.
   */
  private classifyByKeywords(item: ContentItem): TopicAssignment[] {
    const text = `${item.title} ${item.content}`.toLowerCase();
    const assignments: TopicAssignment[] = [];

    for (const topic of this.topics) {
      let matchCount = 0;
      const matchedKeywords: string[] = [];

      for (const keyword of topic.keywords) {
        // Use word boundary matching for better accuracy
        const regex = new RegExp(`\\b${this.escapeRegex(keyword)}\\b`, "gi");
        const matches = text.match(regex);
        if (matches) {
          matchCount += matches.length;
          matchedKeywords.push(keyword);
        }
      }

      if (matchCount >= this.config.minKeywordMatches) {
        // Calculate confidence based on match density
        const confidence = Math.min(0.9, 0.5 + matchCount / 10);

        assignments.push({
          id: topic.id,
          name: topic.name,
          confidence,
          source: "keyword",
        });
      }
    }

    return assignments;
  }

  /**
   * Classify using LLM with structured output parsing.
   */
  private async classifyByLLM(
    item: ContentItem,
    options: AIRequestOptions
  ): Promise<TopicAssignment[]> {
    // Build topic list for prompt
    const topicList = this.topics
      .map((t) => `- ${t.id}: ${t.name} - ${t.description || t.keywords.slice(0, 5).join(", ")}`)
      .join("\n");

    const systemPrompt = `You are a content classification expert. Your task is to classify content into relevant topics with confidence scores.

Rules:
1. Only assign topics from the provided list
2. Confidence scores should be between 0.0 and 1.0
3. Only include topics with confidence >= 0.6
4. Limit to top 5 most relevant topics
5. Return ONLY valid JSON - no other text

Output Format (JSON array):
[{"id": "topic_id", "confidence": 0.85}, ...]`;

    const userPrompt = `Available Topics:
${topicList}

Classify this content:
Title: ${item.title}
Content: ${item.content.slice(0, 1500)}

Return ONLY a JSON array of topic assignments.`;

    try {
      const response = await this.gateway.complete(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        {
          ...options,
          temperature: 0.3, // Low temperature for consistent classification
          maxTokens: 500,
        }
      );

      // Parse the response
      return this.parseLLMResponse(response.content);
    } catch (error) {
      console.error("[TopicClassifier] LLM classification error:", error);
      throw error;
    }
  }

  /**
   * Parse LLM response into topic assignments.
   */
  private parseLLMResponse(response: string): TopicAssignment[] {
    const assignments: TopicAssignment[] = [];

    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        // Fallback: try to parse as line-based format
        return this.parseLegacyFormat(response);
      }

      const parsed = JSON.parse(jsonMatch[0]) as Array<{
        id?: string;
        name?: string;
        confidence?: number;
      }>;

      for (const entry of parsed) {
        const topicId = entry.id ?? this.findTopicIdByName(entry.name ?? "");
        if (!topicId) {
          continue;
        }

        const topic = this.topics.find((t) => t.id === topicId);
        if (!topic) {
          continue;
        }

        const confidence = entry.confidence ?? 0.7;
        if (confidence < this.config.minLLMConfidence) {
          continue;
        }

        assignments.push({
          id: topic.id,
          name: topic.name,
          confidence: Math.min(1, Math.max(0, confidence)),
          source: "llm",
        });
      }
    } catch (error) {
      console.warn("[TopicClassifier] Failed to parse LLM response:", error);
      return this.parseLegacyFormat(response);
    }

    return assignments;
  }

  /**
   * Parse legacy line-based format (TopicName: confidence).
   */
  private parseLegacyFormat(response: string): TopicAssignment[] {
    const assignments: TopicAssignment[] = [];
    const lines = response.split("\n");

    for (const line of lines) {
      const match = line.match(/^(.+?):\s*([\d.]+)/);
      if (!match) {
        continue;
      }

      const [, nameOrId, confidenceStr] = match;
      const confidence = Number.parseFloat(confidenceStr);

      if (Number.isNaN(confidence) || confidence < this.config.minLLMConfidence) {
        continue;
      }

      // Find topic by name or ID
      const topicId = this.findTopicIdByName(nameOrId.trim());
      const topic = this.topics.find((t) => t.id === topicId);

      if (topic) {
        assignments.push({
          id: topic.id,
          name: topic.name,
          confidence: Math.min(1, Math.max(0, confidence)),
          source: "llm",
        });
      }
    }

    return assignments;
  }

  /**
   * Find topic ID by name (case-insensitive).
   */
  private findTopicIdByName(name: string): string | null {
    const normalized = name.toLowerCase().trim();

    // Try exact match first
    for (const topic of this.topics) {
      if (topic.id.toLowerCase() === normalized || topic.name.toLowerCase() === normalized) {
        return topic.id;
      }
    }

    // Try partial match
    for (const topic of this.topics) {
      if (
        topic.name.toLowerCase().includes(normalized) ||
        normalized.includes(topic.name.toLowerCase())
      ) {
        return topic.id;
      }
    }

    return null;
  }

  /**
   * Merge keyword and LLM topic assignments.
   */
  private mergeTopics(
    keywordTopics: TopicAssignment[],
    llmTopics: TopicAssignment[]
  ): TopicAssignment[] {
    const merged = new Map<string, TopicAssignment>();

    // Add keyword topics first
    for (const topic of keywordTopics) {
      merged.set(topic.id, topic);
    }

    // Add or update with LLM topics
    for (const topic of llmTopics) {
      const existing = merged.get(topic.id);
      if (existing) {
        // Average the confidence if both methods agree
        merged.set(topic.id, {
          ...existing,
          confidence: (existing.confidence + topic.confidence) / 2,
          source: "keyword", // Keyword takes precedence
        });
      } else if (topic.confidence >= this.config.minLLMConfidence) {
        merged.set(topic.id, topic);
      }
    }

    return Array.from(merged.values());
  }

  /**
   * Escape regex special characters.
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
