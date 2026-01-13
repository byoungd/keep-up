/**
 * Cowork Connector Trust Registry Tests
 */

import { describe, expect, it } from "vitest";
import { CoworkConnectorTrustRegistry } from "../cowork/connectors";

const grant = {
  id: "connector-1",
  provider: "web-search",
  scopes: ["read", "search"],
  allowActions: false,
};

describe("CoworkConnectorTrustRegistry", () => {
  it("registers and lists grants", () => {
    const registry = new CoworkConnectorTrustRegistry();

    registry.register(grant);
    const grants = registry.listGrants();

    expect(grants).toHaveLength(1);
    expect(grants[0]?.id).toBe("connector-1");
  });

  it("checks scope and action permissions", () => {
    const registry = new CoworkConnectorTrustRegistry();
    registry.register(grant);

    expect(registry.isScopeAllowed("connector-1", "search")).toBe(true);
    expect(registry.isScopeAllowed("connector-1", "write")).toBe(false);
    expect(registry.isActionAllowed("connector-1")).toBe(false);
  });
});
