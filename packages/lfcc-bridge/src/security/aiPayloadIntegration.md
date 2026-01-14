# AI Payload Security Integration Guide

## Overview

The `SecurityValidator` in `packages/lfcc-bridge` provides additional security validation for AI-generated content. Due to architectural separation (AI Gateway is in `packages/core`, SecurityValidator is in `packages/lfcc-bridge`), direct integration into the Gateway pipeline is not feasible.

## Client-Side Integration

When applying AI-generated content on the client side, use `BridgeController.validateAIPayload()` to perform additional security validation:

```typescript
import { BridgeController } from "@ku0/lfcc-bridge";

// After receiving AI Gateway response
const gatewayResponse = await aiGateway.processRequest(request);

if (gatewayResponse.status === 200 && gatewayResponse.apply_plan) {
  // Before applying the plan, validate the payload
  try {
    const sanitizedPayload = bridgeController.validateAIPayload(
      gatewayResponse.apply_plan.payload_html ?? ""
    );
    
    // Apply the sanitized payload to the document
    applyAIPayloadToDocument(sanitizedPayload);
  } catch (error) {
    // Security validation failed - reject the operation
    console.error("AI payload validation failed:", error);
    // Show error to user
  }
}
```

## Architecture Note

The AI Gateway already performs sanitization via `packages/core/src/gateway/pipeline.ts`:
- `detectMaliciousPayload()` - Basic pattern detection
- `validatePayloadSize()` - Size limits
- `dryRunAIPayload()` - Full sanitization pipeline

The `SecurityValidator` provides:
- Additional whitelist sanitization
- Extended URL validation (all URL-bearing attributes)
- Resource limit checks (nesting depth, attribute count)
- Fail-closed behavior for critical violations

## Best Practice

1. **Server-side (Gateway)**: Use Gateway's built-in sanitization for initial validation
2. **Client-side (Bridge)**: Use `BridgeController.validateAIPayload()` for additional validation before applying content

This two-layer approach provides defense-in-depth security.

