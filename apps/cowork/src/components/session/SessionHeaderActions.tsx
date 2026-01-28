"use client";

import { cn } from "@ku0/shared/utils";
import {
  Button,
  Dialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Input,
} from "@ku0/shell";
import { useParams, useRouter } from "@tanstack/react-router";
import {
  Check,
  ExternalLink,
  Folder,
  MoreHorizontal,
  PencilLine,
  Share2,
  Star,
  Trash2,
} from "lucide-react";
import * as React from "react";
import { useWorkspace } from "../../app/providers/WorkspaceProvider";
import { shareSessionLink } from "../../lib/shareSession";

const FAVORITES_STORAGE_KEY = "cowork-task-favorites-v1";

function readFavorites(): Set<string> {
  if (typeof window === "undefined") {
    return new Set();
  }
  try {
    const stored = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
    const parsed = stored ? (JSON.parse(stored) as string[]) : [];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function writeFavorites(ids: Set<string>): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(Array.from(ids)));
}

interface SessionHeaderActionsProps {
  className?: string;
}

export function SessionHeaderActions({ className }: SessionHeaderActionsProps) {
  const { sessionId } = useParams({ strict: false }) as { sessionId?: string };
  const router = useRouter();
  const { sessions, projects, renameSession, deleteSession, moveSessionToProject, getSession } =
    useWorkspace();

  const [favoriteIds, setFavoriteIds] = React.useState<Set<string>>(new Set());
  const [pendingRenameSessionId, setPendingRenameSessionId] = React.useState<string | null>(null);
  const [renameValue, setRenameValue] = React.useState("");
  const [pendingDeleteSessionId, setPendingDeleteSessionId] = React.useState<string | null>(null);
  const [shareFeedback, setShareFeedback] = React.useState<string | null>(null);
  const renameInputRef = React.useRef<HTMLInputElement | null>(null);
  const shareTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load favorites on mount
  React.useEffect(() => {
    setFavoriteIds(readFavorites());
  }, []);

  // Focus rename input when dialog opens
  React.useEffect(() => {
    if (!pendingRenameSessionId) {
      return;
    }
    const rafId = requestAnimationFrame(() => {
      renameInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(rafId);
  }, [pendingRenameSessionId]);

  React.useEffect(() => {
    return () => {
      if (shareTimeoutRef.current) {
        clearTimeout(shareTimeoutRef.current);
      }
    };
  }, []);

  const session = sessionId ? getSession(sessionId) : null;

  // Don't render if no active session
  if (!session) {
    return null;
  }

  const isFavorite = favoriteIds.has(session.id);
  const favoriteLabel = isFavorite ? "Unpin session" : "Pin session";

  const sortedProjects = [...projects].sort((a, b) => b.createdAt - a.createdAt);
  const scopedProjects = sortedProjects.filter(
    (project) => !project.workspaceId || project.workspaceId === session.workspaceId
  );

  const toggleFavorite = () => {
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(session.id)) {
        next.delete(session.id);
      } else {
        next.add(session.id);
      }
      writeFavorites(next);
      return next;
    });
  };

  const handleOpenInNewTab = () => {
    if (typeof window === "undefined") {
      return;
    }
    window.open(`/sessions/${session.id}`, "_blank", "noopener,noreferrer");
  };

  const handleMoveToProject = async (projectId: string | null) => {
    try {
      await moveSessionToProject(session.id, projectId);
    } catch (_err) {
      void _err;
    }
  };

  const openRenameDialog = () => {
    setPendingRenameSessionId(session.id);
    setRenameValue(session.title);
  };

  const closeRenameDialog = () => {
    setPendingRenameSessionId(null);
    setRenameValue("");
  };

  const confirmRenameSession = async () => {
    if (!pendingRenameSessionId) {
      return;
    }
    const trimmed = renameValue.trim();
    if (!trimmed) {
      return;
    }
    try {
      await renameSession(pendingRenameSessionId, trimmed);
    } catch (_err) {
      void _err;
    } finally {
      closeRenameDialog();
    }
  };

  const openDeleteDialog = () => {
    setPendingDeleteSessionId(session.id);
  };

  const closeDeleteDialog = () => {
    setPendingDeleteSessionId(null);
  };

  const confirmDeleteSession = async () => {
    if (!pendingDeleteSessionId) {
      return;
    }
    try {
      await deleteSession(pendingDeleteSessionId);
      // Navigate to home after deletion
      router.navigate({ to: "/" });
    } catch (_e) {
      void _e;
    } finally {
      closeDeleteDialog();
    }
  };

  const pendingRenameSession = pendingRenameSessionId
    ? (sessions.find((s) => s.id === pendingRenameSessionId) ?? null)
    : null;

  const pendingDeleteSessionObj = pendingDeleteSessionId
    ? (sessions.find((s) => s.id === pendingDeleteSessionId) ?? null)
    : null;

  const handleShareSession = async () => {
    if (!session) {
      return;
    }
    const outcome = await shareSessionLink(session.id, session.title);
    if (outcome === "cancelled") {
      return;
    }
    const label = outcome === "shared" ? "Shared" : "Link copied";
    setShareFeedback(label);
    if (shareTimeoutRef.current) {
      clearTimeout(shareTimeoutRef.current);
    }
    shareTimeoutRef.current = setTimeout(() => {
      setShareFeedback(null);
    }, 2000);
  };

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-7 w-7 text-muted-foreground hover:text-foreground", className)}
            aria-label="Session actions"
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          side="bottom"
          sideOffset={8}
          className="w-56 rounded-lg p-1"
        >
          <DropdownMenuItem
            onSelect={() => void handleShareSession()}
            className={cn(
              "gap-2.5 rounded-md px-3 py-1.5 text-[13px] focus:bg-surface-hover focus:text-foreground cursor-pointer outline-none",
              shareFeedback ? "text-success" : ""
            )}
          >
            <Share2 className="h-4 w-4" aria-hidden="true" />
            <span>{shareFeedback ?? "Share"}</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={openRenameDialog}
            className="gap-2.5 rounded-md px-3 py-1.5 text-[13px] focus:bg-surface-hover focus:text-foreground cursor-pointer outline-none"
          >
            <PencilLine className="h-4 w-4" aria-hidden="true" />
            <span>Rename</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={toggleFavorite}
            className="gap-2.5 rounded-md px-3 py-1.5 text-[13px] focus:bg-surface-hover focus:text-foreground cursor-pointer outline-none"
          >
            <Star
              className={cn("h-4 w-4", isFavorite ? "fill-current" : undefined)}
              aria-hidden="true"
            />
            <span>{favoriteLabel}</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={handleOpenInNewTab}
            className="gap-2.5 rounded-md px-3 py-1.5 text-[13px] focus:bg-surface-hover focus:text-foreground cursor-pointer outline-none"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            <span>Open in new tab</span>
          </DropdownMenuItem>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="gap-2.5 rounded-md px-3 py-1.5 text-[13px] focus:bg-surface-hover focus:text-foreground cursor-pointer outline-none data-[state=open]:bg-foreground/5 data-[state=open]:text-foreground">
              <Folder className="h-4 w-4" aria-hidden="true" />
              <span>Move to project</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-56 rounded-lg p-1">
              {scopedProjects.length === 0 ? (
                <DropdownMenuItem disabled>
                  <span className="text-muted-foreground">No projects for this workspace</span>
                </DropdownMenuItem>
              ) : (
                scopedProjects.map((project) => (
                  <DropdownMenuItem
                    key={project.id}
                    onSelect={() => handleMoveToProject(project.id)}
                    className="gap-2.5 rounded-md px-3 py-1.5 text-[13px] focus:bg-surface-hover focus:text-foreground cursor-pointer outline-none"
                  >
                    <span>{project.name}</span>
                    {session.projectId === project.id && <Check className="ml-auto h-4 w-4" />}
                  </DropdownMenuItem>
                ))
              )}
              {session.projectId && (
                <>
                  {scopedProjects.length > 0 ? <DropdownMenuSeparator /> : null}
                  <DropdownMenuItem
                    onSelect={() => handleMoveToProject(null)}
                    className="gap-2.5 rounded-md px-3 py-1.5 text-[13px] focus:bg-surface-hover focus:text-foreground cursor-pointer outline-none"
                  >
                    <span>Remove from project</span>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSeparator className="mx-2" />
          <DropdownMenuItem
            onSelect={openDeleteDialog}
            className="gap-2.5 rounded-md px-3 py-1.5 text-[13px] text-destructive focus:text-destructive focus:bg-surface-hover cursor-pointer outline-none"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            <span>Delete</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Rename Dialog */}
      <Dialog
        open={pendingRenameSessionId !== null}
        onOpenChange={(open) => {
          if (!open) {
            closeRenameDialog();
          }
        }}
        title="Rename session"
        description={
          pendingRenameSession?.title
            ? `Update the name for "${pendingRenameSession.title}".`
            : "Update the session name."
        }
        className="rounded-2xl bg-surface-1/95 border-border/30"
      >
        <div className="space-y-3">
          <label className="text-sm font-medium text-foreground" htmlFor="session-rename-header">
            Session name
          </label>
          <Input
            id="session-rename-header"
            ref={renameInputRef}
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void confirmRenameSession();
              }
            }}
            aria-label="Session name"
          />
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="secondary" type="button" onClick={closeRenameDialog}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void confirmRenameSession()}>
            Rename
          </Button>
        </div>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={pendingDeleteSessionId !== null}
        onOpenChange={(open) => {
          if (!open) {
            closeDeleteDialog();
          }
        }}
        title="Delete session"
        description={
          pendingDeleteSessionObj?.title
            ? `Are you sure you want to delete "${pendingDeleteSessionObj.title}"? This action cannot be undone.`
            : "Are you sure you want to delete this session? This action cannot be undone."
        }
        className="rounded-2xl bg-surface-1/95 border-border/30"
      >
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="secondary" type="button" onClick={closeDeleteDialog}>
            Cancel
          </Button>
          <Button variant="destructive" type="button" onClick={() => void confirmDeleteSession()}>
            Delete
          </Button>
        </div>
      </Dialog>
    </>
  );
}
