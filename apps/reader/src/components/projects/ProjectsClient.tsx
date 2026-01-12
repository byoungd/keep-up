"use client";

import { Button } from "@/components/ui/Button";
import { Dialog, DialogFooter } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { FolderKanban, Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { useTopics } from "../../hooks/useTopics";

import { getNameLengthBucket } from "@/lib/analytics/events";
import { track } from "@/lib/analytics/track";

export function ProjectsClient() {
  const { topics, loading, error, createTopic } = useTopics({
    orderBy: "updatedAt",
    order: "desc",
  });
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newTopicName, setNewTopicName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const { toast } = useToast();

  const handleCreateTopic = async () => {
    if (!newTopicName.trim()) {
      return;
    }
    try {
      setIsCreating(true);
      await createTopic(newTopicName);

      track({
        name: "topic_created",
        nameLengthBucket: getNameLengthBucket(newTopicName.length),
      });

      setNewTopicName("");
      setIsDialogOpen(false);
      toast("Topic created successfully", "success");
    } catch (err) {
      console.error("Failed to create topic", err);

      // Basic telemetry for failure
      track({
        name: "topic_create_failed",
        errorType: "persistence", // Assuming persistence error for now
        code: "TOPIC_CREATE_UNKNOWN",
      });

      toast("Failed to create topic", "error");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <main className="flex-1 flex flex-col min-w-0 h-full">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <FolderKanban className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Projects</h1>
        </div>
        <Button size="sm" className="gap-2" onClick={() => setIsDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          New Topic
        </Button>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen} title="Create New Topic">
          <div className="py-4">
            <label htmlFor="topic-name" className="sr-only">
              Topic name
            </label>
            <Input
              id="topic-name"
              placeholder="Topic Name"
              value={newTopicName}
              onChange={(e) => setNewTopicName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleCreateTopic();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateTopic} disabled={isCreating || !newTopicName.trim()}>
              {isCreating ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </Dialog>
      </header>

      {/* Content */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-2">
            <p className="text-sm font-medium text-foreground">Unable to load topics.</p>
            <p className="text-xs text-muted-foreground">{error.message}</p>
          </div>
        </div>
      ) : topics.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <EmptyState
            title="No projects yet"
            description="Create a topic to organize your reading and ground your AI interactions."
            icon={FolderKanban}
            actions={[
              {
                label: "Create your first topic",
                onClick: () => setIsDialogOpen(true),
                variant: "primary",
                icon: Plus,
              },
            ]}
          />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {topics.map((topic) => (
              <div
                key={topic.topicId}
                className="p-4 rounded-xl border border-border bg-surface-1 hover:bg-surface-2 transition-colors cursor-pointer group"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium text-foreground">{topic.name}</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Updated {new Date(topic.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
