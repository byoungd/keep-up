import { Link, useParams } from "@tanstack/react-router";
import { ArtifactRail } from "../../components/ArtifactRail";
import { ChatThread } from "../../features/chat/ChatThread";
import { useTaskStream } from "../../features/tasks/hooks/useTaskStream";
import { useWorkspace } from "../providers/WorkspaceProvider";

export function SessionRoute() {
  const { sessionId } = useParams({ strict: false }) as { sessionId: string };
  const { getSession } = useWorkspace();
  const session = getSession(sessionId);

  const { graph, applyArtifact, revertArtifact } = useTaskStream(sessionId);

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
      />
    </div>
  );
}
