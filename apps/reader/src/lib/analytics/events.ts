/**
 * Analytics Event Dictionary
 *
 * Defines all trackable events in the application.
 * Events follow a consistent naming convention: {domain}_{action}_{result}
 */

import type { ErrorType } from "@/lib/errors";

/**
 * Content length buckets for analytics (avoids tracking exact lengths).
 */
export type ContentLengthBucket = "tiny" | "small" | "medium" | "large" | "huge";

/**
 * Get content length bucket from character count.
 */
export function getContentLengthBucket(length: number): ContentLengthBucket {
  if (length < 500) {
    return "tiny";
  }
  if (length < 2000) {
    return "small";
  }
  if (length < 10000) {
    return "medium";
  }
  if (length < 50000) {
    return "large";
  }
  return "huge";
}

/**
 * Name length buckets for analytics.
 */
export type NameLengthBucket = "short" | "medium" | "long";

/**
 * Get name length bucket from character count.
 */
export function getNameLengthBucket(length: number): NameLengthBucket {
  if (length < 20) {
    return "short";
  }
  if (length < 50) {
    return "medium";
  }
  return "long";
}

// ============================================================================
// Event Definitions
// ============================================================================

/**
 * Import events
 */
export type ImportSubmitClickedEvent = {
  name: "import_submit_clicked";
  sourceType: "paste" | "url" | "file";
};

export type ImportSucceededEvent = {
  name: "import_succeeded";
  sourceType: "paste" | "url" | "file";
  contentLengthBucket: ContentLengthBucket;
  durationMs: number;
};

export type ImportFailedEvent = {
  name: "import_failed";
  sourceType: "paste" | "url" | "file";
  errorType: ErrorType;
  code: string;
  retryable: boolean;
};

/**
 * Reader events
 */
export type ReaderOpenedEvent = {
  name: "reader_opened";
  entryPoint: "unread" | "library" | "projects" | "search" | "direct";
  hasContent: boolean;
};

/**
 * Projects events
 */
export type ProjectsPageViewedEvent = {
  name: "projects_page_viewed";
};

export type TopicCreatedEvent = {
  name: "topic_created";
  nameLengthBucket: NameLengthBucket;
};

export type TopicCreateFailedEvent = {
  name: "topic_create_failed";
  errorType: ErrorType;
  code: string;
};

/**
 * AI events
 */
export type AIQuestionAskedEvent = {
  name: "ai_question_asked";
  hasContext: boolean;
};

export type AIAnswerReturnedEvent = {
  name: "ai_answer_returned";
  hasContext: boolean;
  durationMs: number;
};

export type AIAnswerFailedEvent = {
  name: "ai_answer_failed";
  hasContext: boolean;
  errorType: ErrorType;
  code: string;
};

/**
 * Navigation events
 */
export type PageViewedEvent = {
  name: "page_viewed";
  page: string;
};

export type NotFoundViewedEvent = {
  name: "not_found_viewed";
  attemptedPath: string;
};

/**
 * Error events
 */
export type ErrorBoundaryTriggeredEvent = {
  name: "error_boundary_triggered";
  component?: string;
  errorType: ErrorType;
  code: string;
};

/**
 * Union of all analytics events.
 */
export type AnalyticsEvent =
  | ImportSubmitClickedEvent
  | ImportSucceededEvent
  | ImportFailedEvent
  | ReaderOpenedEvent
  | ProjectsPageViewedEvent
  | TopicCreatedEvent
  | TopicCreateFailedEvent
  | AIQuestionAskedEvent
  | AIAnswerReturnedEvent
  | AIAnswerFailedEvent
  | PageViewedEvent
  | NotFoundViewedEvent
  | ErrorBoundaryTriggeredEvent;

/**
 * Event names for type-safe access.
 */
export const EventNames = {
  // Import
  IMPORT_SUBMIT_CLICKED: "import_submit_clicked",
  IMPORT_SUCCEEDED: "import_succeeded",
  IMPORT_FAILED: "import_failed",

  // Reader
  READER_OPENED: "reader_opened",

  // Projects
  PROJECTS_PAGE_VIEWED: "projects_page_viewed",
  TOPIC_CREATED: "topic_created",
  TOPIC_CREATE_FAILED: "topic_create_failed",

  // AI
  AI_QUESTION_ASKED: "ai_question_asked",
  AI_ANSWER_RETURNED: "ai_answer_returned",
  AI_ANSWER_FAILED: "ai_answer_failed",

  // Navigation
  PAGE_VIEWED: "page_viewed",
  NOT_FOUND_VIEWED: "not_found_viewed",

  // Errors
  ERROR_BOUNDARY_TRIGGERED: "error_boundary_triggered",
} as const;
