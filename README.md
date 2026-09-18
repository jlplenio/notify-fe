# Notify-FE

Stock alerts for NVIDIA GeForce **RTX 5090, 5080 and 5070 Founders Edition** in
13 regions. We check availability and send updates to your browser over WebSockets.

**[Open Notify-FE](https://notify-fe.plen.io/)** — free to use, no account needed.

## Get alerts

1. Choose your region and the cards you want notifications for.
2. Click **Test sound** and leave the tab open with your device awake.
3. Optionally enable **Auto-open** to open the store when a card becomes available.
   Allow popups for the site if you use this feature.

Your preferences are saved on your device. The watchlist shows reported stock,
last sightings and whether stock checks are working. “Last seen in stock” is
historical; check the store for current availability. Alerts do not make purchases.

## Use the WebSocket feed

Use a WebSocket client that can set the handshake `Origin` header. No API key or
subscription message is needed.

| Connection setting       | Value                                                         |
| ------------------------ | ------------------------------------------------------------- |
| Endpoint                 | `wss://live.jlplen.io/v1/ws`                                  |
| Required header          | `Origin: https://notify-fe.plen.io`                           |
| Required query: `locale` | One [region](src/lib/realtime/catalog.ts), e.g. `de-de`       |
| Optional query: `models` | Comma-separated `5070`, `5080`, `5090`; defaults to all three |

Example URL: `wss://live.jlplen.io/v1/ws?locale=de-de&models=5080,5090`

Messages are JSON with `version: 1`:

| Message `type`       | What to do                                                                        |
| -------------------- | --------------------------------------------------------------------------------- |
| `snapshot`           | Read the initial state on connect or reconnect; do not trigger alerts.            |
| `update` or `health` | Read `alerts`: a nonempty array such as `["5090"]` signals a newly detected drop. |

Real German RTX 5090 update captured on 18 September 2026 (excerpt):

```json
{
  "version": 1,
  "type": "update",
  "locale": "de-de",
  "alerts": [],
  "publicationId": "781ffc2f-87d7-4d2e-9cc5-b870e5fddf77",
  "synthetic": false,
  "status": "source_degraded",
  "serverTime": 1789763026235,
  "cards": [
    {
      "model": "5090",
      "sku": "PROFESHOP5090",
      "available": false,
      "productUrl": null,
      "observedAt": 1789763019256,
      "lastAvailableAt": null,
      "status": "healthy"
    }
  ]
}
```

This update reported no stock and no store link. A new RTX 5090 drop is indicated
by `"alerts": ["5090"]` with fresh, healthy stock data for that card.

**Trigger notifications from `alerts`, not `cards[].available`**, which can stay
true across many messages. Ignore `synthetic: true` or `status: "offline"` packets.
Require a non-null `publicationId` and a matching card with `available: true`,
`status: "healthy"`, and `observedAt` between 0 and 15 seconds before `serverTime`.
Timestamps are Unix milliseconds. `cards[].productUrl` contains the actual store
link when known, or `null` otherwise.

Deduplicate by `publicationId + locale + model`, including snapshot identities,
and retain recent identities across reconnects. Reconnect with backoff; missed
alerts are not replayed. The feed is read-only; optional text `ping` receives
text `pong`. See the [message schema](src/lib/realtime/protocol.ts) for all fields.

## Support

Got your card? [Say thanks on Ko-fi](https://ko-fi.com/timesaved) and mention your
card and country. Donations help keep the service running.

Thanks to [Cloudflare](https://github.com/cloudflare) for supporting the project.
Notify-FE is a community project, not affiliated with NVIDIA.
