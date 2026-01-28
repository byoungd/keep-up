export type CoworkEvent = { id: string; type: string; data: unknown };

export type CoworkStreamOptions = {
  baseUrl: string;
  sessionId: string;
  lastEventId?: string | null;
  onEvent: (event: CoworkEvent) => void;
  onError?: (error: Error) => void;
  onOpen?: () => void;
};

export class CoworkStreamClient {
  private controller?: AbortController;
  private lastEventId?: string | null;

  constructor(private readonly options: CoworkStreamOptions) {
    this.lastEventId = options.lastEventId ?? null;
  }

  getLastEventId(): string | null {
    return this.lastEventId ?? null;
  }

  stop(): void {
    this.controller?.abort();
    this.controller = undefined;
  }

  async start(): Promise<void> {
    this.stop();
    this.controller = new AbortController();
    try {
      const response = await this.openStream();
      await this.consumeStream(response);
    } catch (error) {
      if (this.controller?.signal.aborted) {
        return;
      }
      this.options.onError?.(error instanceof Error ? error : new Error("Cowork stream error"));
    }
  }

  private buildStreamUrl(): URL {
    const { baseUrl, sessionId } = this.options;
    const url = new URL(`/api/sessions/${sessionId}/stream`, baseUrl);
    if (this.lastEventId) {
      url.searchParams.set("lastEventId", this.lastEventId);
    }
    return url;
  }

  private async openStream(): Promise<Response> {
    const response = await fetch(this.buildStreamUrl().toString(), {
      headers: { Accept: "text/event-stream" },
      signal: this.controller?.signal,
    });
    if (!response.ok || !response.body) {
      throw new Error(`Cowork stream failed (${response.status})`);
    }
    this.options.onOpen?.();
    return response;
  }

  private async consumeStream(response: Response): Promise<void> {
    if (!response.body) {
      return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const { messages, remaining } = parseSSEChunk(buffer);
      buffer = remaining;
      this.dispatchMessages(messages);
    }
  }

  private dispatchMessages(messages: SSEMessage[]): void {
    for (const message of messages) {
      this.lastEventId = message.id;
      const parsed = this.safeParse(message.data);
      if (parsed === null) {
        continue;
      }
      this.options.onEvent({ id: message.id, type: message.event, data: parsed });
    }
  }

  private safeParse(data: string): unknown | null {
    try {
      return JSON.parse(data);
    } catch (error) {
      this.options.onError?.(
        error instanceof Error ? error : new Error("Failed to parse Cowork stream event")
      );
      return null;
    }
  }
}

type SSEMessage = { id: string; event: string; data: string };

function parseMessage(part: string): SSEMessage | null {
  const lines = part.split("\n");
  let id = "";
  let event = "";
  let data = "";

  for (const line of lines) {
    if (line.startsWith("id: ")) {
      id = line.slice(4);
    } else if (line.startsWith("event: ")) {
      event = line.slice(7);
    } else if (line.startsWith("data: ")) {
      data = line.slice(6);
    }
  }

  if (id && event && data) {
    return { id, event, data };
  }
  return null;
}

function parseSSEChunk(buffer: string): { messages: SSEMessage[]; remaining: string } {
  const messages: SSEMessage[] = [];
  const parts = buffer.split("\n\n");
  const remaining = parts.pop() ?? "";

  for (const part of parts) {
    const message = parseMessage(part);
    if (message) {
      messages.push(message);
    }
  }

  return { messages, remaining };
}
