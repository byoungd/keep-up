/**
 * Digest Module
 *
 * AI-powered daily digest generation with citation enforcement.
 * Part of Track 2: Intelligence & Logic (AI)
 */

// Types
export * from "./types";

// Services
export { DigestService } from "./digestService";
export type {
  DigestServiceConfig,
  ContentStore,
  DigestStore,
} from "./digestService";

// LLM Synthesizer
export { LLMSynthesizer, createLLMSynthesizer } from "./llmSynthesizer";
export type { LLMSynthesizerConfig } from "./llmSynthesizer";

// Agents
export { VerificationAgent } from "./verificationAgent";
export type { VerificationAgentConfig } from "./verificationAgent";

// Storage Adapters
export { ContentStoreAdapter, DigestStoreAdapter } from "./storageAdapters";
export type { DigestDbDriver } from "./storageAdapters";
