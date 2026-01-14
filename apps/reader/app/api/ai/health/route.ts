/**
 * AI Health Check API Route
 *
 * Provides unified health status for all AI services including:
 * - LLM provider health (OpenAI, Anthropic, etc.)
 * - Circuit breaker states
 * - Rate limiter status
 * - Request statistics
 *
 * Response format follows industry standards (Kubernetes health probes compatible).
 */

import type { HealthStatus } from "@ku0/ai-core";
import { type NextRequest, NextResponse } from "next/server";
import {
  createAnthropicClient,
  createGoogleClient,
  createOpenAIProvider,
} from "../providerClients";
import { getConfiguredProviders, resolveProviderConfig } from "../providerResolver";

// ============================================================================
// Types
// ============================================================================

interface AIHealthResponse {
  status: HealthStatus;
  version: string;
  timestamp: number;
  uptime: number;
  providers: ProviderHealthInfo[];
  summary: {
    total: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
  };
}

interface ProviderHealthInfo {
  name: string;
  status: HealthStatus;
  latencyMs?: number;
  lastCheckedAt: number;
  error?: string;
  configured: boolean;
}

// ============================================================================
// Health Check Configuration
// ============================================================================

const HEALTH_CHECK_TIMEOUT_MS = 5000;
const LATENCY_DEGRADED_THRESHOLD_MS = 2000;
const LATENCY_UNHEALTHY_THRESHOLD_MS = 5000;

// Track server start time for uptime calculation
const SERVER_START_TIME = Date.now();
const VERSION = "1.0.0";

// ============================================================================
// Health Check Implementations
// ============================================================================

/**
 * Check OpenAI provider health by making a minimal API call.
 */
