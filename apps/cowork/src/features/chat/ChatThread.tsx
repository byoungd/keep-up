import React from "react";
import { createTask } from "../../api/coworkApi";
import { useWorkspace } from "../../app/providers/WorkspaceProvider";
import { useTaskStream } from "../tasks/hooks/useTaskStream";
import { type ArtifactPayload, type TaskNode, TaskStatus } from "../tasks/types";
import { ChatComposer } from "./ChatComposer";
import { ChatMessageList } from "./ChatMessageList";
import type { ChatMessage } from "./types";

function buildInitialMessages(workspaceName: string | null): ChatMessage[] {
  return [
    {
      id: crypto.randomUUID(),
      role: "assistant",
      content: `Session ready${workspaceName ? ` for ${workspaceName}` : ""}. Ask me to plan or execute a task.`,
      createdAt: Date.now(),
      status: "sent",
    },
  ];
}

function createSystemMessage(content: string, id?: string): ChatMessage {
  return {
    id: id ?? crypto.randomUUID(),
    role: "assistant",
    content,
    createdAt: Date.now(),
    status: "sent",
  };
}

/** Maps TaskStatus to user-friendly message */
function getStatusMessage(
  status: TaskStatus,
  taskTitle?: string,
  failureReason?: string
): string | null {
  const label = taskTitle ?? "Task";
  switch (status) {
    case TaskStatus.PLANNING:
      return `${label}: Planning...`;
    case TaskStatus.RUNNING:
      return `${label}: Running...`;
    case TaskStatus.AWAITING_APPROVAL:
      return `${label}: Awaiting approval`;
    case TaskStatus.COMPLETED:
      return `${label}: Completed ✓`;
    case TaskStatus.FAILED:
      return failureReason ? `${label}: Failed — ${failureReason}` : `${label}: Failed`;
    default:
      return null;
  }
}

/** Generate message for artifact updates */
function getArtifactMessage(artifactId: string, artifact: ArtifactPayload): string {
  switch (artifact.type) {
    case "plan":
      return `Plan updated (${artifact.steps.length} steps)`;
    case "diff":
      return `Diff ready: ${artifact.file}`;
    case "markdown":
      return "Report ready";
    default:
      return `Artifact ready: ${artifactId}`;
  }
}

/** Extract task info from stream nodes */
type TaskInfo = {
  taskId: string;
  title: string;
  status: TaskStatus;
  failureReason?: string;
};

/** Parse status text into TaskStatus enum */
function parseStatusText(statusText: string): TaskStatus | null {
  if (statusText.includes("planning") || statusText.includes("queued")) {
    return TaskStatus.PLANNING;
  }
  if (statusText.includes("ready")) {
    return TaskStatus.PLANNING;
  }
  if (statusText.includes("running")) {
    return TaskStatus.RUNNING;
  }
  if (statusText.includes("awaiting") || statusText.includes("approval")) {
    return TaskStatus.AWAITING_APPROVAL;
  }
  if (statusText.includes("completed")) {
    return TaskStatus.COMPLETED;
  }
  if (statusText.includes("failed") || statusText.includes("cancelled")) {
    return TaskStatus.FAILED;
  }
  return null;
}

/** Extract failure reason from node content */
function extractFailureReason(content: string): string | undefined {
  const reasonMatch = content.match(/failed[:\s]+(.+)$/i);
  return reasonMatch ? reasonMatch[1].trim() : undefined;
}

/** Parse a single thinking node into TaskInfo */
function parseThinkingNode(node: TaskNode): TaskInfo | null {
  if (node.type !== "thinking" || !node.content) {
    return null;
  }

  // Cast id to string - the BaseNode.id type is z.infer<typeof z.string> which is string
  const nodeId = String(node.id);
  const taskMatch = nodeId.match(/^task-([^-]+)/);
  if (!taskMatch) {
    return null;
  }

  const taskId = taskMatch[1];
  const contentMatch = node.content.match(/^(.+?)\s*·\s*(.+)$/);
  if (!contentMatch) {
    return null;
  }

  const title = contentMatch[1];
  const statusText = contentMatch[2].toLowerCase().replace(/\s+/g, "_");
  const status = parseStatusText(statusText);

  if (!status) {
    return null;
  }

  const failureReason =
    status === TaskStatus.FAILED ? extractFailureReason(node.content) : undefined;

  return { taskId, title, status, failureReason };
}

function extractTaskInfoFromNodes(nodes: TaskNode[]): Map<string, TaskInfo> {
  const tasks = new Map<string, TaskInfo>();

  for (const node of nodes) {
    const info = parseThinkingNode(node);
    if (info) {
      tasks.set(info.taskId, info);
    }
  }

  return tasks;
}

