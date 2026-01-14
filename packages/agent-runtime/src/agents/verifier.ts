import { buildVerifierPrompt } from "@keepup/ai-core";
import { parseJsonFromText } from "../utils/llmJson";
import type { IAgentManager } from "./types";

export interface VerifierSource {
  id: string;
  title?: string;
  content: string;
}

export interface VerifierRequest {
  claim: string;
  sources: VerifierSource[];
}

export interface VerifierResult {
  claim: string;
  verified: boolean;
  evidence: string;
  sourceItemId?: string;
  reason?: string;
}

export interface VerifierAgentConfig {
  maxSourceChars: number;
}

const DEFAULT_CONFIG: VerifierAgentConfig = {
  maxSourceChars: 4000,
};

export class VerifierAgent {
  private readonly config: VerifierAgentConfig;

  constructor(
    private manager: IAgentManager,
    config: Partial<VerifierAgentConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async verifyClaim(request: VerifierRequest): Promise<VerifierResult> {
    const task = this.buildTask(request);
    const result = await this.manager.spawn({ type: "verifier", task });

    if (!result.success) {
      return {
        claim: request.claim,
        verified: false,
        evidence: "",
        reason: result.error ?? "Verifier agent failed",
      };
    }

    try {
      const parsed = parseJsonFromText<unknown>(result.output);
      return this.parseVerifierResult(request.claim, parsed);
    } catch (error) {
      return {
        claim: request.claim,
        verified: false,
        evidence: "",
        reason: error instanceof Error ? error.message : "Failed to parse verifier output",
      };
    }
  }

  async verifyClaims(requests: VerifierRequest[]): Promise<VerifierResult[]> {
    if (requests.length === 0) {
      return [];
    }

    const tasks = requests.map((request) => ({
      type: "verifier" as const,
      task: this.buildTask(request),
    }));

    const results = await this.manager.spawnParallel(tasks);
    return results.map((result, index) => {
      const request = requests[index];
      if (!request) {
        return {
          claim: "",
          verified: false,
          evidence: "",
          reason: "Missing verifier request",
        };
      }

      if (!result.success) {
        return {
          claim: request.claim,
          verified: false,
          evidence: "",
          reason: result.error ?? "Verifier agent failed",
        };
      }

      try {
        const parsed = parseJsonFromText<unknown>(result.output);
        return this.parseVerifierResult(request.claim, parsed);
      } catch (error) {
        return {
          claim: request.claim,
          verified: false,
          evidence: "",
          reason: error instanceof Error ? error.message : "Failed to parse verifier output",
        };
      }
    });
  }

  private buildTask(request: VerifierRequest): string {
    const sources = request.sources.map((source) => ({
      ...source,
      content: source.content.slice(0, this.config.maxSourceChars),
    }));

    return `VerifyClaim ${request.claim}\n${buildVerifierPrompt({
      claim: request.claim,
      sources,
    })}`;
  }

  private parseVerifierResult(claim: string, parsed: unknown): VerifierResult {
    if (!parsed || typeof parsed !== "object") {
      return {
        claim,
        verified: false,
        evidence: "",
        reason: "Verifier output was not an object",
      };
    }

    const record = parsed as Record<string, unknown>;
    const verified = typeof record.verified === "boolean" ? record.verified : false;
    const evidence = typeof record.evidence === "string" ? record.evidence : "";
    const sourceItemId = typeof record.sourceItemId === "string" ? record.sourceItemId : undefined;
    const reason =
      typeof record.reason === "string"
        ? record.reason
        : typeof record.verified === "boolean"
          ? undefined
          : "Verifier output missing boolean 'verified'";

    return {
      claim,
      verified,
      evidence,
      sourceItemId,
      reason,
    };
  }
}
