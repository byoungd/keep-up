import type { CoworkSession } from "@ku0/agent-runtime";
import { createEventBus, type RuntimeEventBus } from "@ku0/agent-runtime-control";
import { createSubsystemLogger, type Logger } from "@ku0/agent-runtime-telemetry/logging";
import {
  ChannelRegistry,
  ChannelRouter,
  type ChannelStatus,
  createGatewayControlServer,
  DiscordAdapter,
  type GatewayControlSessionCreateInput,
  type GatewayControlSessionManager,
  type GatewayControlSessionSummary,
  type GatewayControlSessionUpdateInput,
  TelegramAdapter,
} from "@ku0/gateway-control";
import { startGatewayControlNodeServer } from "@ku0/gateway-control/node";
import {
  type NodeDescriptor,
  NodeRegistry,
  type NodeRegistryStatus,
  type NodeResponse,
  startGatewayNodeServer,
} from "@ku0/nodes";
import type {
  CoworkDiscordConfig,
  CoworkGatewayControlConfig,
  CoworkTelegramConfig,
} from "../config";
import type {
  CoworkGatewaySessionInput,
  CoworkGatewaySessionUpdate,
  CoworkTaskRuntime,
} from "./coworkTaskRuntime";

export interface GatewayControlRuntime {
  eventBus: RuntimeEventBus;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  getStatus: () => GatewayControlStatus;
  nodes?: GatewayNodeRuntime;
}

export interface GatewayControlStatus {
  enabled: boolean;
  port: number;
  nodePort: number;
  authMode: "none" | "token";
  started: boolean;
  clients: number;
  subscriptions: number;
  messagesIn: number;
  messagesOut: number;
  lastMessageAt?: number;
  channels: {
    total: number;
    running: boolean;
    runningCount: number;
    healthyCount: number;
    items: ChannelStatus[];
  };
  nodes?: {
    enabled: boolean;
    online: number;
    offline: number;
    total: number;
  };
}

export interface GatewayControlRuntimeConfig {
  gateway: CoworkGatewayControlConfig;
  telegram: CoworkTelegramConfig;
  discord: CoworkDiscordConfig;
  taskRuntime: CoworkTaskRuntime;
  eventBus?: RuntimeEventBus;
  logger?: Logger;
}

export interface GatewayNodeRuntime {
  port: number;
  list: () => NodeDescriptor[];
  describe: (nodeId: string) => NodeDescriptor | undefined;
  invoke: (
    nodeId: string,
    command: string,
    args?: Record<string, unknown>
  ) => Promise<NodeResponse>;
  getStatus: () => NodeRegistryStatus;
}

export function createGatewayControlRuntime(
  config: GatewayControlRuntimeConfig
): GatewayControlRuntime {
  const eventBus = config.eventBus ?? createEventBus();
  const logger = config.logger ?? createSubsystemLogger("cowork", "gateway");
  const channelLogger = createSubsystemLogger("cowork", "channels");
  const nodeLogger = createSubsystemLogger("cowork", "nodes");
  const sessionManager = createGatewaySessionManager(config.taskRuntime);
  const gatewayServer = createGatewayControlServer({
    eventBus,
    logger,
    auth: config.gateway.auth,
    sessionManager,
  });
  const channelRegistry = new ChannelRegistry({ logger: channelLogger });
  const nodeRegistry = new NodeRegistry({
    logger: nodeLogger,
    authToken: config.gateway.auth.mode === "token" ? config.gateway.auth.token : undefined,
  });

  if (config.telegram.enabled && config.telegram.token) {
    channelRegistry.register(
      new TelegramAdapter({
        token: config.telegram.token,
        pollingIntervalMs: config.telegram.pollingIntervalMs,
        longPollTimeoutSeconds: config.telegram.longPollTimeoutSeconds,
      })
    );
  } else if (config.telegram.enabled) {
    logger.warn("Telegram adapter enabled but missing token.");
  }

  if (config.discord.enabled && config.discord.token && config.discord.channelId) {
    channelRegistry.register(
      new DiscordAdapter({
        token: config.discord.token,
        channelId: config.discord.channelId,
        pollingIntervalMs: config.discord.pollingIntervalMs,
        baseUrl: config.discord.baseUrl,
      })
    );
  } else if (config.discord.enabled) {
    logger.warn("Discord adapter enabled but missing token or channel id.");
  }

  const channelRouter = new ChannelRouter({
    registry: channelRegistry,
    logger: channelLogger,
    defaultSessionId: config.telegram.sessionId,
  });

  channelRegistry.onMessage((message) => {
    void channelRouter.handleMessage(message, async (sessionId, payload) => {
      try {
        await config.taskRuntime.enqueueTask(sessionId, {
          prompt: payload.text,
          title: `Channel ${payload.channel}`,
          metadata: {
            channel: payload.channel,
            conversationId: payload.conversationId,
            senderId: payload.senderId,
            timestamp: payload.timestamp,
          },
        });
      } catch (error) {
        logger.error("Failed to enqueue channel task", error, {
          sessionId,
          channel: payload.channel,
        });
      }
    });
  });

  let serverHandle: Awaited<ReturnType<typeof startGatewayControlNodeServer>> | null = null;
  let nodeServerHandle: Awaited<ReturnType<typeof startGatewayNodeServer>> | null = null;
  let channelsStarted = false;
  let presenceTimer: ReturnType<typeof setInterval> | null = null;

  const startPresence = () => {
    if (presenceTimer) {
      return;
    }
    presenceTimer = setInterval(() => {
      const stats = gatewayServer.getStats();
      eventBus.emitRaw(
        "presence.tick",
        {
          timestamp: Date.now(),
          clients: stats.connectedClients,
          subscriptions: stats.totalSubscriptions,
        },
        { source: "gateway-control" }
      );
    }, 5000);
  };

  const stopPresence = () => {
    if (!presenceTimer) {
      return;
    }
    clearInterval(presenceTimer);
    presenceTimer = null;
  };

  const start = async () => {
    if (config.gateway.enabled && !serverHandle) {
      serverHandle = startGatewayControlNodeServer({
        port: config.gateway.port,
        server: gatewayServer,
        logger,
      });
      startPresence();
    }
    if (config.gateway.enabled && !nodeServerHandle) {
      nodeServerHandle = startGatewayNodeServer({
        port: config.gateway.nodePort,
        registry: nodeRegistry,
        logger: nodeLogger,
      });
    }

    if (!channelsStarted && channelRegistry.listAdapters().length > 0) {
      await channelRegistry.startAll();
      channelsStarted = channelRegistry.getStatus().running > 0;
    }
  };

  const stop = async () => {
    if (channelsStarted) {
      await channelRegistry.stopAll();
      channelsStarted = false;
    }
    if (serverHandle) {
      await serverHandle.close();
      serverHandle = null;
    }
    if (nodeServerHandle) {
      await nodeServerHandle.close();
      nodeServerHandle = null;
    }
    stopPresence();
  };

  const getStatus = (): GatewayControlStatus => {
    const stats = gatewayServer.getStats();
    const channelStatus = channelRegistry.getStatus();
    const nodeStatus = nodeRegistry.getStatus();
    return {
      enabled: config.gateway.enabled,
      port: config.gateway.port,
      nodePort: config.gateway.nodePort,
      authMode: config.gateway.auth.mode,
      started: Boolean(serverHandle),
      clients: stats.connectedClients,
      subscriptions: stats.totalSubscriptions,
      messagesIn: stats.messagesIn,
      messagesOut: stats.messagesOut,
      lastMessageAt: stats.lastMessageAt,
      channels: {
        total: channelStatus.total,
        running: channelsStarted,
        runningCount: channelStatus.running,
        healthyCount: channelStatus.healthy,
        items: channelStatus.channels,
      },
      nodes: {
        enabled: config.gateway.enabled,
        online: nodeStatus.online,
        offline: nodeStatus.offline,
        total: nodeStatus.total,
      },
    };
  };

  const nodes: GatewayNodeRuntime = {
    port: config.gateway.nodePort,
    list: () => nodeRegistry.listNodes(),
    describe: (nodeId) => nodeRegistry.describeNode(nodeId),
    invoke: (nodeId, command, args) => nodeRegistry.invokeNode(nodeId, command, args),
    getStatus: () => nodeRegistry.getStatus(),
  };

  return { eventBus, start, stop, getStatus, nodes };
}

