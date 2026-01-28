# Gateway Core

Gateway core provides the WebSocket control plane (Track CA) and multi-channel routing (Track CB).

## Protocol
- RPC requests: `{ id, method, params? }`
- RPC responses: `{ id, result? | error? }`
- Events: `{ event, payload, timestamp }`

Core methods: `ping`, `auth`, `subscribe`, `unsubscribe`, `channel.list`, `channel.message`.

## Channel Plugins
Channel plugins expose a unified routing contract.

```ts
import type { ChannelPlugin } from "@ku0/gateway";

const plugin: ChannelPlugin = {
  id: "telegram",
  name: "Telegram",
  config: {
    allowFrom: "any",
    dmPolicy: "pairing",
    groups: ["group-id"],
    sessionKey: { sessionId: "session-1" },
  },
  start: async ({ emit }) => {
    // wire upstream events
    emit({
      channelId: "telegram",
      conversationId: "dm-1",
      peerId: "user-1",
      text: "Hello",
      timestamp: Date.now(),
    });
  },
  sendMessage: async (target, text) => {
    // send DM or group message
  },
};
```

## HTTP Channel (Webhooks)
Enable the built-in HTTP channel in `startGatewayServer`:

- `POST /channels/:channelId/messages`
- Body: `{ conversationId, peerId, text, timestamp?, raw? }`

The server routes the message via the configured `ChannelRouter` and `channelRouteHandler`.
