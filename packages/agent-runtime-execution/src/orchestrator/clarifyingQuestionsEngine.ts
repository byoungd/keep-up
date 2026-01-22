/**
 * Clarifying Questions Engine
 *
 * Generates and manages clarifying questions before plan creation.
 * Inspired by Cursor 2.1's interactive clarifying questions feature.
 *
 * The engine:
 * 1. Analyzes user requests for ambiguity
 * 2. Generates targeted questions based on request type
 * 3. Tracks answered questions and provides context
 * 4. Supports blocking (must answer) and optional questions
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Category of clarifying question.
 */
export type QuestionCategory =
  | "scope" // What should be included/excluded
  | "requirements" // Specific requirements and constraints
  | "constraints" // Technical or business constraints
  | "preferences" // User preferences (e.g., patterns, naming)
  | "architecture" // Design and architecture decisions
  | "testing" // Testing requirements
  | "dependencies"; // External dependencies and integrations

/**
 * Priority level for a question.
 */
export type QuestionPriority =
  | "blocking" // Must be answered before proceeding
  | "important" // Should be answered for better plans
  | "nice-to-have"; // Optional, may improve plan

/**
 * A clarifying question to ask the user.
 */
export interface ClarifyingQuestion {
  /** Unique question ID */
  id: string;

  /** The question text */
  question: string;

  /** Category of the question */
  category: QuestionCategory;

  /** Priority level */
  priority: QuestionPriority;

  /** Suggested answers (if applicable) */
  suggestions?: string[];

  /** User's answer (populated when answered) */
  answer?: string;

  /** Timestamp when answered */
  answeredAt?: number;

  /** Why this question is being asked */
  rationale?: string;

  /** Follow-up question IDs (asked after this is answered) */
  followUps?: string[];
}

/**
 * Question template for generating questions based on request patterns.
 */
export interface QuestionTemplate {
  /** Pattern to match in user request */
  pattern: RegExp;

  /** Questions to generate when pattern matches */
  questions: Array<Omit<ClarifyingQuestion, "id" | "answer" | "answeredAt">>;
}

/**
 * Configuration for the clarifying questions engine.
 */
export interface ClarifyingQuestionsConfig {
  /** Maximum questions to generate */
  maxQuestions: number;

  /** Maximum blocking questions */
  maxBlockingQuestions: number;

  /** Include suggestions in questions */
  includeSuggestions: boolean;

  /** Custom question templates */
  customTemplates?: QuestionTemplate[];
}

export const DEFAULT_CLARIFYING_CONFIG: ClarifyingQuestionsConfig = {
  maxQuestions: 5,
  maxBlockingQuestions: 2,
  includeSuggestions: true,
};

// ============================================================================
// Built-in Question Templates
// ============================================================================

const BUILTIN_TEMPLATES: QuestionTemplate[] = [
  // API/Feature scope
  {
    pattern: /\b(add|create|implement|build)\b.*\b(api|endpoint|feature|function)\b/i,
    questions: [
      {
        category: "scope",
        priority: "blocking",
        question: "What specific endpoints or operations should this API support?",
        rationale: "Need to understand the scope of the API to plan implementation",
      },
      {
        category: "requirements",
        priority: "important",
        question: "Are there any authentication or authorization requirements?",
        suggestions: ["JWT tokens", "API keys", "OAuth", "No auth required"],
      },
    ],
  },

  // Refactoring
  {
    pattern: /\b(refactor|restructure|reorganize|clean up)\b/i,
    questions: [
      {
        category: "scope",
        priority: "blocking",
        question: "Which specific files or components should be refactored?",
        rationale: "Need to scope the refactoring effort",
      },
      {
        category: "constraints",
        priority: "important",
        question: "Should the refactoring maintain backward compatibility?",
        suggestions: ["Yes, full compatibility", "No, breaking changes are OK"],
      },
    ],
  },

  // Testing
  {
    pattern: /\b(test|testing|tests|spec)\b/i,
    questions: [
      {
        category: "testing",
        priority: "important",
        question: "What type of tests should be written?",
        suggestions: ["Unit tests", "Integration tests", "E2E tests", "All of the above"],
      },
      {
        category: "preferences",
        priority: "nice-to-have",
        question: "Any specific testing patterns or frameworks to follow?",
      },
    ],
  },

  // Bug fixes
  {
    pattern: /\b(fix|bug|error|issue|broken)\b/i,
    questions: [
      {
        category: "requirements",
        priority: "blocking",
        question: "Can you describe how to reproduce the issue?",
        rationale: "Reproduction steps are essential for debugging",
      },
      {
        category: "requirements",
        priority: "important",
        question: "What is the expected behavior after the fix?",
      },
    ],
  },

  // Database/Migration
  {
    pattern: /\b(database|db|migration|schema|table)\b/i,
    questions: [
      {
        category: "constraints",
        priority: "blocking",
        question: "Is there existing data that needs to be migrated?",
        suggestions: ["Yes, data migration needed", "No, fresh schema"],
      },
      {
        category: "architecture",
        priority: "important",
        question: "Should the changes support rollback?",
      },
    ],
  },

  // Multiple files/components
  {
    pattern: /\b(multiple|several|across|many)\b.*\b(files?|components?|modules?)\b/i,
    questions: [
      {
        category: "scope",
        priority: "important",
        question: "Which specific files or directories are involved?",
      },
      {
        category: "constraints",
        priority: "nice-to-have",
        question: "Are there any files that should NOT be modified?",
      },
    ],
  },
];

