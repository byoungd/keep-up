import { randomUUID } from "node:crypto";
import path from "node:path";
import type {
  AgentState,
  ArtifactEvents,
  RuntimeEventBus,
  RuntimeInstance,
  Subscription,
} from "@ku0/agent-runtime";
import { type SessionRecord, SessionStore } from "@ku0/tooling-session";
import { applyPatch } from "diff";
import * as vscode from "vscode";
import { type RuntimeEventMessage, runPromptWithStreaming } from "../runtime/promptRunner";
import { createRuntimeResources } from "../runtime/runtimeResources";

export class AgentPanel {
  private panel?: vscode.WebviewPanel;
  private previewProvider?: KeepUpPreviewProvider;
  private readonly pendingDiffs = new Map<string, string>();
  private readonly sessionStore = new SessionStore();
  private session?: SessionRecord;
  private runtime?: RuntimeInstance;
  private eventBus?: RuntimeEventBus;
  private runtimeSessionId?: string;
  private artifactSubscription?: Subscription;

  constructor(private readonly context: vscode.ExtensionContext) {}

  show() {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      "keepup",
      "Keep-Up Agent",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    this.panel.webview.html = this.getHtml();
    this.panel.onDidDispose(() => {
      this.panel = undefined;
      this.runtime = undefined;
      this.eventBus = undefined;
      this.runtimeSessionId = undefined;
      this.artifactSubscription?.unsubscribe();
      this.artifactSubscription = undefined;
    });

    this.panel.webview.onDidReceiveMessage(async (message: WebviewMessage) => {
      switch (message.type) {
        case "sendPrompt":
          await this.handlePrompt(message.text);
          break;
        case "applyPending":
          await this.applyPendingChanges();
          break;
        case "previewDiff":
          await this.showDiffPreview(message.filePath);
          break;
        default:
          break;
      }
    });
  }

  async startNewTask() {
    this.resetSession();
    await this.ensureSession();
    this.postMessage({ type: "system", text: "New task started" });
  }

  async showDiffPreview(filePath: string) {
    this.ensurePreviewProvider();

    const original = vscode.Uri.file(filePath);
    const preview = vscode.Uri.file(filePath).with({ scheme: "keepup-preview" });

    await vscode.commands.executeCommand(
      "vscode.diff",
      original,
      preview,
      `Changes: ${path.basename(filePath)}`
    );
  }

  async applyPendingChanges() {
    if (this.pendingDiffs.size === 0) {
      void vscode.window.showInformationMessage("No pending diffs to apply.");
      return;
    }

    const edit = new vscode.WorkspaceEdit();

    for (const [filePath, diffText] of this.pendingDiffs.entries()) {
      const uri = vscode.Uri.file(filePath);
      const fileExists = await this.fileExists(uri);
      const originalText = fileExists ? await this.readDocumentText(uri) : "";
      const patched = applyPatch(originalText, diffText);

      if (patched === false) {
        void vscode.window.showErrorMessage(`Failed to apply diff for ${filePath}`);
        return;
      }

      if (!fileExists) {
        edit.createFile(uri, { ignoreIfExists: true });
        edit.insert(uri, new vscode.Position(0, 0), patched);
        continue;
      }

      const document = await vscode.workspace.openTextDocument(uri);
      const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(originalText.length)
      );
      edit.replace(uri, fullRange, patched);
    }

