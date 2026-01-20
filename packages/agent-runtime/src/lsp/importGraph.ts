import * as path from "node:path";

export class ImportGraph {
  private readonly importsByFile = new Map<string, Set<string>>();
  private readonly dependentsByFile = new Map<string, Set<string>>();

  updateFileImports(filePath: string, imports: string[]): void {
    const normalized = normalizePath(filePath);
    this.removeFile(normalized);

    const resolvedImports = new Set(imports.map((entry) => normalizePath(entry)));
    this.importsByFile.set(normalized, resolvedImports);

    for (const dependency of resolvedImports) {
      const dependents = this.dependentsByFile.get(dependency);
      if (dependents) {
        dependents.add(normalized);
      } else {
        this.dependentsByFile.set(dependency, new Set([normalized]));
      }
    }
  }

  removeFile(filePath: string): void {
    const normalized = normalizePath(filePath);
    const previous = this.importsByFile.get(normalized);
    if (!previous) {
      return;
    }

    for (const dependency of previous) {
      const dependents = this.dependentsByFile.get(dependency);
      if (!dependents) {
        continue;
      }
      dependents.delete(normalized);
      if (dependents.size === 0) {
        this.dependentsByFile.delete(dependency);
      }
    }

    this.importsByFile.delete(normalized);
  }

  getDependents(filePath: string, transitive = true): string[] {
    const normalized = normalizePath(filePath);
    const direct = this.dependentsByFile.get(normalized);
    if (!direct || direct.size === 0) {
      return [];
    }

    if (!transitive) {
      return Array.from(direct);
    }

    return collectTransitiveDependents(this.dependentsByFile, direct);
  }

  getImports(filePath: string): string[] {
    const normalized = normalizePath(filePath);
    return Array.from(this.importsByFile.get(normalized) ?? []);
  }
}

function normalizePath(value: string): string {
  return path.resolve(value);
}

function collectTransitiveDependents(
  dependentsByFile: Map<string, Set<string>>,
  seed: Iterable<string>
): string[] {
  const visited = new Set<string>();
  const queue = Array.from(seed);

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    const next = dependentsByFile.get(current);
    if (!next) {
      continue;
    }
    for (const item of next) {
      if (!visited.has(item)) {
        queue.push(item);
      }
    }
  }

  return Array.from(visited);
}
