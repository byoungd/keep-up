/**
 * Cowork Connector Trust Registry
 *
 * Tracks trusted connectors and their granted scopes.
 */

import type { CoworkConnectorGrant } from "./types";

export class CoworkConnectorTrustRegistry {
  private readonly grants = new Map<string, CoworkConnectorGrant>();

  register(grant: CoworkConnectorGrant): void {
    this.grants.set(grant.id, grant);
  }

  revoke(id: string): boolean {
    return this.grants.delete(id);
  }

  getGrant(id: string): CoworkConnectorGrant | undefined {
    return this.grants.get(id);
  }

  listGrants(): CoworkConnectorGrant[] {
    return Array.from(this.grants.values());
  }

  isScopeAllowed(id: string, scope: string): boolean {
    const grant = this.grants.get(id);
    if (!grant) {
      return false;
    }
    return grant.scopes.includes(scope);
  }

  isActionAllowed(id: string): boolean {
    const grant = this.grants.get(id);
    if (!grant) {
      return false;
    }
    return grant.allowActions;
  }
}
