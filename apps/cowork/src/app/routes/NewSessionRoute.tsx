import { useNavigate } from "@tanstack/react-router";
import { WorkspacePicker } from "../../features/workspace/WorkspacePicker";

export function NewSessionRoute() {
  const navigate = useNavigate();

  return (
    <div className="page-grid">
      <section className="hero-panel">
        <div className="space-y-3">
          <p className="eyebrow">New Session</p>
          <h1 className="hero-title">Start a focused cowork session.</h1>
          <p className="hero-subtitle">
            Choose a local folder to grant scoped access and begin with a clean context.
          </p>
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
    </div>
  );
}
