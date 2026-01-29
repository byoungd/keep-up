import { describe, expect, it } from "vitest";
import { createGatewayNodeRoutes } from "../routes/gatewayNodes";
import type { GatewayControlRuntime } from "../runtime/gatewayControl";

const nodesRuntime = {
  list: () => [{ id: "node-1", name: "Node 1" }],
  getStatus: () => ({ enabled: true, online: 1, offline: 0, total: 1 }),
  describe: (nodeId: string) => (nodeId === "node-1" ? { id: "node-1" } : undefined),
  invoke: async (_nodeId: string, _command: string, _args?: Record<string, unknown>) => ({
    ok: true,
  }),
};

describe("Gateway node routes", () => {
  it("returns 503 when gateway nodes are unavailable", async () => {
    const app = createGatewayNodeRoutes({});
    const res = await app.request("/gateway/nodes");
    expect(res.status).toBe(503);
  });

  it("lists gateway nodes", async () => {
    const gateway = { nodes: nodesRuntime } as unknown as GatewayControlRuntime;
    const app = createGatewayNodeRoutes({ gateway });

    const res = await app.request("/gateway/nodes");
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      ok: boolean;
      nodes: Array<{ id: string }>;
      status: { total: number };
    };
    expect(data.ok).toBe(true);
    expect(data.nodes[0]?.id).toBe("node-1");
    expect(data.status.total).toBe(1);
  });

  it("returns 404 when node is missing", async () => {
    const gateway = { nodes: nodesRuntime } as unknown as GatewayControlRuntime;
    const app = createGatewayNodeRoutes({ gateway });

    const res = await app.request("/gateway/nodes/missing");
    expect(res.status).toBe(404);
  });

  it("returns node details", async () => {
    const gateway = { nodes: nodesRuntime } as unknown as GatewayControlRuntime;
    const app = createGatewayNodeRoutes({ gateway });

    const res = await app.request("/gateway/nodes/node-1");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; node: { id: string } };
    expect(data.ok).toBe(true);
    expect(data.node.id).toBe("node-1");
  });

  it("requires a command when invoking nodes", async () => {
    const gateway = { nodes: nodesRuntime } as unknown as GatewayControlRuntime;
    const app = createGatewayNodeRoutes({ gateway });

    const res = await app.request("/gateway/nodes/node-1/invoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("invokes gateway nodes", async () => {
    const gateway = { nodes: nodesRuntime } as unknown as GatewayControlRuntime;
    const app = createGatewayNodeRoutes({ gateway });

    const res = await app.request("/gateway/nodes/node-1/invoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "ping", args: { ok: true } }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; command: string; nodeId: string };
    expect(data.ok).toBe(true);
    expect(data.command).toBe("ping");
    expect(data.nodeId).toBe("node-1");
  });
});
