import type { BridgeAdapter, BridgeHealth } from "./types.ts";
import { QmdBridgeAdapter } from "./qmd.ts";

export interface AdapterHealthReport {
  name: string;
  health: BridgeHealth;
}

export class AdapterRegistry {
  private readonly adapters = new Map<string, BridgeAdapter>();

  register(adapter: BridgeAdapter): void {
    this.adapters.set(adapter.name, adapter);
  }

  get(name: string): BridgeAdapter | undefined {
    return this.adapters.get(name);
  }

  list(): BridgeAdapter[] {
    return Array.from(this.adapters.values());
  }

  async healthAll(): Promise<AdapterHealthReport[]> {
    return Promise.all(
      this.list().map(async (a) => ({ name: a.name, health: await a.health() })),
    );
  }
}

export function buildDefaultRegistry(): AdapterRegistry {
  const registry = new AdapterRegistry();
  registry.register(new QmdBridgeAdapter());
  return registry;
}

let defaultRegistry: AdapterRegistry | undefined;

// Process-wide singleton. Use buildDefaultRegistry() directly in tests
// or anywhere isolation is required — this cache is not test-safe.
export function getDefaultRegistry(): AdapterRegistry {
  if (!defaultRegistry) defaultRegistry = buildDefaultRegistry();
  return defaultRegistry;
}
