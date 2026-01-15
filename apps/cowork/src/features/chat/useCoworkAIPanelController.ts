import {
  MODEL_CATALOG,
  type ModelCapability,
  getDefaultModelId,
  getModelCapability,
  normalizeModelId,
} from "@ku0/ai-core";
import type { AgentTask, ArtifactItem, Message, TaskStep } from "@ku0/shell";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { createTask } from "../../api/coworkApi";
import { useWorkspace } from "../../app/providers/WorkspaceProvider";
import { useTaskStream } from "../tasks/hooks/useTaskStream";
import type { ArtifactPayload, PlanUpdateNode, TaskGraph, TaskStatusNode } from "../tasks/types";

export function useCoworkAIPanelController() {
  const { sessionId } = useParams({ strict: false }) as { sessionId: string };
  const navigate = useNavigate();
  const {
    getSession,
    getWorkspace,
    createSessionForPath,
    createSessionWithoutGrant,
    activeWorkspaceId,
  } = useWorkspace();
  const session = sessionId ? getSession(sessionId) : null;
  const workspace = session ? getWorkspace(session.workspaceId) : null;

  const defaultModelId = useMemo(() => getDefaultModelId(), []);
  const [model, setModel] = useState(defaultModelId);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Subscribe to task stream (safely handles missing sessionId by returning disconnected state)
  const { graph } = useTaskStream(sessionId);

  // Derive messages from graph nodes
  const messages = useMemo<Message[]>(
    () => generateMessages(graph.nodes, workspace?.name, sessionId, session?.createdAt),
    [graph.nodes, workspace?.name, sessionId, session?.createdAt]
  );

  // Derive tasks from graph for TaskProgressWidget
  const tasks = useMemo<AgentTask[]>(() => generateTasks(graph), [graph]);

  // Debug log for input changes
  // useEffect(() => {
  //   console.log("Input state changed:", input);
  // }, [input]);

  const handleSend = useCallback(async () => {
    const content = input.trim();
    if (!content || isSending) {
      return;
    }

    setStatusMessage(null);
    setInput("");
    setIsSending(true);

    try {
      let targetSessionId = sessionId;

      // If no session is active, create one first
      if (!targetSessionId || targetSessionId === "undefined") {
        if (activeWorkspaceId) {
          const newSession = await createSessionForPath(activeWorkspaceId);
          targetSessionId = newSession.id;
        } else {
          const newSession = await createSessionWithoutGrant();
          targetSessionId = newSession.id;
        }
      }

      await createTask(targetSessionId, { prompt: content });

      // Navigate ONLY if we created a new session/shifted context
      if (targetSessionId !== sessionId) {
        await navigate({
          to: "/sessions/$sessionId",
          params: { sessionId: targetSessionId },
        });
      }
    } catch (err) {
      console.error("Failed to create task:", err);
      // If we failed, restore input so user doesn't lose it
      setInput(content);
      setStatusMessage(
        "Unable to start a session. Ensure the Cowork server is running, then try again."
      );
    } finally {
      setIsSending(false);
    }
  }, [
    input,
    sessionId,
    isSending,
    activeWorkspaceId,
    createSessionForPath,
    createSessionWithoutGrant,
    navigate,
  ]);

  const handleAbort = useCallback(() => {
    /* No abort logic required for this controller */
  }, []);

  const filteredModels = useMemo<ModelCapability[]>(() => MODEL_CATALOG, []);

  const handleSetModel = useCallback(
    (nextModel: string) => {
      const normalized = normalizeModelId(nextModel) ?? nextModel;
      const resolved = getModelCapability(normalized);
      setModel(resolved?.id ?? defaultModelId);
    },
    [defaultModelId]
  );

  return {
    messages,
    input,
    setInput,
    inputRef,
    listRef,
    isLoading: isSending, // Only show loading when actively sending/waiting, not just when connecting
    isStreaming: isSending,
    model,
    setModel: handleSetModel,
    filteredModels,
    handleSend,
    handleAbort,
    // Add other properties required by ShellAIPanel
    pendingApproval: null,
    approvalBusy: false,
    approvalError: null,
    attachments: [],
    onAddAttachment: () => {
      /* Attachments not supported yet */
    },
    onRemoveAttachment: () => {
      /* Attachments not supported yet */
    },
    fileInputRef: { current: null },
    onFileChange: () => {
      /* Attachments not supported yet */
    },
    statusMessage,
    tasks,
  };
}

function generateMessages(
  nodes: TaskGraph["nodes"],
  workspaceName: string | undefined,
  sessionId: string | undefined,
  sessionCreatedAt: number | undefined
): Message[] {
  const msgs: Message[] = [
    {
      id: "initial",
      role: "assistant",
      content:
        sessionId && sessionId !== "undefined"
          ? `Session ready${workspaceName ? ` for ${workspaceName}` : ""}. Ask me to plan or execute a task.`
          : "Send a message to start a session.",
      createdAt: sessionCreatedAt ?? Date.now(),
      status: "done",
    },
  ];

  for (const node of nodes) {
    if (node.type === "thinking") {
      msgs.push({
        id: String(node.id),
        role: "assistant",
        content: String(node.content),
        createdAt: new Date(node.timestamp).getTime(),
        status: "done",
      });
    }
  }

  return msgs;
}