export function ChatThread({ sessionId }: { sessionId: string }) {
  const { getSession, getWorkspace } = useWorkspace();
  const session = getSession(sessionId);
  const workspace = session ? getWorkspace(session.workspaceId) : null;

  const [messages, setMessages] = React.useState<ChatMessage[]>(() =>
    buildInitialMessages(workspace?.name ?? null)
  );
  const [isSending, setIsSending] = React.useState(false);

  // De-duplication: Key = "taskId:status" for status, "artifact:id" for artifacts
  const shownItemsRef = React.useRef(new Set<string>());

  // Track task titles from createTask response for immediate use
  const taskTitlesRef = React.useRef(new Map<string, string>());

  // Subscribe to task stream
  const { graph } = useTaskStream(sessionId);

  // Track previous nodes/artifacts count to detect changes
  const prevNodesLengthRef = React.useRef(0);
  const prevArtifactKeysRef = React.useRef<string[]>([]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: sessionId is required to reset chat even if workspace name is the same
  React.useEffect(() => {
    setMessages(buildInitialMessages(workspace?.name ?? null));
    setIsSending(false);
    shownItemsRef.current.clear();
    taskTitlesRef.current.clear();
    prevNodesLengthRef.current = 0;
    prevArtifactKeysRef.current = [];
  }, [sessionId, workspace?.name]);

  // React to task stream changes - status updates per task
  React.useEffect(() => {
    // Skip if no new nodes
    if (graph.nodes.length === prevNodesLengthRef.current) {
      return;
    }
    prevNodesLengthRef.current = graph.nodes.length;

    const taskInfoMap = extractTaskInfoFromNodes(graph.nodes);
    const newMessages: ChatMessage[] = [];

    for (const [taskId, info] of taskInfoMap) {
      const dedupeKey = `task:${taskId}:${info.status}`;

      if (shownItemsRef.current.has(dedupeKey)) {
        continue;
      }

      // Use stored title from createTask if available, otherwise use extracted
      const title = taskTitlesRef.current.get(taskId) ?? info.title;
      const statusMessage = getStatusMessage(info.status, title, info.failureReason);

      if (statusMessage) {
        shownItemsRef.current.add(dedupeKey);
        newMessages.push(createSystemMessage(statusMessage, `status-${dedupeKey}`));
      }
    }

    if (newMessages.length > 0) {
      setMessages((prev) => [...prev, ...newMessages]);
    }
  }, [graph.nodes]);

  // React to artifact changes
  React.useEffect(() => {
    const currentKeys = Object.keys(graph.artifacts);
    const prevKeys = prevArtifactKeysRef.current;

    // Find new artifact keys
    const newKeys = currentKeys.filter((key) => !prevKeys.includes(key));
    prevArtifactKeysRef.current = currentKeys;

    if (newKeys.length === 0) {
      return;
    }

    const newMessages: ChatMessage[] = [];

    for (const artifactId of newKeys) {
      const dedupeKey = `artifact:${artifactId}`;

      if (shownItemsRef.current.has(dedupeKey)) {
        continue;
      }

      const artifact = graph.artifacts[artifactId];
      if (!artifact) {
        continue;
      }

      shownItemsRef.current.add(dedupeKey);
      const message = getArtifactMessage(artifactId, artifact);
      newMessages.push(createSystemMessage(message, dedupeKey));
    }

    if (newMessages.length > 0) {
      setMessages((prev) => [...prev, ...newMessages]);
    }
  }, [graph.artifacts]);

  const handleSend = React.useCallback(
    async (content: string) => {
      // Validate sessionId
      if (!sessionId) {
        setMessages((prev) => [
          ...prev,
          createSystemMessage("Error: No active session. Please select or create a session first."),
        ]);
        return;
      }

      // Add user message with "sending" status
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content,
        createdAt: Date.now(),
        status: "sending",
      };
      setMessages((prev) => [...prev, userMessage]);
      setIsSending(true);

      try {
        // Create task via API
        const task = await createTask(sessionId, { prompt: content });

        // Store task title for status messages
        if (task.taskId && task.title) {
          taskTitlesRef.current.set(task.taskId, task.title);
        }

        // Mark user message as sent and add success response
        setMessages((prev) => {
          const updated = prev.map((msg) =>
            msg.id === userMessage.id ? { ...msg, status: "sent" as const } : msg
          );
          const taskTitle = task.title || "Untitled task";
          return [...updated, createSystemMessage(`Task queued: ${taskTitle}`)];
        });
      } catch (err) {
        // Mark user message as sent and add error response
        const errorMessage = err instanceof Error ? err.message : "Unknown error occurred";
        setMessages((prev) => {
          const updated = prev.map((msg) =>
            msg.id === userMessage.id ? { ...msg, status: "sent" as const } : msg
          );
          return [...updated, createSystemMessage(`Failed to create task: ${errorMessage}`)];
        });
      } finally {
        setIsSending(false);
      }
    },
    [sessionId]
  );

  return (
    <section className="chat-panel">
      <div className="context-strip">
        <span className="pill">Threaded Context</span>
        <span className="pill pill--outline">Workspace: {workspace?.name ?? "None"}</span>
        <span className="pill pill--outline">Session: {session?.title ?? "Unknown"}</span>
      </div>
      <ChatMessageList messages={messages} />
      <ChatComposer onSend={handleSend} isBusy={isSending} />
    </section>
  );
}
