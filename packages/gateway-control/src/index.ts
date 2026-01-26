export { ChannelRegistry, type ChannelRegistryConfig } from "./channels/registry";
export { TelegramAdapter, type TelegramAdapterConfig } from "./channels/telegramAdapter";
export type {
  ChannelAdapter,
  ChannelAdapterContext,
  ChannelMessage,
  ChannelMessageHandler,
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
  GatewayControlClient,
  GatewayControlInboundMessage,
  GatewayControlOutboundMessage,
  GatewayControlServerConfig,
  GatewayWebSocketLike,
} from "./controlPlane/types";
export {
  type GatewayNodeServerConfig,
  type GatewayNodeServerHandle,
  startGatewayControlNodeServer,
} from "./node";
