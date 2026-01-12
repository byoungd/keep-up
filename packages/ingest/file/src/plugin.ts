/**
 * File Import Plugin
 *
 * Plugin interface compatible with AtomicIngestionService.
 */

import { FileImporter } from "./fileImporter";
import type { FileImportOptions, FileSource, IngestionMeta } from "./types";

export interface FilePlugin {
  /** Import a single file */
  import(source: FileSource, options?: FileImportOptions): Promise<IngestionMeta>;
  /** Import multiple files */
  importBatch(sources: FileSource[], options?: FileImportOptions): Promise<IngestionMeta[]>;
}

/**
 * Create a file import plugin instance.
 *
 * Usage:
 * ```typescript
 * const plugin = createFilePlugin();
 * const meta = await plugin.import({ path: './document.md' });
 *
 * // Use with AtomicIngestionService
 * const handle = await ingestionService.beginIngestion(meta);
 * await ingestionService.commitIngestion(handle);
 * ```
 */
export function createFilePlugin(): FilePlugin {
  const importer = new FileImporter();

  return {
    import: (source, options) => importer.importFile(source, options),
    importBatch: (sources, options) => importer.importFiles(sources, options),
  };
}
