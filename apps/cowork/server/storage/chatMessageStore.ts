import { JsonStore } from "./jsonStore";
import type { CoworkChatMessage } from "./types";

export class ChatMessageStore {
  private readonly store: JsonStore<CoworkChatMessage>;

  constructor(filePath: string) {
    this.store = new JsonStore<CoworkChatMessage>({
      filePath,
      idKey: "messageId",
      fallback: [],
    });
  }

  getAll(): Promise<CoworkChatMessage[]> {
    return this.store.getAll();
  }

  async getById(messageId: string): Promise<CoworkChatMessage | null> {
    return this.store.getById(messageId);
  }

  async getBySession(sessionId: string): Promise<CoworkChatMessage[]> {
    const items = await this.store.getAll();
    return items
      .filter((message) => message.sessionId === sessionId)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  async getByClientRequestId(
    clientRequestId: string,
    role?: CoworkChatMessage["role"]
  ): Promise<CoworkChatMessage | null> {
    const items = await this.store.getAll();
    return (
      items
        .filter((message) => message.clientRequestId === clientRequestId)
        .filter((message) => (role ? message.role === role : true))
        .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null
    );
  }

  create(message: CoworkChatMessage): Promise<CoworkChatMessage> {
    return this.store.upsert(message);
  }

  update(
    messageId: string,
    updater: (message: CoworkChatMessage) => CoworkChatMessage
  ): Promise<CoworkChatMessage | null> {
    return this.store.update(messageId, updater);
  }
}

export function createChatMessageStore(filePath: string): ChatMessageStore {
  return new ChatMessageStore(filePath);
}
