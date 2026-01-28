import path from "node:path";
import { applyPatch } from "diff";
import * as vscode from "vscode";
import {
  type CoworkFolderGrant,
  createCoworkSession,
  createCoworkTask,
  getCoworkSession,
  resolveCoworkApproval,
  resolveCoworkBaseUrl,
  submitCoworkClarification,
} from "../runtime/coworkGateway";
import { type CoworkEvent, CoworkStreamClient } from "../runtime/coworkStream";

const SESSION_ID_KEY = "keepupSessionId";
const BASE_URL_KEY = "keepupCoworkBaseUrl";

export class AgentPanel {
  private panel?: vscode.WebviewPanel;
  private previewProvider?: KeepUpPreviewProvider;
  private readonly pendingDiffs = new Map<string, string>();
  private coworkSessionId?: string;
  private coworkBaseUrl?: string;
  private coworkStream?: CoworkStreamClient;
  private lastEventId?: string | null;
  private readonly pendingApprovals = new Set<string>();
  private readonly pendingClarifications = new Set<string>();
  private readonly eventHandlers: Record<string, (data: unknown) => void> = {
    "task.created": (data) => this.handleTaskUpdate(data),
    "task.updated": (data) => this.handleTaskUpdate(data),
    "task.completed": () => this.handleTaskCompleted(),
    "task.failed": (data) => this.handleTaskFailed(data),
    "agent.think": () => this.handleAgentThink(),
    "agent.turn.start": (data) => this.handleAgentTurnStart(data),
    "agent.turn.end": (data) => this.handleAgentTurnEnd(data),
    "agent.tool.call": (data) => this.handleToolCall(data),
    "agent.tool.result": (data) => this.handleToolResult(data),
    "agent.plan": (data) => this.handlePlanUpdate(data),
    "task.plan": (data) => this.handlePlanUpdate(data),
    "approval.required": (data) => this.handleApprovalRequiredEvent(data),
    "approval.resolved": (data) => this.handleApprovalResolved(data),
    "clarification.requested": (data) => this.handleClarificationRequestedEvent(data),
    "clarification.answered": () => this.handleClarificationAnswered(),
    "policy.decision": (data) => this.handlePolicyDecision(data),
    "agent.artifact": (data) => this.handleArtifactEvent(data),
    "context.compaction": (data) => this.handleContextCompaction(data),
    "session.mode.changed": (data) => this.handleSessionModeChanged(data),
  };

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
      this.stopStream();
      this.coworkSessionId = undefined;
      this.pendingDiffs.clear();
      this.pendingApprovals.clear();
      this.pendingClarifications.clear();
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
    await this.resetSession({ clearStored: true });
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
      const sessionId = await this.ensureSession();
      const title = buildTaskTitle(text);

      this.postMessage({ type: "system", text: "Queuing task..." });
      const task = await createCoworkTask(
        sessionId,
        { prompt: text, title },
        { baseUrl: this.coworkBaseUrl }
      );

