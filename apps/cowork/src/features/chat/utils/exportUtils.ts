import type { Message } from "@ku0/shell";

interface ExportableSession {
  id?: string;
  sessionId?: string;
  title?: string;
  createdAt?: number;
  updatedAt?: number;
  agentMode?: string;
}

export function exportToMarkdown(session: ExportableSession, messages: Message[]): string {
  const title = session.title || "Untitled Session";
  const sessionId = session.sessionId || session.id || "unknown";
  const date = new Date().toLocaleDateString();

  let md = `# ${title}\n\n`;
  md += `> Date: ${date}\n`;
  md += `> Session ID: ${sessionId}\n\n`;
  md += `--- \n\n`;

  for (const msg of messages) {
    const role = msg.role === "user" ? "User" : "Assistant";
    const modelInfo = msg.role === "assistant" && msg.modelId ? ` (${msg.modelId})` : "";

    md += `## ${role}${modelInfo}\n\n`;
    md += `${msg.content}\n\n`;

    if (msg.role === "assistant" && msg.tokenUsage) {
      const usage = msg.tokenUsage;
      md += `> Tokens: ${usage.totalTokens} (In: ${usage.inputTokens}, Out: ${usage.outputTokens})\n\n`;
    }

    md += `--- \n\n`;
  }

  return md;
}

export function exportToJson(session: ExportableSession, messages: Message[]): string {
  const exportData = {
    session: {
      id: session.sessionId || session.id,
      title: session.title,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      agentMode: session.agentMode,
    },
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      metadata: m.metadata,
      createdAt: m.createdAt,
    })),
    exportedAt: new Date().toISOString(),
  };

  return JSON.stringify(exportData, null, 2);
}

export function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
