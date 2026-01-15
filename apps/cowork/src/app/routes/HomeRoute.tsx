import { useNavigate } from "@tanstack/react-router";
import { WorkspacePicker } from "../../features/workspace/WorkspacePicker";
import { useWorkspace } from "../providers/WorkspaceProvider";

export function HomeRoute() {
  const navigate = useNavigate();
  const { sessions, workspaces } = useWorkspace();

  return (
    <div className="page-grid">
      <section className="hero-panel">
        <div className="space-y-4">
          <p className="eyebrow">Keep-Up Cowork</p>
          <h1 className="hero-title">Plan, execute, and review with full visibility.</h1>
          <p className="hero-subtitle">
            Launch an agent session with scoped access, structured outputs, and a premium,
            local-first experience.
          </p>
        </div>
        <div className="hero-meta">
          <div>
            <p className="text-xs text-muted-foreground">Active workspaces</p>
            <p className="text-lg font-semibold text-foreground">{workspaces.length}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Sessions created</p>
            <p className="text-lg font-semibold text-foreground">{sessions.length}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Latency target</p>
            <p className="text-lg font-semibold text-foreground">&lt;100ms</p>
          </div>
        </div>
      </section>

      <WorkspacePicker
        onSessionCreated={(session) =>
          navigate({
            to: "/sessions/$sessionId",
            params: { sessionId: session.id },
          })
        }
      />

      <section className="card-panel">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Recent sessions</p>
            <p className="text-xs text-muted-foreground">Pick up where you left off.</p>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {sessions.length === 0 ? (
            <p className="text-xs text-muted-foreground">No sessions yet.</p>
          ) : (
            sessions.slice(0, 5).map((session) => (
              <button
                key={session.id}
                type="button"
                className="session-row"
                onClick={() =>
                  navigate({
                    to: "/sessions/$sessionId",
                    params: { sessionId: session.id },
                  })
                }
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{session.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(session.createdAt).toLocaleString()}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">Open</span>
              </button>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
