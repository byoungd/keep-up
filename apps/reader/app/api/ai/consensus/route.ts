/**
 * Multi-LLM Consensus API Route
 *
 * Executes queries across multiple LLM providers in parallel
 * and returns a consensus result based on voting strategy.
 */

import {
  type ConsensusConfig,
  type ConsensusModelConfig,
  ConsensusOrchestrator,
} from "@keepup/agent-runtime/orchestrator/edge";
import { type NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

interface ConsensusRequestBody {
  prompt: string;
  models: Array<{
    providerId: string;
    modelId: string;
    apiKey: string;
    baseUrl?: string;
    weight?: number;
  }>;
  votingStrategy?: "majority" | "unanimous" | "weighted";
  minAgreement?: number;
  timeoutMs?: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ConsensusRequestBody;

    // Validate request
    if (!body.prompt || typeof body.prompt !== "string") {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    if (!body.models || body.models.length < 2) {
      return NextResponse.json(
        { error: "At least 2 models are required for consensus" },
        { status: 400 }
      );
    }

    // Build model configurations
    const models: ConsensusModelConfig[] = body.models.map((m) => ({
      providerId: m.providerId,
      modelId: m.modelId,
      apiKey: m.apiKey,
      baseUrl: m.baseUrl,
      weight: m.weight,
    }));

    // Build consensus config
    const config: ConsensusConfig = {
      models,
      votingStrategy: body.votingStrategy ?? "majority",
      minAgreement: body.minAgreement,
      timeoutMs: body.timeoutMs ?? 30000,
      tolerateFailures: true,
    };

    // Execute consensus
    const orchestrator = new ConsensusOrchestrator();
    const result = await orchestrator.executeConsensus(body.prompt, config);

    // Return result
    return NextResponse.json({
      success: true,
      data: {
        finalAnswer: result.finalAnswer,
        confidence: result.confidence,
        agreement: result.agreement,
        hasConsensus: result.hasConsensus,
        votingStrategy: result.votingStrategy,
        totalDurationMs: result.totalDurationMs,
        modelResponses: result.modelResponses.map(
          (r: {
            model: { providerId: string; modelId: string };
            content: string;
            success: boolean;
            error?: string;
            latencyMs: number;
          }) => ({
            providerId: r.model.providerId,
            modelId: r.model.modelId,
            content: r.content,
            success: r.success,
            error: r.error,
            latencyMs: r.latencyMs,
          })
        ),
        dissenting: result.dissenting.map(
          (r: { model: { providerId: string; modelId: string }; content: string }) => ({
            providerId: r.model.providerId,
            modelId: r.model.modelId,
            content: r.content,
          })
        ),
      },
    });
  } catch (error) {
    console.error("[Consensus API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
