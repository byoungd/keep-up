/**
 * SQLite-based chat message store.
 */

import { getDatabase } from "./database";
import type { CoworkChatMessage } from "./types";

export interface SqliteChatMessageStore {
  getAll(): Promise<CoworkChatMessage[]>;
  getById(messageId: string): Promise<CoworkChatMessage | null>;
  getBySession(sessionId: string): Promise<CoworkChatMessage[]>;
  getByClientRequestId(
    clientRequestId: string,
    role?: CoworkChatMessage["role"]
  ): Promise<CoworkChatMessage | null>;
  create(message: CoworkChatMessage): Promise<CoworkChatMessage>;
  update(
    messageId: string,
    updater: (message: CoworkChatMessage) => CoworkChatMessage
  ): Promise<CoworkChatMessage | null>;
}

export async function createSqliteChatMessageStore(): Promise<SqliteChatMessageStore> {
  const db = await getDatabase();

  const insertStmt = db.prepare(`
    INSERT INTO chat_messages
    (message_id, session_id, role, content, status, created_at, updated_at, model_id, provider_id, fallback_notice, parent_id, client_request_id, attachments, metadata, task_id)
    VALUES ($messageId, $sessionId, $role, $content, $status, $createdAt, $updatedAt, $modelId, $providerId, $fallbackNotice, $parentId, $clientRequestId, $attachments, $metadata, $taskId)
  `);

  const selectAllStmt = db.prepare(`
    SELECT * FROM chat_messages ORDER BY created_at ASC
  `);

  const selectByIdStmt = db.prepare(`
    SELECT * FROM chat_messages WHERE message_id = $messageId
  `);

  const selectBySessionStmt = db.prepare(`
    SELECT * FROM chat_messages WHERE session_id = $sessionId ORDER BY created_at ASC
  `);

  const selectByRequestStmt = db.prepare(`
    SELECT * FROM chat_messages
    WHERE client_request_id = $clientRequestId
    ORDER BY created_at DESC
    LIMIT 1
  `);

  const selectByRequestAndRoleStmt = db.prepare(`
    SELECT * FROM chat_messages
    WHERE client_request_id = $clientRequestId AND role = $role
    ORDER BY created_at DESC
    LIMIT 1
  `);

  const updateStmt = db.prepare(`
    UPDATE chat_messages
    SET content = $content,
        status = $status,
        updated_at = $updatedAt,
        model_id = $modelId,
        provider_id = $providerId,
        fallback_notice = $fallbackNotice,
        parent_id = $parentId,
        attachments = $attachments,
        metadata = $metadata,
        task_id = $taskId
    WHERE message_id = $messageId
  `);

  function rowToMessage(row: Record<string, unknown>): CoworkChatMessage {
    return {
      messageId: row.message_id as string,
      sessionId: row.session_id as string,
      role: row.role as CoworkChatMessage["role"],
      content: row.content as string,
      status: row.status as CoworkChatMessage["status"],
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
      modelId: (row.model_id as string) || undefined,
      providerId: (row.provider_id as string) || undefined,
      fallbackNotice: (row.fallback_notice as string) || undefined,
      parentId: (row.parent_id as string) || undefined,
      clientRequestId: (row.client_request_id as string) || undefined,
      attachments: JSON.parse(
        (row.attachments as string) || "[]"
      ) as CoworkChatMessage["attachments"],
      metadata: JSON.parse((row.metadata as string) || "{}") as CoworkChatMessage["metadata"],
      taskId: (row.task_id as string) || undefined,
    };
  }

  function getById(messageId: string): CoworkChatMessage | null {
    const row = selectByIdStmt.get({ $messageId: messageId }) as Record<string, unknown> | null;
    return row ? rowToMessage(row) : null;
  }

  return {
    async getAll(): Promise<CoworkChatMessage[]> {
      const rows = selectAllStmt.all() as Record<string, unknown>[];
      return rows.map(rowToMessage);
    },
    async getById(messageId: string): Promise<CoworkChatMessage | null> {
      return getById(messageId);
    },
    async getBySession(sessionId: string): Promise<CoworkChatMessage[]> {
      const rows = selectBySessionStmt.all({ $sessionId: sessionId }) as Record<string, unknown>[];
      return rows.map(rowToMessage);
    },
    async getByClientRequestId(
      clientRequestId: string,
      role?: CoworkChatMessage["role"]
    ): Promise<CoworkChatMessage | null> {
      const params = role
        ? { $clientRequestId: clientRequestId, $role: role }
        : { $clientRequestId: clientRequestId };
      const row = (role ? selectByRequestAndRoleStmt : selectByRequestStmt).get(params) as Record<
        string,
        unknown
      > | null;
      return row ? rowToMessage(row) : null;
    },
    async create(message: CoworkChatMessage): Promise<CoworkChatMessage> {
      insertStmt.run({
        $messageId: message.messageId,
        $sessionId: message.sessionId,
        $role: message.role,
        $content: message.content,
        $status: message.status,
        $createdAt: message.createdAt,
        $updatedAt: message.updatedAt ?? message.createdAt,
        $modelId: message.modelId ?? null,
        $providerId: message.providerId ?? null,
        $fallbackNotice: message.fallbackNotice ?? null,
        $parentId: message.parentId ?? null,
        $clientRequestId: message.clientRequestId ?? null,
        $attachments: JSON.stringify(message.attachments ?? []),
        $metadata: JSON.stringify(message.metadata ?? {}),
        $taskId: message.taskId ?? null,
      });
      return message;
    },
    async update(
      messageId: string,
      updater: (message: CoworkChatMessage) => CoworkChatMessage
    ): Promise<CoworkChatMessage | null> {
      const existing = getById(messageId);
      if (!existing) {
        return null;
      }
      const updated = updater(existing);
      updateStmt.run({
        $messageId: updated.messageId,
        $content: updated.content,
        $status: updated.status,
        $updatedAt: updated.updatedAt ?? Date.now(),
        $modelId: updated.modelId ?? null,
        $providerId: updated.providerId ?? null,
        $fallbackNotice: updated.fallbackNotice ?? null,
        $parentId: updated.parentId ?? null,
        $attachments: JSON.stringify(updated.attachments ?? []),
        $metadata: JSON.stringify(updated.metadata ?? {}),
        $taskId: updated.taskId ?? null,
      });
      return updated;
    },
  };
}
