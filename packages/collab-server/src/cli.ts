#!/usr/bin/env node
/**
 * LFCC Collab Server CLI
 *
 * Start command: LFCC_JWT_SECRET=your-secret pnpm start:dev
 */

import { CollabServer } from "./server";

const PORT = Number.parseInt(process.env.LFCC_PORT ?? "3001", 10);
const JWT_SECRET = process.env.LFCC_JWT_SECRET ?? "dev-secret-do-not-use-in-production";
const STORAGE_PATH = process.env.LFCC_STORAGE_PATH ?? ".lfcc/storage";
const ALLOW_ANONYMOUS = process.env.LFCC_ALLOW_ANONYMOUS === "true";

if (JWT_SECRET === "dev-secret-do-not-use-in-production") {
  console.warn(
    "[CollabServer] WARNING: Using default JWT secret. Set LFCC_JWT_SECRET in production."
  );
}

const server = new CollabServer({
  port: PORT,
  jwtSecret: JWT_SECRET,
  storagePath: STORAGE_PATH,
  allowAnonymous: ALLOW_ANONYMOUS,
});

// Graceful shutdown handlers
process.on("SIGINT", async () => {
  console.info("\n[CollabServer] Received SIGINT");
  await server.shutdown();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.info("\n[CollabServer] Received SIGTERM");
  await server.shutdown();
  process.exit(0);
});

// Start server
server
  .start()
  .then(() => {
    console.info(`[CollabServer] Started on port ${PORT}`);
    console.info(`[CollabServer] Storage: ${STORAGE_PATH}`);
    console.info(`[CollabServer] Anonymous: ${ALLOW_ANONYMOUS}`);
  })
  .catch((error) => {
    console.error("[CollabServer] Failed to start:", error);
    process.exit(1);
  });