function createGatewaySessionManager(taskRuntime: CoworkTaskRuntime): GatewayControlSessionManager {
  return {
    list: async () => {
      const sessions = await taskRuntime.listSessions();
      return sessions.map(toGatewaySession);
    },
    get: async (sessionId) => {
      const session = await taskRuntime.getSession(sessionId);
      return session ? toGatewaySession(session) : null;
    },
    create: async (input) => {
      const session = await taskRuntime.createSession(normalizeCoworkSessionInput(input));
      return toGatewaySession(session);
    },
    update: async (sessionId, updates) => {
      const session = await taskRuntime.updateSession(
        sessionId,
        normalizeCoworkSessionUpdate(updates)
      );
      return session ? toGatewaySession(session) : null;
    },
    end: async (sessionId) => taskRuntime.endSession(sessionId),
  };
}

function toGatewaySession(session: CoworkSession): GatewayControlSessionSummary {
  return {
    sessionId: session.sessionId,
    userId: session.userId,
    deviceId: session.deviceId,
    title: session.title,
    projectId: session.projectId,
    workspaceId: session.workspaceId,
    isolationLevel: session.isolationLevel,
    sandboxMode: session.sandboxMode,
    toolAllowlist: session.toolAllowlist,
    toolDenylist: session.toolDenylist,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    endedAt: session.endedAt,
    expiresAt: session.expiresAt,
  };
}

function normalizeCoworkSessionInput(
  input: GatewayControlSessionCreateInput
): CoworkGatewaySessionInput {
  const grants = Array.isArray(input.grants) ? (input.grants as CoworkSession["grants"]) : [];
  const connectors = Array.isArray(input.connectors)
    ? (input.connectors as CoworkSession["connectors"])
    : [];
  return {
    sessionId: input.sessionId,
    userId: input.userId,
    deviceId: input.deviceId,
    title: input.title,
    projectId: input.projectId,
    workspaceId: input.workspaceId,
    isolationLevel: input.isolationLevel,
    sandboxMode: input.sandboxMode,
    toolAllowlist: input.toolAllowlist,
    toolDenylist: input.toolDenylist,
    expiresAt: input.expiresAt,
    grants,
    connectors,
  };
}

function normalizeCoworkSessionUpdate(
  updates: GatewayControlSessionUpdateInput
): CoworkGatewaySessionUpdate {
  return {
    title: updates.title,
    projectId: updates.projectId,
    workspaceId: updates.workspaceId,
    isolationLevel: updates.isolationLevel,
    sandboxMode: updates.sandboxMode ?? undefined,
    toolAllowlist: updates.toolAllowlist ?? undefined,
    toolDenylist: updates.toolDenylist ?? undefined,
    endedAt: updates.endedAt,
    expiresAt: updates.expiresAt,
  };
}
