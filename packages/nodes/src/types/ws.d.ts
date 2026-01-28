declare module "ws" {
  export type RawData = string | ArrayBuffer | Buffer | Buffer[];

  export interface WebSocket {
    on(event: "message", listener: (data: RawData) => void): this;
    on(event: "close", listener: () => void): this;
    send(data: string): void;
    close(code?: number, reason?: string): void;
  }

  export interface WebSocketServerOptions {
    port: number;
  }

  export class WebSocketServer {
    constructor(options: WebSocketServerOptions);
    on(
      event: "connection",
      listener: (socket: WebSocket, request: unknown) => void
    ): this;
    on(event: "listening", listener: () => void): this;
    on(event: "error", listener: (error: Error) => void): this;
    close(callback?: (err?: Error) => void): void;
  }
}
