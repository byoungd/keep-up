import path from "node:path";
import * as vscode from "vscode";

export class AgentPanel {
  private panel?: vscode.WebviewPanel;
  private previewProvider?: KeepUpPreviewProvider;
  private readonly pendingDiffs = new Map<string, string>();

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
    });

    this.panel.webview.onDidReceiveMessage(async (message: WebviewMessage) => {
      switch (message.type) {
        case "sendPrompt":
          await this.handlePrompt(message.text);
          break;
        case "applyDiff":
          this.updatePendingDiff(message.filePath, message.diff);
          break;
        default:
          break;
      }
    });
  }

  startNewTask() {
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

  applyPendingChanges() {
    this.postMessage({ type: "system", text: "Apply changes requested" });
    void vscode.window.showInformationMessage("Apply changes is not wired yet.");
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

  private updatePendingDiff(filePath: string, diff: string) {
    this.pendingDiffs.set(filePath, diff);
    this.previewProvider?.update(vscode.Uri.file(filePath));
  }

  private async handlePrompt(text: string) {
    void text;
    this.postMessage({ type: "response", text: "Prompt received. Running..." });
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
    body { font-family: sans-serif; padding: 16px; }
    textarea { width: 100%; min-height: 120px; }
    button { margin-top: 8px; }
  </style>
</head>
<body>
  <h2>Keep-Up Agent</h2>
  <textarea id="prompt" placeholder="Describe your task..."></textarea>
  <button id="send">Send</button>
  <pre id="output"></pre>
  <script>
    const vscode = acquireVsCodeApi();
    const prompt = document.getElementById('prompt');
    const output = document.getElementById('output');

    document.getElementById('send').addEventListener('click', () => {
      vscode.postMessage({ type: 'sendPrompt', text: prompt.value });
    });

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message?.text) {
        output.textContent = message.text;
      }
    });
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
  | { type: "applyDiff"; filePath: string; diff: string }
  | { type: "prompt"; text: string }
  | { type: "response"; text: string }
  | { type: "system"; text: string };