    const applied = await vscode.workspace.applyEdit(edit);
    if (applied) {
      this.pendingDiffs.clear();
      this.postMessage({ type: "system", text: "Changes applied." });
      this.postMessage({ type: "diffs", files: [] });
    } else {
      void vscode.window.showErrorMessage("Failed to apply changes.");
    }
  }

  sendPrompt(text: string) {
    this.postMessage({ type: "prompt", text });
  }

  private ensurePreviewProvider() {
    if (this.previewProvider) {
      return;
    }
    this.previewProvider = new KeepUpPreviewProvider(this.pendingDiffs);
    const registration = vscode.workspace.registerTextDocumentContentProvider(
      "keepup-preview",
      this.previewProvider
    );
    this.context.subscriptions.push(registration);
  }

  private async handlePrompt(text: string) {
    if (!text.trim()) {
      return;
    }

    try {
      const session = await this.ensureSession();
      const runtime = await this.ensureRuntime(session);

      this.postMessage({ type: "system", text: "Running..." });

      const result = await runPromptWithStreaming({
        runtime,
        prompt: text,
        toolCalls: session.toolCalls,
        onEvent: (event) => this.handleRuntimeEvent(event),
      });

      const assistantText = extractAssistantText(result);
      const now = Date.now();
      session.messages.push(
        { role: "user", content: text, timestamp: now },
        { role: "assistant", content: assistantText, timestamp: now + 1 }
      );
      session.updatedAt = Date.now();
      session.title = session.title || text.slice(0, 48);

      await this.sessionStore.save(session);

      this.postMessage({
        type: "assistant",
        text: assistantText || "<no assistant response>",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.postMessage({ type: "error", text: message });
    }
  }

  private handleRuntimeEvent(event: RuntimeEventMessage): void {
    switch (event.type) {
      case "error":
        this.postMessage({ type: "error", text: event.text });
        break;
      case "tool":
      case "plan":
      case "thinking":
      case "progress":
        this.postMessage({ type: "progress", text: event.text });
        break;
      default:
        break;
    }
  }

  private async ensureSession(): Promise<SessionRecord> {
    if (this.session) {
      return this.session;
    }

    const now = Date.now();
    this.session = {
      id: `session_${randomUUID()}`,
      title: "",
      createdAt: now,
      updatedAt: now,
      messages: [],
      toolCalls: [],
      approvals: [],
    };

    await this.sessionStore.save(this.session);
    return this.session;
  }

  private resetSession(): void {
    this.session = undefined;
    this.runtime = undefined;
    this.eventBus = undefined;
    this.runtimeSessionId = undefined;
    this.pendingDiffs.clear();
    this.artifactSubscription?.unsubscribe();
    this.artifactSubscription = undefined;
  }

  private async ensureRuntime(session: SessionRecord): Promise<RuntimeInstance> {
    if (this.runtime && this.runtimeSessionId === session.id) {
      return this.runtime;
    }

    const resources = await createRuntimeResources({
      sessionId: session.id,
      initialMessages: session.messages,
    });

    this.runtime = resources.runtime;
    this.eventBus = resources.eventBus;
    this.runtimeSessionId = session.id;
    this.attachArtifactListener();

    return resources.runtime;
  }

  private attachArtifactListener(): void {
    if (!this.eventBus) {
      return;
    }

    this.artifactSubscription?.unsubscribe();
    this.artifactSubscription = this.eventBus.subscribe("artifact:emitted", (event) => {
      const payload = event.payload as ArtifactEvents["artifact:emitted"];
      if (!payload?.artifact || payload.artifact.type !== "DiffCard") {
        return;
      }

      const files = extractDiffFiles(payload.artifact.payload);
      if (files.length === 0) {
        return;
      }

      this.ensurePreviewProvider();

      for (const file of files) {
        const resolvedPath = resolveWorkspacePath(file.path);
        if (!resolvedPath) {
          continue;
        }
        this.pendingDiffs.set(resolvedPath, file.diff);
        this.previewProvider?.update(vscode.Uri.file(resolvedPath));
      }

      this.postMessage({
        type: "diffs",
        files: Array.from(this.pendingDiffs.keys()),
      });
    });
  }

  private async fileExists(uri: vscode.Uri): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(uri);
      return true;
    } catch {
      return false;
    }
  }

  private async readDocumentText(uri: vscode.Uri): Promise<string> {
    const document = await vscode.workspace.openTextDocument(uri);
    return document.getText();
  }

  private postMessage(message: WebviewMessage) {
    if (!this.panel) {
      return;
    }
    this.panel.webview.postMessage(message);
  }

  private getHtml() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Keep-Up Agent</title>
  <style>
    :root {
      color-scheme: light dark;
    }
    body { font-family: sans-serif; padding: 16px; }
    textarea { width: 100%; min-height: 120px; }
    button { margin-top: 8px; margin-right: 8px; }
    #log { white-space: pre-wrap; border: 1px solid #444; padding: 8px; min-height: 120px; }
    #diffs { margin-top: 8px; }
    .entry { margin-bottom: 6px; }
    .entry.system { opacity: 0.8; }
    .entry.error { color: #c44; }
  </style>
</head>
<body>
  <h2>Keep-Up Agent</h2>
  <div id="log"></div>
  <textarea id="prompt" placeholder="Describe your task..."></textarea>
  <div>
    <button id="send" type="button">Send</button>
    <button id="apply" type="button">Apply Pending</button>
  </div>
  <div id="diffs"></div>
  <script>
    const vscode = acquireVsCodeApi();
    const prompt = document.getElementById('prompt');
    const log = document.getElementById('log');
    const diffs = document.getElementById('diffs');

    function appendEntry(text, kind = 'system') {
      const entry = document.createElement('div');
      entry.className = 'entry ' + kind;
      entry.textContent = text;
      log.appendChild(entry);
      log.scrollTop = log.scrollHeight;
    }

    document.getElementById('send').addEventListener('click', () => {
      const text = prompt.value.trim();
      if (!text) return;
      appendEntry('> ' + text, 'system');
      vscode.postMessage({ type: 'sendPrompt', text });
      prompt.value = '';
    });

    document.getElementById('apply').addEventListener('click', () => {
      vscode.postMessage({ type: 'applyPending' });
    });

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (!message) return;

      switch (message.type) {
        case 'assistant':
          appendEntry(message.text, 'assistant');
          return;
        case 'prompt':
          prompt.value = message.text || '';
          return;
        case 'progress':
          appendEntry(message.text, 'system');
          return;
        case 'error':
          appendEntry(message.text, 'error');
          return;
        case 'system':
          appendEntry(message.text, 'system');
          return;
        case 'diffs':
          renderDiffs(message.files || []);
          return;
        default:
          return;
      }
    });

    function renderDiffs(files) {
      diffs.innerHTML = '';
      if (!files.length) {
        return;
      }
      const title = document.createElement('div');
      title.textContent = 'Pending diffs (' + files.length + '):';
      diffs.appendChild(title);
      files.forEach((filePath) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'Preview ' + filePath;
        button.addEventListener('click', () => {
          vscode.postMessage({ type: 'previewDiff', filePath });
        });
        diffs.appendChild(button);
      });
    }
  </script>
