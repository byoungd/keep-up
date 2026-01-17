/**
 * LFCC v0.9 RC - AI Gateway Controller
 * @see docs/product/LFCC_v0.9_RC_Parallel_Workstreams/05_AI_Gateway_Envelope_and_Dry_Run.md
 *
 * Main gateway that orchestrates:
 * - Request validation
 * - Security validation (P0.2)
 * - Conflict checking
 * - Dry-run pipeline
 * - Response generation
 */

import { normalizeRequestIdentifiers } from "../kernel/ai/envelope.js";
import type { AISanitizationPolicyV1 } from "../kernel/ai/types.js";
import { DEFAULT_AI_SANITIZATION_POLICY } from "../kernel/ai/types.js";
import type { CanonNode } from "../kernel/canonicalizer/types.js";
import {
  AIPayloadValidator,
  type AIValidatorConfig,
  DEFAULT_AI_VALIDATOR_CONFIG,
} from "../security/aiValidator.js";
import { checkConflicts } from "./conflict.js";
import {
  createGateway409,
  createGatewayError,
  createGatewayResponse,
  validateGatewayRequest,
} from "./envelope.js";
import {
  detectMaliciousPayload,
  executePipeline,
  type PipelineConfig,
  validatePayloadSize,
} from "./pipeline.js";
import type {
  AIGatewayRequest,
  AIGatewayResult,
  ApplyOperation,
  ApplyPlan,
  GatewayDiagnostic,
  GatewayDocumentProvider,
  GatewayTelemetryEvent,
} from "./types.js";

// ============================================================================
// Gateway Configuration
// ============================================================================

/** Gateway configuration */
export type GatewayConfig = {
  /** Document state provider */
  documentProvider: GatewayDocumentProvider;
  /** Default sanitization policy */
  defaultSanitizationPolicy: AISanitizationPolicyV1;
  /** Enable malicious payload pre-check */
  enableMaliciousCheck: boolean;
  /** Enable payload size validation */
  enableSizeValidation: boolean;
  /** Enable security validation (P0.2) */
  enableSecurityValidation: boolean;
  /** Enable request idempotency */
  enableIdempotency: boolean;
  /** Idempotency window in ms */
  idempotencyWindowMs: number;
  /** Security validator configuration */
  securityValidatorConfig?: Partial<AIValidatorConfig>;
  /** Custom pipeline config */
  pipelineConfig?: Partial<PipelineConfig>;
  /** Optional telemetry hook for gateway events */
  onTelemetry?: (event: GatewayTelemetryEvent) => void;
};

/** Default gateway configuration (requires provider) */
export function createDefaultGatewayConfig(provider: GatewayDocumentProvider): GatewayConfig {
  return {
    documentProvider: provider,
    defaultSanitizationPolicy: DEFAULT_AI_SANITIZATION_POLICY,
    enableMaliciousCheck: true,
    enableSizeValidation: true,
    enableSecurityValidation: true,
    enableIdempotency: true,
    idempotencyWindowMs: 60_000,
    securityValidatorConfig: DEFAULT_AI_VALIDATOR_CONFIG,
  };
}

// ============================================================================
// Gateway Controller
// ============================================================================

/**
 * AI Gateway Controller
 *
 * Handles AI mutation requests with full safety pipeline.
 */
export class AIGateway {
  private config: GatewayConfig;
  private securityValidator: AIPayloadValidator;
  private idempotencyCache = new Map<string, { response: AIGatewayResult; storedAt: number }>();

  constructor(config: GatewayConfig) {
    this.config = config;
    this.securityValidator = new AIPayloadValidator(config.securityValidatorConfig);
  }

  /**
   * Process an AI Gateway request
   */
  async processRequest(rawRequest: unknown): Promise<AIGatewayResult> {
    const startedAt = performance.now();
    const diagnostics: GatewayDiagnostic[] = [];

    // Step 1: Validate request structure
    const validationError = this.checkRequestStructure(rawRequest);
    if (validationError) {
      this.emitTelemetry({
        kind: "invalid_request",
        request_id: this.extractRequestIds(rawRequest).requestId,
        duration_ms: performance.now() - startedAt,
      });
      return validationError;
    }

    const request = rawRequest as AIGatewayRequest;
    const requestId = this.resolveRequestId(request);
    const cachedResponse = this.getIdempotentResponse(requestId);
    if (cachedResponse) {
      this.emitTelemetry({
        kind: "idempotency_hit",
        request_id: requestId,
        agent_id: request.agent_id,
        intent_id: request.intent_id,
        doc_id: request.doc_id,
        duration_ms: performance.now() - startedAt,
      });
      return cachedResponse;
    }

    // Steps 2-4: Security and Validation Checks
    const checkResult = this.performChecks(request, diagnostics);
    if (checkResult) {
      this.storeIdempotentResponse(requestId, checkResult);
      this.emitTelemetry({
        kind: checkResult.status === 400 ? "sanitization_reject" : "invalid_request",
        request_id: requestId,
        agent_id: request.agent_id,
        intent_id: request.intent_id,
        doc_id: request.doc_id,
        duration_ms: performance.now() - startedAt,
      });
      return checkResult;
    }

    // Step 5: Check conflicts
    const conflictResult = checkConflicts(request, this.config.documentProvider);
    if (!conflictResult.ok) {
      this.storeIdempotentResponse(requestId, conflictResult.response);
      this.emitTelemetry({
        kind: "conflict",
        request_id: requestId,
        agent_id: request.agent_id,
        intent_id: request.intent_id,
        doc_id: request.doc_id,
        reason: conflictResult.response.reason,
        duration_ms: performance.now() - startedAt,
      });
      return conflictResult.response;
    }

    // Step 6: Execute dry-run pipeline or return empty response
    const result = await this.executePipelineOrReturn(request, diagnostics);
    this.storeIdempotentResponse(requestId, result);
    this.emitTelemetry({
      kind: result.status === 200 ? "success" : "sanitization_reject",
      request_id: requestId,
      agent_id: request.agent_id,
      intent_id: request.intent_id,
      doc_id: request.doc_id,
      duration_ms: performance.now() - startedAt,
    });
    return result;
  }

