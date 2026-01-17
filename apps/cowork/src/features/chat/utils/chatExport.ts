import type { Message } from "@ku0/shell";

export function exportToMarkdown(messages: Message[]): string {
  let md = "# Chat Session Export\n\n";

  for (const msg of messages) {
    const role = msg.role === "user" ? "**User**" : "**Assistant**";
    const time = msg.createdAt ? new Date(msg.createdAt).toLocaleString() : "";

    md += `### ${role} (${time})\n\n`;

    if (msg.content) {
      md += `${msg.content}\n\n`;
    }

    // Handle artifacts if they were parsed into a cleaner structure in the future
    // For now we just rely on content being the source of truth

    md += "---\n\n";
  }

  return md;
}

export function exportToJson(messages: Message[]): string {
  const exportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
      type: m.type,
      modelId: m.modelId,
      providerId: m.providerId,
    })),
  };
  return JSON.stringify(exportData, null, 2);
}

export function downloadFile(filename: string, content: string, contentType: string) {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
