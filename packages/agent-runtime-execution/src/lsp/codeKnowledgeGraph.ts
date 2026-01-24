import type {
  CodeKnowledgeGraph as CodeKnowledgeGraphContract,
  CodeSymbolQueryOptions,
  CodeSymbolQueryResult,
} from "@ku0/agent-runtime-core";

import type { ImportGraph } from "./importGraph";
import type { SymbolGraph } from "./symbolGraph";

export class LspCodeKnowledgeGraph implements CodeKnowledgeGraphContract {
  constructor(
    private readonly symbolGraph: SymbolGraph,
    private readonly importGraph: ImportGraph
  ) {}

  querySymbols(query: string, options?: CodeSymbolQueryOptions): CodeSymbolQueryResult[] {
    return this.symbolGraph.query(query, options);
  }

  getSymbolStats(): { symbolCount: number; fileCount: number } {
    return this.symbolGraph.getStats();
  }

  getImports(filePath: string): string[] {
    return this.importGraph.getImports(filePath);
  }

  getDependents(filePath: string, transitive = true): string[] {
    return this.importGraph.getDependents(filePath, transitive);
  }
}
