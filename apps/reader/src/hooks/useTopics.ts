import type { ListTopicsOptions, TopicRow } from "@keepup/db";
import { useCallback, useEffect, useState } from "react";
import { getDbClient } from "../lib/db";

/**
 * Hook to fetch and manage topics from the database.
 */
export interface UseTopicsOptions extends ListTopicsOptions {
  autoRefresh?: boolean;
}

export function useTopics(options?: UseTopicsOptions) {
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Extract options values to use as stable dependencies
  const limit = options?.limit;
  const offset = options?.offset;
  const orderBy = options?.orderBy;
  const order = options?.order;

  const fetchTopics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const client = await getDbClient();
      const data = await client.listTopics({ limit, offset, orderBy, order });
      setTopics(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [limit, offset, orderBy, order]);

  const createTopic = useCallback(
    async (name: string) => {
      const client = await getDbClient();
      const topicId = crypto.randomUUID();
      await client.createTopic({ topicId, name, color: null, description: null });
      await fetchTopics();
      return topicId;
    },
    [fetchTopics]
  );

  useEffect(() => {
    fetchTopics();
  }, [fetchTopics]);

  return {
    topics,
    loading,
    error,
    refresh: fetchTopics,
    createTopic,
  };
}
