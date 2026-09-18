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

### Telegram

Open **Telegram** next to **Auto-open**, enter your own bot token and chat ID (or
`@channel`), enable alerts, and save. Start the bot in your private chat or give it
permission to post in your group/channel, then click **Test message**.
[Create a bot with BotFather](https://core.telegram.org/bots/tutorial#obtain-your-bot-token).

Credentials stay in this tab unless you select **Remember on this device**;
**Forget** removes saved settings. Browser storage is readable by this website's
scripts: use a dedicated alert bot and never share its token or put it in a link.
Messages go directly from your browser to Telegram. **Keep the tab open and your
device awake**; Telegram alerts work even with sound muted, but not while the site
is closed or suspended.

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

Got your card, or rooting for everyone still waiting? [Say thanks](https://ko-fi.com/timesaved).
Every little tip helps cover $50+ a month and keeps the alerts coming for everyone.
If you found your card, tell us the model and country. We’d love to hear your good news.

Thanks to [Cloudflare](https://github.com/cloudflare) for supporting the project.
Notify-FE is a community project, not affiliated with NVIDIA.