      this.postMessage({
        type: "system",
        text: `Task queued: ${task.title}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.postMessage({ type: "error", text: message });
    }
  }

  private async ensureSession(): Promise<string> {
    const baseUrl = this.resolveBaseUrl();
    if (this.coworkBaseUrl && this.coworkBaseUrl !== baseUrl) {
      await this.resetSession({ clearStored: true });
    }
    this.coworkBaseUrl = baseUrl;

    if (this.coworkSessionId) {
      return this.coworkSessionId;
    }

    const storedId = this.context.workspaceState.get<string>(SESSION_ID_KEY);
    const storedBase = this.context.workspaceState.get<string>(BASE_URL_KEY);
    if (storedId && (!storedBase || storedBase === baseUrl)) {
      try {
        await getCoworkSession(storedId, { baseUrl });
        this.coworkSessionId = storedId;
        this.startStream(storedId);
        return storedId;
      } catch {
        // fall through to create new session
      }
    }

    const sessionId = await this.createSession();
    return sessionId;
  }

  private async createSession(): Promise<string> {
    const workspaceName = vscode.workspace.workspaceFolders?.[0]?.name ?? "Workspace";
    const grants = collectWorkspaceGrants();
    if (grants.length === 0) {
      this.postMessage({
        type: "system",
        text: "No workspace folders detected. Tasks may have limited file access.",
      });
    }

    const session = await createCoworkSession(
      {
        userId: vscode.env.machineId ?? "vscode",
        deviceId: vscode.env.sessionId ?? "vscode-session",
        title: `VS Code: ${workspaceName}`,
        grants,
      },
      { baseUrl: this.coworkBaseUrl }
    );

    this.coworkSessionId = session.sessionId;
    this.lastEventId = null;
    await this.context.workspaceState.update(SESSION_ID_KEY, session.sessionId);
    await this.context.workspaceState.update(BASE_URL_KEY, this.coworkBaseUrl);
    this.startStream(session.sessionId);
    return session.sessionId;
  }

  private startStream(sessionId: string) {
    this.stopStream();
    const baseUrl = this.coworkBaseUrl ?? this.resolveBaseUrl();
    this.coworkStream = new CoworkStreamClient({
      baseUrl,
      sessionId,
      lastEventId: this.lastEventId,
      onEvent: (event) => this.handleCoworkEvent(event),
      onError: (error) => {
        this.postMessage({ type: "error", text: error.message });
      },
      onOpen: () => {
        this.postMessage({ type: "system", text: "Connected to Cowork stream." });
      },
    });

    void this.coworkStream.start();
  }

  private stopStream() {
    if (!this.coworkStream) {
      return;
    }
    this.lastEventId = this.coworkStream.getLastEventId();
    this.coworkStream.stop();
    this.coworkStream = undefined;
  }

  private async resetSession(options: { clearStored?: boolean } = {}) {
    this.stopStream();
    this.coworkSessionId = undefined;
    this.pendingDiffs.clear();
    this.pendingApprovals.clear();
    this.pendingClarifications.clear();
    if (options.clearStored) {
      await this.context.workspaceState.update(SESSION_ID_KEY, undefined);
      await this.context.workspaceState.update(BASE_URL_KEY, undefined);
    }
  }

  private handleCoworkEvent(event: CoworkEvent): void {
    this.lastEventId = event.id;
    const handler = this.eventHandlers[event.type];
    if (handler) {
      handler(event.data);
    }
  }

  private handleTaskUpdate(data: unknown): void {
    if (!isRecord(data)) {
      return;
    }
    const status = asString(data.status);
    const title = asString(data.title);
    this.postMessage({
      type: "progress",
      text: `[task] ${status ?? "updated"}${title ? `: ${title}` : ""}`,
    });
  }

  private handleTaskCompleted(): void {
    this.postMessage({ type: "progress", text: "[task] completed" });
  }

  private handleTaskFailed(data: unknown): void {
    const reason = isRecord(data) ? asString(data.error) : undefined;
    this.postMessage({
      type: "error",
      text: reason ? `[task] failed: ${reason}` : "[task] failed",
    });
  }

  private handleAgentThink(): void {
    this.postMessage({ type: "progress", text: "[agent] thinking..." });
  }

  private handleAgentTurnStart(data: unknown): void {
    const turn = isRecord(data) ? asNumber(data.turn) : undefined;
    this.postMessage({
      type: "progress",
      text: `[agent] turn${turn ? ` ${turn}` : ""} started`,
    });
  }

  private handleAgentTurnEnd(data: unknown): void {
    const turn = isRecord(data) ? asNumber(data.turn) : undefined;
    this.postMessage({
      type: "progress",
      text: `[agent] turn${turn ? ` ${turn}` : ""} ended`,
    });
  }

  private handleToolCall(data: unknown): void {
    if (!isRecord(data)) {
      return;
    }
    const tool = asString(data.tool ?? data.toolName) ?? "unknown";
    const args = isRecord(data.args) ? data.args : {};
    const label = asString(data.activityLabel);
    const approval = data.requiresApproval === true ? " [approval required]" : "";
    this.postMessage({
      type: "progress",
      text: `[tool] ${tool}${label ? ` (${label})` : ""}${approval} -> ${formatArgs(args)}`,
    });
  }

  private handleToolResult(data: unknown): void {
    if (!isRecord(data)) {
      return;
    }
    const tool = asString(data.toolName ?? data.tool) ?? "unknown";
    const isError = data.isError === true;
    const duration = asNumber(data.durationMs);
    this.postMessage({
      type: "progress",
      text: `[tool] ${tool} ${isError ? "failed" : "completed"}${
        duration ? ` (${duration}ms)` : ""
      }`,
    });
  }

  private handlePlanUpdate(data: unknown): void {
    if (!isRecord(data)) {
      return;
    }
    const summary = formatPlanSummary(data.plan);
    this.postMessage({
      type: "progress",
      text: summary ? `[plan] ${summary}` : "[plan] updated",
    });
  }

  private handleApprovalRequiredEvent(data: unknown): void {
    if (isRecord(data)) {
      void this.handleApprovalRequired(data);
    }
  }

  private handleApprovalResolved(data: unknown): void {
    if (!isRecord(data)) {
      return;
    }
    const status = asString(data.status) ?? "updated";
    this.postMessage({ type: "progress", text: `[approval] ${status}` });
  }

  private handleClarificationRequestedEvent(data: unknown): void {
    if (isRecord(data)) {
      void this.handleClarificationRequested(data);
    }
  }

  private handleClarificationAnswered(): void {
    this.postMessage({ type: "progress", text: "[clarification] answered" });
  }

  private handlePolicyDecision(data: unknown): void {
    if (!isRecord(data)) {
      return;
    }
    const decision = asString(data.decision);
    const tool = asString(data.toolName);
    const reason = asString(data.reason);
    this.postMessage({
      type: "progress",
      text: `[policy] ${tool ?? "tool"} -> ${decision ?? "decision"}${
        reason ? ` (${reason})` : ""
      }`,
    });
  }

  private handleContextCompaction(data: unknown): void {
    if (!isRecord(data)) {
      return;
    }
    const before = asNumber(data.messagesBefore);
    const after = asNumber(data.messagesAfter);
    const ratio = asNumber(data.compressionRatio);
    this.postMessage({
      type: "progress",
      text: `[context] compressed${before && after ? ` ${before} -> ${after}` : ""}${
        ratio ? ` (${ratio.toFixed(2)}x)` : ""
      }`,
    });
  }

  private handleSessionModeChanged(data: unknown): void {
    if (!isRecord(data)) {
      return;
    }
    const mode = asString(data.mode);
    this.postMessage({
      type: "progress",
      text: `[session] mode: ${mode ?? "updated"}`,
    });
  }

  private handleArtifactEvent(data: unknown): void {
    if (!isRecord(data) || !isRecord(data.artifact)) {
      return;
    }
    const artifact = data.artifact;
    const type = asString(artifact.type);
    if (!type) {
      return;
    }

    if (type === "DiffCard" || type === "diff") {
      const files = extractDiffFiles(type, artifact);
      if (files.length > 0) {
        this.addDiffs(files);
        this.postMessage({
          type: "system",
          text: `Diff ready (${files.length} file${files.length === 1 ? "" : "s"})`,
        });
      }
      return;
    }

    const message = formatArtifactMessage(type, artifact);
    if (message) {
      this.postMessage({ type: "assistant", text: message });
    }
  }

  private addDiffs(files: DiffFileEntry[]) {
    this.ensurePreviewProvider();
    let updated = false;

    for (const file of files) {
      const resolvedPath = resolveWorkspacePath(file.path);
      if (!resolvedPath) {
        this.postMessage({ type: "error", text: `Cannot resolve diff path: ${file.path}` });
        continue;
      }
      this.pendingDiffs.set(resolvedPath, file.diff);
      this.previewProvider?.update(vscode.Uri.file(resolvedPath));
      updated = true;
    }

    if (updated) {
      this.postMessage({
        type: "diffs",
        files: Array.from(this.pendingDiffs.keys()),
      });
    }
  }

  private async handleApprovalRequired(data: Record<string, unknown>) {
    const approvalId = asString(data.approvalId);
    if (!approvalId || this.pendingApprovals.has(approvalId)) {
      return;
    }
    this.pendingApprovals.add(approvalId);

    const action = asString(data.action) ?? "approval required";
    const reason = asString(data.reason);
    const riskTags = asArray<string>(data.riskTags).filter((tag) => typeof tag === "string");
    const detailParts = [];
    if (reason) {
      detailParts.push(`Reason: ${reason}`);
    }
    if (riskTags.length > 0) {
      detailParts.push(`Risk tags: ${riskTags.join(", ")}`);
    }

    const choice =
      detailParts.length > 0
        ? await vscode.window.showWarningMessage(
            action,
            { detail: detailParts.join("\n") },
            "Approve",
            "Reject"
          )
        : await vscode.window.showWarningMessage(action, "Approve", "Reject");

    if (choice === "Approve") {
      await resolveCoworkApproval(
        approvalId,
        { status: "approved" },
        { baseUrl: this.coworkBaseUrl }
      );
      this.postMessage({ type: "progress", text: "[approval] approved" });
      this.pendingApprovals.delete(approvalId);
    } else if (choice === "Reject") {
      await resolveCoworkApproval(
        approvalId,
        { status: "rejected" },
        { baseUrl: this.coworkBaseUrl }
      );
      this.postMessage({ type: "progress", text: "[approval] rejected" });
      this.pendingApprovals.delete(approvalId);
    }
  }

  private async handleClarificationRequested(data: Record<string, unknown>) {
    const request = isRecord(data.request) ? data.request : data;
    const requestId = asString(request.id);
    if (!requestId || this.pendingClarifications.has(requestId)) {
      return;
    }
    this.pendingClarifications.add(requestId);

    const question = asString(request.question) ?? "Clarification requested";
    const options = asArray<string>(request.options).filter((option) => typeof option === "string");

    let answer: string | undefined;
    let selectedOption: number | undefined;

    if (options.length > 0) {
      const items = [...options, "Custom response..."];
      const pick = await vscode.window.showQuickPick(items, {
        title: question,
        placeHolder: "Select an option or enter a custom response",
      });
      if (!pick) {
        return;
      }
      if (pick === "Custom response...") {
        answer = await vscode.window.showInputBox({ prompt: question });
      } else {
        answer = pick;
        selectedOption = options.indexOf(pick);
      }
    } else {
      answer = await vscode.window.showInputBox({ prompt: question });
    }

    if (!answer?.trim()) {
      return;
    }

    await submitCoworkClarification(
      requestId,
      { answer: answer.trim(), selectedOption },
      { baseUrl: this.coworkBaseUrl }
    );
    this.postMessage({ type: "progress", text: "[clarification] submitted" });
    this.pendingClarifications.delete(requestId);
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

  private resolveBaseUrl(): string {
    const config = vscode.workspace.getConfiguration("keepup");
    const override = config.get<string>("coworkBaseUrl");
    return resolveCoworkBaseUrl(override);
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

type DiffFileEntry = { path: string; diff: string };

function collectWorkspaceGrants(): CoworkFolderGrant[] {
  const folders = vscode.workspace.workspaceFolders ?? [];
  return folders.map((folder, index) => ({
    id: `grant-${index + 1}`,
    rootPath: folder.uri.fsPath,
    allowWrite: true,
    allowDelete: true,
    allowCreate: true,
  }));
}

function buildTaskTitle(prompt: string): string | undefined {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.length > 80 ? `${trimmed.slice(0, 77)}...` : trimmed;
}

function extractDiffFiles(type: string, artifact: Record<string, unknown>): DiffFileEntry[] {
  if (type === "diff") {
    const file = asString(artifact.file);
    const diff = asString(artifact.diff);
    if (file && diff) {
      return [{ path: file, diff }];
    }
    return [];
  }

  const files = artifact.files;
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

type ArtifactFormatter = (artifact: Record<string, unknown>) => string | null;

const ARTIFACT_FORMATTERS: Record<string, ArtifactFormatter> = {
  markdown: formatMarkdownArtifact,
  ReportCard: formatReportCardArtifact,
  ReviewReport: formatReviewReportArtifact,
  TestReport: formatTestReportArtifact,
  ChecklistCard: formatChecklistCardArtifact,
  PlanCard: formatPlanCardArtifact,
  plan: formatPlanArtifact,
};

function formatArtifactMessage(type: string, artifact: Record<string, unknown>): string | null {
  const formatter = ARTIFACT_FORMATTERS[type];
  return formatter ? formatter(artifact) : null;
}

function formatMarkdownArtifact(artifact: Record<string, unknown>): string | null {
  const content = asString(artifact.content);
  return content ?? null;
}

function formatReportCardArtifact(artifact: Record<string, unknown>): string | null {
  const summary = asString(artifact.summary);
  const sections = asArray<{ heading?: string; content?: string }>(artifact.sections);
  const lines = ["Report"];
  if (summary) {
    lines.push(summary);
  }
  for (const section of sections) {
    const heading = section ? asString(section.heading) : undefined;
    const content = section ? asString(section.content) : undefined;
    if (heading && content) {
      lines.push(`- ${heading}: ${content}`);
    }
  }
  return lines.length > 1 ? lines.join("\n") : null;
}

function formatReviewReportArtifact(artifact: Record<string, unknown>): string | null {
  const summary = asString(artifact.summary);
  const risks = asArray<string>(artifact.risks).filter((risk) => typeof risk === "string");
  const recommendations = asArray<string>(artifact.recommendations).filter(
    (rec) => typeof rec === "string"
  );
  const lines = ["Review Report"];
  if (summary) {
    lines.push(summary);
  }
  if (risks.length > 0) {
    lines.push(`Risks: ${risks.join("; ")}`);
  }
  if (recommendations.length > 0) {
    lines.push(`Recommendations: ${recommendations.join("; ")}`);
  }
  return lines.length > 1 ? lines.join("\n") : null;
}

function formatTestReportArtifact(artifact: Record<string, unknown>): string | null {
  const command = asString(artifact.command);
  const status = asString(artifact.status);
  const summary = asString(artifact.summary);
  const lines = ["Test Report"];
  if (command) {
    lines.push(`Command: ${command}`);
  }
  if (status) {
    lines.push(`Status: ${status}`);
  }
  if (summary) {
    lines.push(summary);
  }
  return lines.length > 1 ? lines.join("\n") : null;
}

function formatChecklistCardArtifact(artifact: Record<string, unknown>): string | null {
  const title = asString(artifact.title) ?? "Checklist";
  const items = asArray<{ label?: string; checked?: boolean }>(artifact.items);
  const lines = [title];
  for (const item of items) {
    const label = item ? asString(item.label) : undefined;
    if (label) {
      lines.push(`- [${item?.checked ? "x" : " "}] ${label}`);
    }
  }
  return lines.length > 1 ? lines.join("\n") : null;
}

function formatPlanCardArtifact(artifact: Record<string, unknown>): string | null {
  const goal = asString(artifact.goal) ?? "Plan";
  const summary = asString(artifact.summary);
  const steps = asArray<{ title?: string; status?: string }>(artifact.steps);
  const lines = [goal];
  if (summary) {
    lines.push(summary);
  }
  if (steps.length > 0) {
    lines.push("Steps:");
    for (const step of steps) {
      const title = asString(step?.title);
      const status = asString(step?.status);
      if (title) {
        lines.push(`- ${title}${status ? ` (${status})` : ""}`);
      }
    }
  }
  return lines.length > 1 ? lines.join("\n") : null;
}

function formatPlanArtifact(artifact: Record<string, unknown>): string | null {
  const steps = asArray<{ label?: string; status?: string }>(artifact.steps);
  if (steps.length === 0) {
    return null;
  }
  const lines = ["Plan"];
  for (const step of steps) {
    const label = asString(step?.label);
    const status = asString(step?.status);
    if (label) {
      lines.push(`- ${label}${status ? ` (${status})` : ""}`);
    }
  }
  return lines.length > 1 ? lines.join("\n") : null;
}

function formatPlanSummary(plan: unknown): string | null {
  if (!Array.isArray(plan)) {
    return null;
  }
  const labels = plan
    .map((item) => (isRecord(item) ? asString(item.label ?? item.title) : undefined))
    .filter((value): value is string => Boolean(value));
  if (labels.length === 0) {
    return null;
  }
  return `${labels.length} steps: ${labels.slice(0, 3).join(", ")}${labels.length > 3 ? "…" : ""}`;
}

function formatArgs(args: Record<string, unknown>): string {
  const entries = Object.entries(args);
  if (entries.length === 0) {
    return "{}";
  }
  try {
    return JSON.stringify(args);
  } catch {
    return "{...}";
  }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}
