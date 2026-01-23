import { Link, useParams, useRouter } from "@tanstack/react-router";
import { ArtifactRail } from "../../components/ArtifactRail";
import { ChatThread } from "../../features/chat/ChatThread";
import { useKeyboardShortcuts } from "../../features/chat/hooks/useKeyboardShortcuts";
import { useTaskStream } from "../../features/tasks/hooks/useTaskStream";
import { useWorkspace } from "../providers/WorkspaceProvider";

export function SessionRoute() {
  const router = useRouter();
  const { sessionId } = useParams({ strict: false }) as { sessionId: string };
  const { getSession } = useWorkspace();
  const session = getSession(sessionId);

  const { graph, applyArtifact, revertArtifact, answerClarification } = useTaskStream(sessionId);

  useKeyboardShortcuts({
    onSend: () => {
      // Handled in ChatPanel via input ref usually, but we can emit a focused event
      // For now, let's keep it simple: meta+enter inside textarea works by default
    },
    onNewSession: () => {
      // TODO: Navigate to new session
    },
    onSearch: () => {
      router.navigate({ to: "/search" });
    },
  });

  if (!session) {
    return (
      <div className="card-panel space-y-4">
        <p className="text-sm font-semibold text-foreground">Session not found</p>
        <p className="text-xs text-muted-foreground">The session ID is invalid or has expired.</p>
        <Link to="/" className="secondary-button">
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="session-grid">
      <div className="session-main">
        <ChatThread sessionId={sessionId} />
      </div>
      <ArtifactRail
        sessionId={sessionId}
        graph={graph}
        onApplyArtifact={applyArtifact}
        onRevertArtifact={revertArtifact}
        onAnswerClarification={answerClarification}
      />
    </div>
  );
}
