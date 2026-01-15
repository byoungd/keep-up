import React from "react";
import { useWorkspace } from "../../app/providers/WorkspaceProvider";
import type { Session, WorkspaceSelection } from "./types";

export type WorkspacePickerProps = {
  onSessionCreated: (session: Session) => void;
};

async function selectDirectory(): Promise<WorkspaceSelection | null> {
  const picker = window.showDirectoryPicker as
    | undefined
    | (() => Promise<FileSystemDirectoryHandle>);
  if (!picker) {
    return null;
  }
  const handle = await picker();
  let permission: PermissionState | null = null;
  if (handle.queryPermission) {
    permission = await handle.queryPermission({ mode: "readwrite" });
  }
  if (permission !== "granted" && handle.requestPermission) {
    permission = await handle.requestPermission({ mode: "readwrite" });
  }
  if (permission && permission !== "granted") {
    return null;
  }
  return {
    name: handle.name,
    pathHint: handle.name,
  };
}

export function WorkspacePicker({ onSessionCreated }: WorkspacePickerProps) {
  const { createSessionForPath } = useWorkspace();
  const [fallbackPath, setFallbackPath] = React.useState("");
  const [status, setStatus] = React.useState<string | null>(null);

  const handlePick = async () => {
    setStatus(null);
    try {
      const selection = await selectDirectory();
      if (!selection) {
        setStatus("Directory access not granted.");
        return;
      }
      const session = await createSessionForPath(selection.pathHint ?? selection.name);
      onSessionCreated(session);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      setStatus(error instanceof Error ? error.message : "Unable to access directory.");
    }
  };

  const handleFallback = () => {
    if (!fallbackPath.trim()) {
      setStatus("Enter a workspace path to continue.");
      return;
    }
    createSessionForPath(fallbackPath.trim())
      .then((session) => onSessionCreated(session))
      .catch((error) => {
        setStatus(error instanceof Error ? error.message : "Unable to create session.");
      });
  };

  return (
    <section className="card-panel space-y-4">
      <div>
        <p className="text-sm font-semibold text-foreground">Start a new session</p>
        <p className="text-xs text-muted-foreground">
          Choose a local folder to grant scoped access and spin up a session.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <button type="button" className="primary-button" onClick={handlePick}>
          Pick workspace folder
        </button>
        <div className="divider" />
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="fallback-path">
            Folder path (fallback)
          </label>
          <input
            id="fallback-path"
            type="text"
            aria-label="Workspace path"
            placeholder="/Users/you/Projects/cowork"
            value={fallbackPath}
            onChange={(event) => setFallbackPath(event.target.value)}
            className="text-input"
          />
          <button type="button" className="secondary-button" onClick={handleFallback}>
            Use this path
          </button>
        </div>
      </div>
      {status ? <p className="text-xs text-warning">{status}</p> : null}
    </section>
  );
}