  private emitTelemetry(event: GatewayTelemetryEvent): void {
    this.config.onTelemetry?.(event);
  }

  private checkRequestStructure(rawRequest: unknown): AIGatewayResult | null {
    const validationErrors = validateGatewayRequest(rawRequest);
    if (validationErrors.length > 0) {
      const requestIds = this.extractRequestIds(rawRequest);
      return createGatewayError({
        status: 400,
        code: "INVALID_REQUEST",
        message: `Request validation failed: ${validationErrors.map((e) => e.message).join("; ")}`,
        requestId: requestIds.requestId,
        clientRequestId: requestIds.clientRequestId,
      });
    }
    return null;
  }

  private performChecks(
    request: AIGatewayRequest,
    diagnostics: GatewayDiagnostic[]
  ): AIGatewayResult | null {
    if (this.config.enableSecurityValidation && request.payload) {
      const error = this.validateSecurity(request, diagnostics);
      if (error) {
        return error;
      }
    }

    if (this.config.enableMaliciousCheck && request.payload) {
      const error = this.checkMalicious(request, diagnostics);
      if (error) {
        return error;
      }
    }

    if (this.config.enableSizeValidation && request.payload) {
      const error = this.validateSize(request, diagnostics);
      if (error) {
        return error;
      }
    }

    return null;
  }

  private validateSecurity(
    request: AIGatewayRequest,
    diagnostics: GatewayDiagnostic[]
  ): AIGatewayResult | null {
    const payloadInput = this.getPayloadInput(request);
    const securityResult = this.securityValidator.validate(payloadInput);
    const requestId = this.resolveRequestId(request);

    if (securityResult.findings) {
      for (const finding of securityResult.findings) {
        diagnostics.push({
          severity: finding.severity,
          kind: `security_${finding.type.toLowerCase()}`,
          detail: finding.description,
        });
      }
    }

    if (!securityResult.valid) {
      const errorCode = securityResult.code ?? "SECURITY_VALIDATION_FAILED";
      return createGatewayError({
        status: 400,
        code: errorCode,
        message: `Security validation failed: ${securityResult.message}`,
        requestId,
        clientRequestId: request.client_request_id,
      });
    }
    return null;
  }

  private checkMalicious(
    request: AIGatewayRequest,
    diagnostics: GatewayDiagnostic[]
  ): AIGatewayResult | null {
    if (!request.payload) {
      return null;
    }
    const requestId = this.resolveRequestId(request);
    const maliciousCheck = detectMaliciousPayload(request.payload);
    if (maliciousCheck.isMalicious) {
      diagnostics.push({
        severity: "error",
        kind: "malicious_payload",
        detail: `Detected malicious patterns: ${maliciousCheck.patterns.join(", ")}`,
      });
      return createGatewayError({
        status: 400,
        code: "MALICIOUS_PAYLOAD",
        message: "Payload contains potentially malicious content",
        requestId,
        clientRequestId: request.client_request_id,
      });
    }
    return null;
  }

  private validateSize(
    request: AIGatewayRequest,
    diagnostics: GatewayDiagnostic[]
  ): AIGatewayResult | null {
    if (!request.payload) {
      return null;
    }
    const requestId = this.resolveRequestId(request);
    const sizeCheck = validatePayloadSize(request.payload);
    if (!sizeCheck.ok) {
      diagnostics.push({
        severity: "error",
        kind: "payload_too_large",
        detail: `Payload size ${sizeCheck.size} exceeds limit ${sizeCheck.limit}`,
      });
      return createGatewayError({
        status: 400,
        code: "PAYLOAD_TOO_LARGE",
        message: `Payload size ${sizeCheck.size} bytes exceeds limit of ${sizeCheck.limit} bytes`,
        requestId,
        clientRequestId: request.client_request_id,
      });
    }
    return null;
  }

