import { describe, expect, it } from "vitest";

import {
  type AIRequestEnvelope,
  createAIRequestEnvelope,
  normalizeAIRequestEnvelope,
} from "../envelope.js";

describe("AI envelope helpers", () => {
  it("creates a request envelope with generated request_id and legacy alias preserved", () => {
    const envelope = createAIRequestEnvelope({
      docFrontier: "f:1",
      docFrontierTag: "f:1-legacy",
      opsXml: "<replace_spans></replace_spans>",
      preconditions: [],
      agentId: "agent-1",
      clientRequestId: "legacy-req",
    });

    expect(envelope.request_id).toBe("legacy-req");
    expect(envelope.client_request_id).toBe("legacy-req");
    expect(envelope.doc_frontier).toBe("f:1");
    expect(envelope.doc_frontier_tag).toBe("f:1-legacy");
    expect(envelope.agent_id).toBe("agent-1");
  });

  it("normalizes missing request_id from client_request_id", () => {
    const envelope: AIRequestEnvelope = {
      doc_frontier: "f:2",
      request_id: undefined as unknown as string,
      client_request_id: "client-only",
      agent_id: "agent-2",
      ops_xml: "<op/>",
      preconditions: [],
      doc_frontier_tag: "f:2-legacy",
    };

    const normalized = normalizeAIRequestEnvelope(envelope);
    expect(normalized.request_id).toBe("client-only");
    expect(normalized.client_request_id).toBe("client-only");
    expect(normalized.doc_frontier_tag).toBe("f:2-legacy");
  });

  it("generates request_id when none provided", () => {
    const envelope: AIRequestEnvelope = {
      doc_frontier: "f:3",
      request_id: undefined as unknown as string,
      agent_id: "agent-3",
      ops_xml: "<op/>",
      preconditions: [],
    };

    const normalized = normalizeAIRequestEnvelope(envelope);
    expect(normalized.request_id).toBeDefined();
    expect(normalized.request_id?.length).toBeGreaterThan(0);
  });
});
