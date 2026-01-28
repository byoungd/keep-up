export { DiscordAdapter, type DiscordAdapterConfig } from "./channels/discordAdapter";
export { ChannelRegistry, type ChannelRegistryConfig } from "./channels/registry";
export { TelegramAdapter, type TelegramAdapterConfig } from "./channels/telegramAdapter";
export type {
  ChannelAdapter,
  ChannelAdapterContext,
  ChannelAllowFrom,
  ChannelConfig,
  ChannelDmPolicy,
  ChannelGatewayMethod,
  ChannelHealth,
  ChannelMessage,
  ChannelMessageHandler,
  ChannelPlugin,
  ChannelRegistryStatus,
  ChannelStatus,
  ChannelTarget,
} from "./channels/types";
export {
  attachGatewayWebSocket,
  createGatewayControlServer,
  GatewayControlServer,
  resolveGatewayLogger,
} from "./controlPlane/server";
export type {
  GatewayConnectionHandle,
  GatewayControlAuthConfig,
  GatewayControlAuthMode,
  GatewayControlClient,
  GatewayControlInboundMessage,
  GatewayControlOutboundMessage,
  GatewayControlServerConfig,
  GatewayControlStats,
  GatewayWebSocketLike,
} from "./controlPlane/types";
export {
  type GatewayNodeServerConfig,
  type GatewayNodeServerHandle,
  startGatewayControlNodeServer,
} from "./node";
export { type ChannelRouteHandler, type ChannelRouteResult, ChannelRouter } from "./routing/router";
