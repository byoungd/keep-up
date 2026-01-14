import fs from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vite";
import topLevelAwait from "vite-plugin-top-level-await";
import wasm from "vite-plugin-wasm";

const require = createRequire(import.meta.url);

// Custom plugin to copy sqlite3.wasm
function copySqliteWasm() {
  return {
    name: "copy-sqlite-wasm",
    buildStart() {
      try {
        // Resolve the @sqlite.org/sqlite-wasm package location
        // We look for sqlite-wasm/jswasm/sqlite3.wasm inside the package
        const sqlitePackagePath = require.resolve("@sqlite.org/sqlite-wasm/package.json");
        const sqlitePackageDir = dirname(sqlitePackagePath);
        const wasmPath = resolve(sqlitePackageDir, "sqlite-wasm/jswasm/sqlite3.wasm");

        const publicDir = resolve(__dirname, "public");
        const destPath = resolve(publicDir, "sqlite3.wasm");

        if (!fs.existsSync(publicDir)) {
          fs.mkdirSync(publicDir, { recursive: true });
        }

        console.info(`[copy-sqlite-wasm] Copying ${wasmPath} to ${destPath}`);
        fs.copyFileSync(wasmPath, destPath);
      } catch (e) {
        console.error("[copy-sqlite-wasm] Failed to copy sqlite3.wasm:", e);
        // Don't fail the build if not found locally (might be different in CI?), but we should warn.
      }
    },
  };
}

export default defineConfig({
  // Prevent recursing into public folder
  publicDir: false,
  build: {
    // Write to public/db-worker.js
    outDir: "public",
    emptyOutDir: false, // Don't clear public folder
    lib: {
      entry: require.resolve("@ku0/db/worker"), // Resolve via node resolution from workspace
      name: "DbWorker",
      fileName: () => "db-worker.js",
      formats: ["es"],
    },
    rollupOptions: {
      output: {
        entryFileNames: "db-worker.js",
      },
      // Prevent externalization of node built-ins, we want to shim or fail if used
      // But Vite externalizes them by default in browser build.
    },
    minify: false, // Easier debugging, enable if needed
  },
  define: {
    "process.env": {},
    global: "self",
  },
  plugins: [wasm(), topLevelAwait(), copySqliteWasm()],
  resolve: {
    alias: {
      // Mock node modules that might be imported but not used in browser path
      http: resolve(__dirname, "./worker-mocks.js"),
      https: resolve(__dirname, "./worker-mocks.js"),
      url: resolve(__dirname, "./worker-mocks.js"),
      stream: resolve(__dirname, "./worker-mocks.js"),
      events: resolve(__dirname, "./worker-mocks.js"),
      zlib: resolve(__dirname, "./worker-mocks.js"),
      util: resolve(__dirname, "./worker-mocks.js"),
      timers: resolve(__dirname, "./worker-mocks.js"),
    },
    // Ensure we can resolve modules from the workspace
    // preserveSymlinks: true,
  },
});