/**
 * Converts TaskGraph into an array of AgentTask for the TaskProgressWidget.
 * Maps TaskStatusNode entries as tasks and PlanUpdateNode for steps/artifacts.
 */
function generateTasks(graph: TaskGraph): AgentTask[] {
  // Find all task_status nodes to define tasks
  const taskStatusNodes = graph.nodes.filter(
    (node): node is TaskStatusNode => node.type === "task_status"
  );

  if (taskStatusNodes.length === 0) {
    return buildSyntheticTask(graph);
  }

  return buildTasksFromNodes(taskStatusNodes, graph);
}

/** Build a synthetic task when no explicit task_status nodes exist */
function buildSyntheticTask(graph: TaskGraph): AgentTask[] {
  if (!graph.status || graph.nodes.length === 0) {
    return [];
  }

  const steps = extractStepsFromGraph(graph);
  const artifacts = extractArtifactsFromGraph(graph.artifacts);
  const progress = calculateProgress(steps);
  const status = mapGraphStatus(graph.status);

  return [
    {
      id: graph.sessionId,
      label: "Current Task",
      status,
      progress,
      steps,
      artifacts,
    },
  ];
}

/** Build tasks from explicit TaskStatusNode entries */
function buildTasksFromNodes(taskStatusNodes: TaskStatusNode[], graph: TaskGraph): AgentTask[] {
  return taskStatusNodes.map((taskNode) => {
    const steps = extractStepsFromArtifacts(graph.artifacts);
    const artifacts = extractArtifactsFromGraph(graph.artifacts);
    const progress = calculateProgress(steps);
    const status = mapCoworkStatus(taskNode.status);

    return {
      id: taskNode.taskId,
      label: taskNode.title,
      status,
      progress,
      steps,
      artifacts,
    };
  });
}

/** Extract steps from plan_update nodes in the graph */
function extractStepsFromGraph(graph: TaskGraph): TaskStep[] {
  const steps: TaskStep[] = [];

  for (const node of graph.nodes) {
    if (node.type === "plan_update") {
      const planNode = node as PlanUpdateNode;
      if (planNode.plan.type === "plan") {
        for (const step of planNode.plan.steps) {
          steps.push({
            id: step.id,
            label: step.label,
            status: step.status === "in_progress" ? "running" : step.status,
          });
        }
      }
    }
  }

  return steps;
}

/** Extract steps from artifacts (for tasks with explicit task_status nodes) */
function extractStepsFromArtifacts(artifacts: Record<string, ArtifactPayload>): TaskStep[] {
  const steps: TaskStep[] = [];

  for (const artifact of Object.values(artifacts)) {
    if (artifact.type === "plan") {
      for (const step of artifact.steps) {
        steps.push({
          id: step.id,
          label: step.label,
          status: step.status === "in_progress" ? "running" : step.status,
        });
      }
    }
  }

  return steps;
}

/** Convert graph artifacts to ArtifactItem format */
function extractArtifactsFromGraph(artifacts: Record<string, ArtifactPayload>): ArtifactItem[] {
  const result: ArtifactItem[] = [];

  for (const [id, artifact] of Object.entries(artifacts)) {
    result.push(convertArtifact(id, artifact));
  }

  return result;
}

/** Convert a single artifact payload to ArtifactItem */
function convertArtifact(id: string, artifact: ArtifactPayload): ArtifactItem {
  switch (artifact.type) {
    case "diff":
      return {
        id,
        type: "diff",
        title: artifact.file,
        content: artifact.diff,
      };
    case "plan":
      return {
        id,
        type: "plan",
        title: "Execution Plan",
        content: JSON.stringify(artifact.steps),
      };
    case "markdown":
      return {
        id,
        type: "doc",
        title: "Report",
        content: artifact.content,
      };
  }
}

/** Calculate progress percentage from steps */
function calculateProgress(steps: TaskStep[]): number {
  if (steps.length === 0) {
    return 0;
  }
  const completedSteps = steps.filter((s) => s.status === "completed").length;
  return Math.round((completedSteps / steps.length) * 100);
}

/** Map graph status to AgentTask status */
function mapGraphStatus(status: string): AgentTask["status"] {
  switch (status) {
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "awaiting_approval":
      return "paused";
    default:
      return "running";
  }
}

/** Map CoworkTaskStatus to AgentTask status */
function mapCoworkStatus(status: string): AgentTask["status"] {
  switch (status) {
    case "planning":
    case "running":
      return "running";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "awaiting_approval":
      return "paused";
    default:
      return "queued";
  }
}
