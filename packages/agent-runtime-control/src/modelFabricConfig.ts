import type { ModelFabricSnapshot, ProviderConfigRecord, RouteRule } from "@ku0/model-fabric-rs";

export interface ModelFabricConfigStore {
  listProviders(): ProviderConfigRecord[];
  getProvider(providerId: string): ProviderConfigRecord | null;
  upsertProvider(record: ProviderConfigRecord): void;
  removeProvider(providerId: string): boolean;
  listRoutes(): RouteRule[];
  getRoute(ruleId: string): RouteRule | null;
  upsertRoute(route: RouteRule): void;
  removeRoute(ruleId: string): boolean;
  snapshot(): ModelFabricSnapshot;
  reset(): void;
}

export class InMemoryModelFabricConfigStore implements ModelFabricConfigStore {
  private readonly providers = new Map<string, ProviderConfigRecord>();
  private readonly routes = new Map<string, RouteRule>();
  private usageCursor = 0;

  listProviders(): ProviderConfigRecord[] {
    return Array.from(this.providers.values()).sort((a, b) =>
      a.providerId.localeCompare(b.providerId)
    );
  }

  getProvider(providerId: string): ProviderConfigRecord | null {
    return this.providers.get(providerId) ?? null;
  }

  upsertProvider(record: ProviderConfigRecord): void {
    this.providers.set(record.providerId, record);
  }

  removeProvider(providerId: string): boolean {
    return this.providers.delete(providerId);
  }

  listRoutes(): RouteRule[] {
    return Array.from(this.routes.values()).sort((a, b) =>
      b.priority === a.priority ? a.ruleId.localeCompare(b.ruleId) : b.priority - a.priority
    );
  }

  getRoute(ruleId: string): RouteRule | null {
    return this.routes.get(ruleId) ?? null;
  }

  upsertRoute(route: RouteRule): void {
    this.routes.set(route.ruleId, route);
  }

  removeRoute(ruleId: string): boolean {
    return this.routes.delete(ruleId);
  }

  snapshot(): ModelFabricSnapshot {
    return {
      providers: this.listProviders(),
      routes: this.listRoutes(),
      usageCursor: this.usageCursor,
    };
  }

  reset(): void {
    this.providers.clear();
    this.routes.clear();
    this.usageCursor = 0;
  }
}

export function createInMemoryModelFabricConfigStore(): InMemoryModelFabricConfigStore {
  return new InMemoryModelFabricConfigStore();
}
