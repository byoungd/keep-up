import * as vscode from "vscode";
import { AgentPanel } from "./panels/AgentPanel";

export function activate(context: vscode.ExtensionContext) {
  const agentPanel = new AgentPanel(context);

  context.subscriptions.push(
    vscode.commands.registerCommand("keepup.newTask", () => {
      agentPanel.show();
      agentPanel.startNewTask();
    }),
    vscode.commands.registerCommand("keepup.continueTask", () => {
      agentPanel.show();
    }),
    vscode.commands.registerCommand("keepup.showDiff", (filePath: string) => {
      agentPanel.showDiffPreview(filePath);
    }),
    vscode.commands.registerCommand("keepup.applyChanges", () => {
      agentPanel.applyPendingChanges();
    }),
    vscode.commands.registerCommand("keepup.explainFile", async (uri: vscode.Uri) => {
      const content = await vscode.workspace.fs.readFile(uri);
      agentPanel.show();
      agentPanel.sendPrompt(`Explain this file: ${uri.fsPath}\n\n${content}`);
    })
  );

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.text = "$(robot) Keep-Up";
  statusBar.command = "keepup.newTask";
  statusBar.show();
  context.subscriptions.push(statusBar);
}

export function deactivate() {
  // No-op for now.
}
