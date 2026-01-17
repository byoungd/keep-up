import { getLangfuseClient } from "../observability/langfuseClient";
import type {
  GatewayGenerationResult,
  GatewayGenerationStart,
  GatewayTelemetryAdapter,
  GatewayTelemetryGeneration,
  GatewayTelemetryLevel,
} from "./telemetry";

type LangfuseLevel = "DEBUG" | "DEFAULT" | "WARNING" | "ERROR";

function toLangfuseLevel(level: GatewayTelemetryLevel | undefined): LangfuseLevel | undefined {
  if (!level) {
    return undefined;
  }
  const mapping: Record<GatewayTelemetryLevel, LangfuseLevel> = {
    DEBUG: "DEBUG",
    INFO: "DEFAULT",
    WARN: "WARNING",
    ERROR: "ERROR",
  };
  return mapping[level];
}

function toLangfuseUsage(result: GatewayGenerationResult) {
  if (!result.usage) {
    return undefined;
  }
  return {
    input: result.usage.input,
    output: result.usage.output,
    total: result.usage.total,
  };
}

export function createLangfuseGatewayTelemetryAdapter(): GatewayTelemetryAdapter {
  return {
    startGeneration: (start: GatewayGenerationStart): GatewayTelemetryGeneration | null => {
      const langfuse = getLangfuseClient();
      if (!langfuse) {
        return null;
      }

      const generation = langfuse.generation({
        name: start.name,
        model: start.model,
        input: start.input,
        metadata: start.metadata,
      });

      return {
        end: (result: GatewayGenerationResult) => {
          generation.end({
            output: result.output,
            usage: toLangfuseUsage(result),
            model: result.model,
            metadata: result.metadata,
            statusMessage: result.statusMessage,
            level: toLangfuseLevel(result.level),
          });
        },
      };
    },
  };
}