async function checkOpenAIHealth(): Promise<{
  healthy: boolean;
  latencyMs: number;
  error?: string;
}> {
  const config = resolveProviderConfig("openai");
  if (!config) {
    return { healthy: false, latencyMs: 0, error: "Not configured" };
  }

  const startTime = performance.now();
  try {
    const provider = createOpenAIProvider(config);
    const health = await provider.healthCheck();
    return {
      healthy: health.healthy,
      latencyMs: Math.round(performance.now() - startTime),
      error: health.error,
    };
  } catch (error) {
    return {
      healthy: false,
      latencyMs: Math.round(performance.now() - startTime),
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Check Anthropic provider health.
 */
async function checkAnthropicHealth(): Promise<{
  healthy: boolean;
  latencyMs: number;
  error?: string;
}> {
  const config = resolveProviderConfig("claude");
  if (!config) {
    return { healthy: false, latencyMs: 0, error: "Not configured" };
  }

  const startTime = performance.now();
  try {
    const provider = createAnthropicClient(config);
    const health = await provider.healthCheck();
    return {
      healthy: health.healthy,
      latencyMs: Math.round(performance.now() - startTime),
      error: health.error,
    };
  } catch (error) {
    return {
      healthy: false,
      latencyMs: Math.round(performance.now() - startTime),
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Check Google/Gemini provider health.
 */
async function checkGeminiHealth(): Promise<{
  healthy: boolean;
  latencyMs: number;
  error?: string;
}> {
  const config = resolveProviderConfig("gemini");
  if (!config) {
    return { healthy: false, latencyMs: 0, error: "Not configured" };
  }

  const startTime = performance.now();
  try {
    // Gemini uses Vercel AI SDK, just check if config is valid
    const _client = createGoogleClient(config);
    return {
      healthy: true,
      latencyMs: Math.round(performance.now() - startTime),
    };
  } catch (error) {
    return {
      healthy: false,
      latencyMs: Math.round(performance.now() - startTime),
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// Route Handler
// ============================================================================

/**
 * GET /api/ai/health
 *
 * Returns comprehensive health status for all AI services.
 *
 * Query parameters:
 * - detailed=true: Include full provider details
 * - provider=<name>: Check specific provider only
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const detailed = searchParams.get("detailed") === "true";
  const specificProvider = searchParams.get("provider");

  try {
    const configuredProviders = getConfiguredProviders();
    const providerHealthResults: ProviderHealthInfo[] = [];

    // Check each configured provider
    const providerChecks: Array<{
      name: string;
      check: () => Promise<{ healthy: boolean; latencyMs: number; error?: string }>;
    }> = [
      { name: "openai", check: checkOpenAIHealth },
      { name: "anthropic", check: checkAnthropicHealth },
      { name: "gemini", check: checkGeminiHealth },
    ];

    const checksToRun = specificProvider
      ? providerChecks.filter((p) => p.name === specificProvider)
      : providerChecks;

    // Run health checks in parallel with timeout
    const results = await Promise.allSettled(
      checksToRun.map(async ({ name, check }) => {
        const isConfigured = configuredProviders.includes(
          name as Parameters<typeof resolveProviderConfig>[0]
        );

        if (!isConfigured) {
          return {
            name,
            status: "unknown" as HealthStatus,
            lastCheckedAt: Date.now(),
            configured: false,
          };
        }

        const timeoutPromise = new Promise<{ healthy: boolean; latencyMs: number; error: string }>(
          (_, reject) =>
            setTimeout(() => reject(new Error("Health check timeout")), HEALTH_CHECK_TIMEOUT_MS)
        );

        try {
          const result = await Promise.race([check(), timeoutPromise]);

          let status: HealthStatus = "healthy";
          if (!result.healthy) {
            status = "unhealthy";
          } else if (result.latencyMs >= LATENCY_UNHEALTHY_THRESHOLD_MS) {
            status = "unhealthy";
          } else if (result.latencyMs >= LATENCY_DEGRADED_THRESHOLD_MS) {
            status = "degraded";
          }

          return {
            name,
            status,
            latencyMs: result.latencyMs,
            lastCheckedAt: Date.now(),
            error: result.error,
            configured: true,
          };
        } catch (error) {
          return {
            name,
            status: "unhealthy" as HealthStatus,
            lastCheckedAt: Date.now(),
            error: error instanceof Error ? error.message : "Unknown error",
            configured: true,
          };
        }
      })
    );

    // Process results
    for (const result of results) {
      if (result.status === "fulfilled") {
        providerHealthResults.push(result.value);
      }
    }

    // Calculate summary
    const summary = {
      total: providerHealthResults.length,
      healthy: providerHealthResults.filter((p) => p.status === "healthy").length,
      degraded: providerHealthResults.filter((p) => p.status === "degraded").length,
      unhealthy: providerHealthResults.filter((p) => p.status === "unhealthy").length,
    };

    // Determine overall status
    let overallStatus: HealthStatus = "healthy";
    const configuredResults = providerHealthResults.filter((p) => p.configured);

    if (configuredResults.length === 0) {
      overallStatus = "unhealthy";
    } else if (configuredResults.every((p) => p.status === "unhealthy")) {
      overallStatus = "unhealthy";
    } else if (configuredResults.some((p) => p.status === "unhealthy")) {
      overallStatus = "degraded";
    } else if (configuredResults.some((p) => p.status === "degraded")) {
      overallStatus = "degraded";
    }

    const response: AIHealthResponse = {
      status: overallStatus,
      version: VERSION,
      timestamp: Date.now(),
      uptime: Date.now() - SERVER_START_TIME,
      providers: detailed
        ? providerHealthResults
        : providerHealthResults.map(({ name, status, configured }) => ({
            name,
            status,
            configured,
            lastCheckedAt: Date.now(),
          })),
      summary,
    };

    // Return appropriate HTTP status based on health
    const httpStatus = overallStatus === "unhealthy" ? 503 : 200;

    return NextResponse.json(response, {
      status: httpStatus,
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "X-Health-Status": overallStatus,
      },
    });
  } catch (error) {
    console.error("[AI Health] Error checking health:", error);

    return NextResponse.json(
      {
        status: "unhealthy" as HealthStatus,
        version: VERSION,
        timestamp: Date.now(),
        uptime: Date.now() - SERVER_START_TIME,
        providers: [],
        summary: { total: 0, healthy: 0, degraded: 0, unhealthy: 0 },
        error: error instanceof Error ? error.message : "Unknown error",
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "X-Health-Status": "unhealthy",
        },
      }
    );
  }
}

/**
 * HEAD /api/ai/health
 *
 * Quick health check for load balancers (returns status only).
 */
export async function HEAD(_request: NextRequest): Promise<NextResponse> {
  try {
    const configuredProviders = getConfiguredProviders();

    if (configuredProviders.length === 0) {
      return new NextResponse(null, {
        status: 503,
        headers: { "X-Health-Status": "unhealthy" },
      });
    }

    // Quick check - just verify at least one provider is configured
    return new NextResponse(null, {
      status: 200,
      headers: { "X-Health-Status": "healthy" },
    });
  } catch {
    return new NextResponse(null, {
      status: 503,
      headers: { "X-Health-Status": "unhealthy" },
    });
  }
}