</body>
</html>`;
  }
}

class KeepUpPreviewProvider implements vscode.TextDocumentContentProvider {
  private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._onDidChange.event;

  constructor(private readonly pendingDiffs: Map<string, string>) {}

  provideTextDocumentContent(uri: vscode.Uri): string {
    const diff = this.pendingDiffs.get(uri.fsPath);
    return diff ?? "No pending diff.";
  }

  update(uri: vscode.Uri) {
    this._onDidChange.fire(uri);
  }
}

type WebviewMessage =
  | { type: "sendPrompt"; text: string }
  | { type: "applyPending" }
  | { type: "previewDiff"; filePath: string }
  | { type: "assistant"; text: string }
  | { type: "progress"; text: string }
  | { type: "error"; text: string }
  | { type: "diffs"; files: string[] }
  | { type: "prompt"; text: string }
  | { type: "system"; text: string };

function extractAssistantText(state: AgentState): string {
  for (let i = state.messages.length - 1; i >= 0; i -= 1) {
    const message = state.messages[i];
    if (message.role === "assistant") {
      return message.content;
    }
  }
  return "";
}

type DiffFileEntry = { path: string; diff: string };

function extractDiffFiles(payload: Record<string, unknown>): DiffFileEntry[] {
  const files = payload.files;
  if (!Array.isArray(files)) {
    return [];
  }
  return files
    .map((file) => {
      if (!file || typeof file !== "object") {
        return undefined;
      }
      const pathValue = (file as { path?: unknown }).path;
      const diffValue = (file as { diff?: unknown }).diff;
      if (typeof pathValue !== "string" || typeof diffValue !== "string") {
        return undefined;
      }
      return { path: pathValue, diff: diffValue };
    })
    .filter((entry): entry is DiffFileEntry => Boolean(entry));
}

function resolveWorkspacePath(relativePath: string): string | undefined {
  if (path.isAbsolute(relativePath)) {
    return relativePath;
  }
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceRoot) {
    return undefined;
  }
  return path.join(workspaceRoot.uri.fsPath, relativePath);
}
