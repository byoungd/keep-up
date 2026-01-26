import { createEventBus, type RuntimeEventBus } from "@ku0/agent-runtime-control";
import { createSubsystemLogger, type Logger } from "@ku0/agent-runtime-telemetry/logging";
import { ChannelRegistry, createGatewayControlServer, TelegramAdapter } from "@ku0/gateway-control";
import { startGatewayControlNodeServer } from "@ku0/gateway-control/node";
import type { CoworkGatewayControlConfig, CoworkTelegramConfig } from "../config";
import type { CoworkTaskRuntime } from "./coworkTaskRuntime";

export interface GatewayControlRuntime {
  eventBus: RuntimeEventBus;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

export interface GatewayControlRuntimeConfig {
  gateway: CoworkGatewayControlConfig;
  telegram: CoworkTelegramConfig;
  taskRuntime: CoworkTaskRuntime;
  eventBus?: RuntimeEventBus;
  logger?: Logger;
}

export function createGatewayControlRuntime(
  config: GatewayControlRuntimeConfig
): GatewayControlRuntime {
  const eventBus = config.eventBus ?? createEventBus();
  const logger = config.logger ?? createSubsystemLogger("cowork", "gateway");
  const channelLogger = createSubsystemLogger("cowork", "channels");
  const gatewayServer = createGatewayControlServer({ eventBus, logger });
  const channelRegistry = new ChannelRegistry({ logger: channelLogger });

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

  channelRegistry.onMessage(async (message) => {
    const sessionId = config.telegram.sessionId;
    if (!sessionId) {
      logger.warn("Channel message dropped: missing session id", {
        channel: message.channel,
        conversationId: message.conversationId,
      });
      return;
    }

    try {
      await config.taskRuntime.enqueueTask(sessionId, {
        prompt: message.text,
        title: `Channel ${message.channel}`,
        metadata: {
          channel: message.channel,
          conversationId: message.conversationId,
          senderId: message.senderId,
          timestamp: message.timestamp,
        },
      });
    } catch (error) {
      logger.error("Failed to enqueue channel task", error, {
        sessionId,
        channel: message.channel,
      });
    }
  });

  let serverHandle: Awaited<ReturnType<typeof startGatewayControlNodeServer>> | null = null;
  let channelsStarted = false;

  const start = async () => {
    if (config.gateway.enabled && !serverHandle) {
      serverHandle = startGatewayControlNodeServer({
        port: config.gateway.port,
        server: gatewayServer,
        logger,
      });
    }

    if (!channelsStarted && channelRegistry.listAdapters().length > 0) {
      await channelRegistry.startAll();
      channelsStarted = true;
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
  };

  return { eventBus, start, stop };
}