  private async executePipelineOrReturn(
    request: AIGatewayRequest,
    diagnostics: GatewayDiagnostic[]
  ): Promise<AIGatewayResult> {
    const requestId = this.resolveRequestId(request);
    if (request.payload) {
      const pipelineInput = this.getPayloadInput(request);
      const sanitizationPolicy =
        request.options?.sanitization_policy ?? this.config.defaultSanitizationPolicy;

      const pipelineResult = await executePipeline(pipelineInput, {
        sanitizationPolicy,
        ...this.config.pipelineConfig,
      });

      diagnostics.push(...pipelineResult.diagnostics);

      if (!pipelineResult.ok) {
        if (pipelineResult.stage === "schema_validate") {
          return createGateway409({
            reason: "schema_reject",
            serverFrontierTag: this.config.documentProvider.getFrontierTag(),
            failedPreconditions: [],
            message: `Schema validation failed: ${pipelineResult.reason}`,
            requestId,
            clientRequestId: request.client_request_id,
            policyContext: request.policy_context,
          });
        }

        return createGateway409({
          reason: "sanitization_reject",
          serverFrontierTag: this.config.documentProvider.getFrontierTag(),
          failedPreconditions: [],
          message: `Pipeline failed at ${pipelineResult.stage}: ${pipelineResult.reason}`,
          requestId,
          clientRequestId: request.client_request_id,
          policyContext: request.policy_context,
        });
      }

      const applyPlan = this.buildApplyPlan(request, pipelineResult.canonRoot);

      return createGatewayResponse({
        serverFrontierTag: this.config.documentProvider.getFrontierTag(),
        canonFragment: request.options?.return_canonical_tree
          ? pipelineResult.canonRoot
          : undefined,
        applyPlan,
        requestId,
        clientRequestId: request.client_request_id,
        policyContext: request.policy_context,
        diagnostics,
      });
    }

    return createGatewayResponse({
      serverFrontierTag: this.config.documentProvider.getFrontierTag(),
      requestId,
      clientRequestId: request.client_request_id,
      policyContext: request.policy_context,
      diagnostics,
    });
  }

  /**
   * Get payload input based on format
   */
  private getPayloadInput(request: AIGatewayRequest): { html?: string; markdown?: string } {
    switch (request.format) {
      case "html":
      case "canonical_tree":
      case "canonical_fragment":
        return { html: request.payload };
      case "markdown":
        return { markdown: request.payload };
      default:
        return { html: request.payload };
    }
  }

  /**
   * Build apply plan from canonical result
   */
  private buildApplyPlan(request: AIGatewayRequest, canonRoot: CanonNode): ApplyPlan {
    const operations: ApplyOperation[] = [];
    const affectedBlockIds: string[] = [];

    // Create replace operations for each target span
    for (const target of request.target_spans) {
      operations.push({
        type: "replace",
        span_id: target.span_id,
        content: canonRoot,
      });
    }

    // Collect affected block IDs from target spans
    for (const target of request.target_spans) {
      const spanState = this.config.documentProvider.getSpanState(target.span_id);
      if (spanState) {
        affectedBlockIds.push(spanState.block_id);
      }
    }

    // Estimate size
    const estimatedSize = JSON.stringify(canonRoot).length;

    return {
      operations,
      affected_block_ids: [...new Set(affectedBlockIds)],
      estimated_size_bytes: estimatedSize,
    };
  }

  private resolveRequestId(request: AIGatewayRequest): string {
    const normalized = normalizeRequestIdentifiers(request);
    return normalized.request_id;
  }

  private extractRequestIds(rawRequest: unknown): {
    requestId?: string;
    clientRequestId?: string;
  } {
    if (typeof rawRequest !== "object" || rawRequest === null) {
      return {};
    }
    const req = rawRequest as Record<string, unknown>;
    const requestId = typeof req.request_id === "string" ? req.request_id : undefined;
    const clientRequestId =
      typeof req.client_request_id === "string" ? req.client_request_id : undefined;
    return { requestId, clientRequestId };
  }

  private getIdempotentResponse(requestId?: string): AIGatewayResult | null {
    if (!this.config.enableIdempotency || !requestId) {
      return null;
    }
    this.evictIdempotencyEntries();
    const cached = this.idempotencyCache.get(requestId);
    return cached ? cached.response : null;
  }

  private storeIdempotentResponse(requestId: string | undefined, response: AIGatewayResult): void {
    if (!this.config.enableIdempotency || !requestId) {
      return;
    }
    this.idempotencyCache.set(requestId, { response, storedAt: Date.now() });
  }

  private evictIdempotencyEntries(now: number = Date.now()): void {
    const ttl = this.config.idempotencyWindowMs;
    for (const [key, entry] of this.idempotencyCache.entries()) {
      if (now - entry.storedAt > ttl) {
        this.idempotencyCache.delete(key);
      }
    }
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<GatewayConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Get current configuration
   */
  getConfig(): GatewayConfig {
    return { ...this.config };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an AI Gateway instance
 */
export function createAIGateway(config: GatewayConfig): AIGateway {
  return new AIGateway(config);
}

/**
 * Create an AI Gateway with default configuration
 */
export function createAIGatewayWithDefaults(provider: GatewayDocumentProvider): AIGateway {
  return new AIGateway(createDefaultGatewayConfig(provider));
}
