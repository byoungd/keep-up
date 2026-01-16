import type { Message } from "../providers/types";

export type GatewayTelemetryLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export interface GatewayGenerationStart {
  name: string;
  model: string;
  input: Message[];
  metadata?: Record<string, unknown>;
}

export interface GatewayGenerationUsage {
  input: number;
  output: number;
  total: number;
}

export interface GatewayGenerationResult {
  output?: string;
  usage?: GatewayGenerationUsage;
  model?: string;
  metadata?: Record<string, unknown>;
  statusMessage?: string;
  level?: GatewayTelemetryLevel;
}

export interface GatewayTelemetryGeneration {
  end: (result: GatewayGenerationResult) => void;
}

export interface GatewayTelemetryAdapter {
  startGeneration: (start: GatewayGenerationStart) => GatewayTelemetryGeneration | null;
}

const NOOP_ADAPTER: GatewayTelemetryAdapter = {
  startGeneration: () => null,
};

export function createNoopGatewayTelemetryAdapter(): GatewayTelemetryAdapter {
  return NOOP_ADAPTER;
}
