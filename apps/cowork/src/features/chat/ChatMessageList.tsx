import { ChatMessageRow } from "@ku0/shared/ui/chat";
import { useVirtualizer } from "@tanstack/react-virtual";
import React from "react";
import type { ChatMessage } from "./types";

export function ChatMessageList({ messages }: { messages: ChatMessage[] }) {
  const parentRef = React.useRef<HTMLDivElement | null>(null);

  const rowVirtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 96,
    overscan: 6,
  });

  React.useEffect(() => {
    if (messages.length === 0) {
      return;
    }
    rowVirtualizer.scrollToIndex(messages.length - 1, { align: "end" });
  }, [messages.length, rowVirtualizer]);

  return (
    <div className="chat-list" ref={parentRef}>
      <div className="chat-list-inner" style={{ height: rowVirtualizer.getTotalSize() }}>
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const message = messages[virtualRow.index];
          return (
            <div
              key={message.id}
              className="chat-row"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <ChatMessageRow message={message} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