// ============================================================================
// Clarifying Questions Engine
// ============================================================================

/**
 * Engine for generating and managing clarifying questions.
 */
export class ClarifyingQuestionsEngineImpl implements ClarifyingQuestionsEngine {
  private readonly config: ClarifyingQuestionsConfig;
  private readonly templates: QuestionTemplate[];
  private questions: Map<string, ClarifyingQuestion> = new Map();

  constructor(config: Partial<ClarifyingQuestionsConfig> = {}) {
    this.config = { ...DEFAULT_CLARIFYING_CONFIG, ...config };
    this.templates = [...BUILTIN_TEMPLATES, ...(config.customTemplates ?? [])];
  }

  /**
   * Generate questions based on user request.
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Template pattern matching requires nested loops
  async generateQuestions(userRequest: string): Promise<ClarifyingQuestion[]> {
    this.questions.clear();

    const generatedQuestions: ClarifyingQuestion[] = [];
    let blockingCount = 0;

    // Match templates against request
    for (const template of this.templates) {
      if (template.pattern.test(userRequest)) {
        for (const q of template.questions) {
          // Respect limits
          if (generatedQuestions.length >= this.config.maxQuestions) {
            break;
          }
          if (q.priority === "blocking" && blockingCount >= this.config.maxBlockingQuestions) {
            continue;
          }

          const question: ClarifyingQuestion = {
            ...q,
            id: crypto.randomUUID(),
            suggestions: this.config.includeSuggestions ? q.suggestions : undefined,
          };

          if (q.priority === "blocking") {
            blockingCount++;
          }

          generatedQuestions.push(question);
          this.questions.set(question.id, question);
        }
      }

      if (generatedQuestions.length >= this.config.maxQuestions) {
        break;
      }
    }

    // Add generic questions if no templates matched
    if (generatedQuestions.length === 0) {
      const genericQuestion: ClarifyingQuestion = {
        id: crypto.randomUUID(),
        category: "scope",
        priority: "important",
        question: "Could you provide more details about what you'd like to accomplish?",
        rationale: "The request is brief; more context would help create a better plan",
      };
      generatedQuestions.push(genericQuestion);
      this.questions.set(genericQuestion.id, genericQuestion);
    }

    return generatedQuestions;
  }

  /**
   * Update a question with the user's answer.
   */
  updateAnswer(questionId: string, answer: string): void {
    const question = this.questions.get(questionId);
    if (question) {
      question.answer = answer;
      question.answeredAt = Date.now();
    }
  }

  /**
   * Check if there are unanswered blocking questions.
   */
  hasBlockingUnanswered(): boolean {
    for (const q of this.questions.values()) {
      if (q.priority === "blocking" && !q.answer) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get formatted Q&A context for plan generation.
   */
  getContext(): string {
    const answered = Array.from(this.questions.values()).filter((q) => q.answer);

    if (answered.length === 0) {
      return "";
    }

    const lines = ["## Clarifications"];
    for (const q of answered) {
      lines.push("");
      lines.push(`**Q:** ${q.question}`);
      lines.push(`**A:** ${q.answer}`);
    }

    return lines.join("\n");
  }

  /**
   * Get all questions.
   */
  getQuestions(): ClarifyingQuestion[] {
    return Array.from(this.questions.values());
  }

  /**
   * Get a specific question by ID.
   */
  getQuestion(id: string): ClarifyingQuestion | undefined {
    return this.questions.get(id);
  }

  /**
   * Clear all questions.
   */
  clear(): void {
    this.questions.clear();
  }
}

/**
 * Interface for clarifying questions engine.
 */
export interface ClarifyingQuestionsEngine {
  generateQuestions(userRequest: string): Promise<ClarifyingQuestion[]>;
  updateAnswer(questionId: string, answer: string): void;
  hasBlockingUnanswered(): boolean;
  getContext(): string;
  getQuestions(): ClarifyingQuestion[];
  getQuestion(id: string): ClarifyingQuestion | undefined;
  clear(): void;
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a clarifying questions engine.
 */
export function createClarifyingQuestionsEngine(
  config?: Partial<ClarifyingQuestionsConfig>
): ClarifyingQuestionsEngine {
  return new ClarifyingQuestionsEngineImpl(config);
}
