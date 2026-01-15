import { cn } from "../../utils/cn";
import type { ChatMessage } from "./types";

export function ChatMessageRow({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("message-row", isUser ? "message-row--user" : "message-row--assistant")}>
      <div
        className={cn(
          "message-bubble",
          isUser ? "message-bubble--user" : "message-bubble--assistant"
        )}
      >
        <p className="text-sm leading-relaxed text-foreground">{message.content}</p>
        <div className="message-meta">
          <span>{new Date(message.createdAt).toLocaleTimeString()}</span>
          {message.status === "sending" ? <span>Sending...</span> : null}
        </div>
      </div>
    </div>
  );
}
