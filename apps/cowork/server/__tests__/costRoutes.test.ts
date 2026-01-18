import type { CoworkSession, CoworkTask } from "@ku0/agent-runtime";
import type { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { createCostRoutes } from "../routes/cost";
import type { ChatMessageStoreLike, SessionStoreLike, TaskStoreLike } from "../storage/contracts";
import type { CoworkChatMessage } from "../storage/types";
import { calculateUsageCostUsd } from "../utils/tokenUsage";

class MockSessionStore implements SessionStoreLike {
  constructor(private readonly sessions = new Map<string, CoworkSession>()) {}

  async getAll(): Promise<CoworkSession[]> {
    return Array.from(this.sessions.values());
  }

  async getById(sessionId: string): Promise<CoworkSession | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async create(session: CoworkSession): Promise<CoworkSession> {
    this.sessions.set(session.sessionId, session);
    return session;
  }

  async update(
    sessionId: string,
    updater: (session: CoworkSession) => CoworkSession
  ): Promise<CoworkSession | null> {
    const existing = this.sessions.get(sessionId);
    if (!existing) {
      return null;
    }
    const updated = updater(existing);
    this.sessions.set(sessionId, updated);
    return updated;
  }

  async delete(sessionId: string): Promise<boolean> {
    return this.sessions.delete(sessionId);
  }
}

class MockChatMessageStore implements ChatMessageStoreLike {
  constructor(private messages: CoworkChatMessage[] = []) {}

  async getAll(): Promise<CoworkChatMessage[]> {
    return this.messages;
  }

  async getById(messageId: string): Promise<CoworkChatMessage | null> {
    return this.messages.find((msg) => msg.messageId === messageId) ?? null;
  }

  async getBySession(sessionId: string): Promise<CoworkChatMessage[]> {
    return this.messages.filter((msg) => msg.sessionId === sessionId);
  }

  async getByClientRequestId(): Promise<CoworkChatMessage | null> {
    return null;
  }

  async create(message: CoworkChatMessage): Promise<CoworkChatMessage> {
    this.messages.push(message);
    return message;
  }

  async update(
    messageId: string,
    updater: (message: CoworkChatMessage) => CoworkChatMessage
  ): Promise<CoworkChatMessage | null> {
    const index = this.messages.findIndex((msg) => msg.messageId === messageId);
    if (index === -1) {
      return null;
    }
    const updated = updater(this.messages[index]);
    this.messages[index] = updated;
    return updated;
  }
}

class MockTaskStore implements TaskStoreLike {
  constructor(private tasks: CoworkTask[] = []) {}

  async getAll(): Promise<CoworkTask[]> {
    return this.tasks;
  }

  async getById(taskId: string): Promise<CoworkTask | null> {
    return this.tasks.find((task) => task.taskId === taskId) ?? null;
  }

  async getBySession(sessionId: string): Promise<CoworkTask[]> {
    return this.tasks.filter((task) => task.sessionId === sessionId);
  }

  async create(task: CoworkTask): Promise<CoworkTask> {
    this.tasks.push(task);
    return task;
  }

  async update(
    taskId: string,
    updater: (task: CoworkTask) => CoworkTask
  ): Promise<CoworkTask | null> {
    const index = this.tasks.findIndex((task) => task.taskId === taskId);
    if (index === -1) {
      return null;
    }
    const updated = updater(this.tasks[index]);
    this.tasks[index] = updated;
    return updated;
  }
}

describe("Cost routes", () => {
  it("aggregates usage across messages and tasks", async () => {
    const sessionStore = new MockSessionStore();
    const chatStore = new MockChatMessageStore();
    const taskStore = new MockTaskStore();

    const session: CoworkSession = {
      sessionId: "session-1",
      userId: "user-1",
      deviceId: "device-1",
      platform: "macos",
      mode: "cowork",
      grants: [],
      connectors: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await sessionStore.create(session);

    const modelId = "gpt-5.2-auto";
    const explicitCost = 0.01;
    const computedMessageUsage = {
      inputTokens: 500,
      outputTokens: 250,
      totalTokens: 750,
    };
    const computedTaskUsage = {
      inputTokens: 300,
      outputTokens: 100,
      totalTokens: 400,
    };
    const computedMessageCost = calculateUsageCostUsd(computedMessageUsage, modelId);
    const computedTaskCost = calculateUsageCostUsd(computedTaskUsage, modelId);
    expect(computedMessageCost).not.toBeNull();
    expect(computedTaskCost).not.toBeNull();

    await chatStore.create({
      messageId: "assistant-1",
      sessionId: session.sessionId,
      role: "assistant",
      content: "A",
      createdAt: Date.now(),
      status: "done",
      modelId,
      providerId: "openai",
      metadata: {
        usage: {
          inputTokens: 1000,
          outputTokens: 1000,
          totalTokens: 2000,
          costUsd: explicitCost,
          modelId,
          providerId: "openai",
        },
      },
    });

    await chatStore.create({
      messageId: "assistant-2",
      sessionId: session.sessionId,
      role: "assistant",
      content: "B",
      createdAt: Date.now(),
      status: "done",
      modelId,
      providerId: "openai",
      metadata: {
        usage: {
          ...computedMessageUsage,
          modelId,
          providerId: "openai",
        },
      },
    });

    await chatStore.create({
      messageId: "assistant-3",
      sessionId: session.sessionId,
      role: "assistant",
      content: "C",
      createdAt: Date.now(),
      status: "done",
      modelId,
      providerId: "openai",
      metadata: {
        usage: {
          inputTokens: 50,
          outputTokens: 25,
          totalTokens: 75,
          costUsd: null,
          modelId,
          providerId: "openai",
        },
      },
    });

    await taskStore.create({
      taskId: "task-1",
      sessionId: session.sessionId,
      title: "Task",
      prompt: "Do work",
      status: "completed",
      modelId,
      providerId: "openai",
      metadata: {
        usage: {
          ...computedTaskUsage,
          modelId,
          providerId: "openai",
        },
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const app: Hono = createCostRoutes({
      sessionStore,
      chatMessageStore: chatStore,
      taskStore,
    });

    const res = await app.request(`/sessions/${session.sessionId}/cost`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      cost: {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        totalCostUsd: number | null;
        knownCostUsd: number;
        hasUnknownCost: boolean;
        messageCount: number;
        taskCount: number;
        byModel: Record<string, { unknownCostCount: number }>;
      };
    };

    expect(data.cost.messageCount).toBe(3);
    expect(data.cost.taskCount).toBe(1);
    expect(data.cost.inputTokens).toBe(1000 + 500 + 50 + 300);
    expect(data.cost.outputTokens).toBe(1000 + 250 + 25 + 100);
    expect(data.cost.totalTokens).toBe(2000 + 750 + 75 + 400);
    expect(data.cost.hasUnknownCost).toBe(true);
    expect(data.cost.totalCostUsd).toBeNull();

    const expectedKnown = explicitCost + (computedMessageCost ?? 0) + (computedTaskCost ?? 0);
    expect(data.cost.knownCostUsd).toBeCloseTo(expectedKnown, 6);
    expect(data.cost.byModel[modelId]?.unknownCostCount).toBe(1);
  });
});
