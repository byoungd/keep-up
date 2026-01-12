"use client";

import { AIPanel } from "@/components/layout/AIPanel";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAIPanelState } from "@/context/PanelStateContext";
import { useTopics } from "@/hooks/useTopics";
import { Link } from "@/i18n/navigation";
import { Hash, Loader2, Plus, Search, TrendingUp } from "lucide-react";
import { useTranslations } from "next-intl";
import * as React from "react";

// Color palette for topics (cycling based on index)
const TOPIC_COLORS = [
  "bg-violet-500",
  "bg-blue-500",
  "bg-cyan-500",
  "bg-red-500",
  "bg-orange-500",
  "bg-green-500",
  "bg-pink-500",
  "bg-amber-500",
];

interface TopicCardProps {
  topicId: string;
  name: string;
  description: string | null;
  color: string;
}

function TopicCard({ topicId, name, description, color }: TopicCardProps) {
  return (
    <Link
      href={`/topics/${topicId}`}
      className="group flex flex-col gap-3 p-5 rounded-xl border border-border/50 bg-surface-2/50 hover:bg-surface-2 hover:border-border transition-all"
    >
      <div className="flex items-start justify-between">
        <div className={`flex items-center justify-center w-10 h-10 rounded-lg ${color}/10`}>
          <Hash className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
        </div>
      </div>
      <div>
        <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
          {name}
        </h3>
        {description && (
          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{description}</p>
        )}
      </div>
    </Link>
  );
}

export default function TopicsPage() {
  const t = useTranslations("Topics");
  const { setVisible } = useAIPanelState();
  const { topics, loading, error, createTopic, refresh } = useTopics();
  const [searchQuery, setSearchQuery] = React.useState("");
  const [showCreateModal, setShowCreateModal] = React.useState(false);
  const [newTopicName, setNewTopicName] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  const filteredTopics = React.useMemo(() => {
    if (!searchQuery.trim()) {
      return topics;
    }
    const query = searchQuery.toLowerCase();
    return topics.filter((topic) => topic.name.toLowerCase().includes(query));
  }, [searchQuery, topics]);

  const handleCreate = async () => {
    if (!newTopicName.trim()) {
      return;
    }
    setCreating(true);
    try {
      await createTopic(newTopicName.trim());
      setNewTopicName("");
      setShowCreateModal(false);
    } catch (err) {
      console.error("[TopicsPage] Failed to create topic:", err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <AppShell isDesktop rightPanel={<AIPanel onClose={() => setVisible(false)} />}>
      <main className="flex-1 overflow-y-auto min-w-0 bg-background">
        <div className="max-w-4xl mx-auto px-6 py-10 space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight mb-2">{t("title")}</h1>
              <p className="text-muted-foreground">{t("subtitle")}</p>
            </div>
            <Button onClick={() => setShowCreateModal(true)} type="button">
              <Plus className="w-4 h-4 mr-2" aria-hidden="true" />
              {t("createTopic")}
            </Button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              placeholder={t("searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              aria-label={t("searchPlaceholder")}
            />
          </div>

          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
              <p className="font-medium">Failed to load topics</p>
              <p className="text-sm opacity-80">{error.message}</p>
              <Button variant="outline" onClick={refresh} className="mt-2" type="button">
                Retry
              </Button>
            </div>
          )}

          {/* Topics Section */}
          {!loading && !error && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  {t("trending")}
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredTopics.map((topic, index) => (
                  <TopicCard
                    key={topic.topicId}
                    topicId={topic.topicId}
                    name={topic.name}
                    description={topic.description}
                    color={topic.color ?? TOPIC_COLORS[index % TOPIC_COLORS.length]}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Empty State */}
          {!loading && !error && filteredTopics.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <Hash className="w-12 h-12 mx-auto mb-4 opacity-50" aria-hidden="true" />
              <p className="text-lg mb-2">{t("noTopicsFound")}</p>
              <p className="text-sm">{t("noTopicsFoundHint")}</p>
            </div>
          )}

          {/* Create Topic Modal */}
          {showCreateModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <div className="bg-background border border-border rounded-xl p-6 w-full max-w-md shadow-xl">
                <h2 className="text-lg font-semibold mb-4">{t("createTopic")}</h2>
                <Input
                  placeholder={t("topicNamePlaceholder")}
                  className="mb-4"
                  aria-label={t("topicNamePlaceholder")}
                  value={newTopicName}
                  onChange={(e) => setNewTopicName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleCreate();
                    }
                  }}
                  autoFocus
                />
                <div className="flex justify-end gap-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowCreateModal(false);
                      setNewTopicName("");
                    }}
                    type="button"
                    disabled={creating}
                  >
                    {t("cancel")}
                  </Button>
                  <Button
                    onClick={handleCreate}
                    type="button"
                    disabled={creating || !newTopicName.trim()}
                  >
                    {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    {t("create")}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </AppShell>
  );
}
