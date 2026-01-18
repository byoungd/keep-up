import { Langfuse } from "langfuse";
import { ConsoleLogger } from "../resilience/observability";

/**
 * Singleton Langfuse client wrapper.
 * Initializes the client only if environment variables are present.
 */

let langfuseInstance: Langfuse | null = null;
let isInitialized = false;
const logger = new ConsoleLogger({ prefix: "[Langfuse]" });

export function initializeLangfuse(): void {
  if (isInitialized) {
    return;
  }

  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const baseUrl = process.env.LANGFUSE_BASEURL || "https://cloud.langfuse.com";

  if (publicKey && secretKey) {
    try {
      langfuseInstance = new Langfuse({
        publicKey,
        secretKey,
        baseUrl,
        persistence: "memory", // Use memory persistence for Node.js to avoid local storage issues if any
      });
      // console.log("Langfuse initialized");
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error("Failed to initialize Langfuse", err);
    }
  } else {
    // console.warn("Langfuse credentials missing. Skipping initialization.");
  }

  isInitialized = true;
}

export function getLangfuseClient(): Langfuse | null {
  if (!isInitialized) {
    initializeLangfuse();
  }
  return langfuseInstance;
}

/**
 * Clean shutdown of Langfuse to ensure all events are flushed.
 */
export async function shutdownLangfuse(): Promise<void> {
  if (langfuseInstance) {
    await langfuseInstance.shutdownAsync();
  }
}
