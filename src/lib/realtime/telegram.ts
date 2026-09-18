import { z } from "zod";
import { COUNTRIES, storeUrl, type Model } from "./catalog.ts";
import type { Packet } from "./protocol.ts";
import {
  TELEGRAM_RECEIPTS_KEY,
  validateTelegram,
  type StorageAccess,
  type TelegramSettings,
} from "./telegram-settings.ts";

export type TelegramResult = {
  kind: "sent" | "error" | "skipped";
  message: string;
  retryAfter?: number;
};
const replySchema = z.object({
  ok: z.boolean(),
  error_code: z.number().optional(),
  parameters: z
    .object({ retry_after: z.number().int().min(1).max(86400).optional() })
    .optional(),
});

/** No API descriptions or thrown errors reach the UI: they may contain secrets. */
export async function sendTelegram(
  settings: TelegramSettings,
  text: string,
  signal: AbortSignal,
  request: typeof fetch = fetch,
  timeoutMs = 8000,
): Promise<TelegramResult> {
  const checked = validateTelegram(settings);
  if (!checked.settings) return { kind: "error", message: checked.error };
  if (!text || text.length > 4096)
    return { kind: "error", message: "The Telegram message is too long." };
  if (signal.aborted)
    return { kind: "skipped", message: "Telegram send cancelled." };
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(cancel, timeoutMs);
  try {
    const value = checked.settings;
    const body = new URLSearchParams({
      chat_id: value.chatId,
      text,
      link_preview_options: JSON.stringify({ is_disabled: true }),
    });
    if (value.topicId) body.set("message_thread_id", value.topicId);
    const response = await request(
      `https://api.telegram.org/bot${value.token}/sendMessage`,
      {
        method: "POST",
        body,
        signal: controller.signal,
        credentials: "omit",
        referrerPolicy: "no-referrer",
        cache: "no-store",
        redirect: "error",
      },
    );
    const reply = replySchema.safeParse((await response.json()) as unknown);
    if (response.ok && reply.success && reply.data.ok)
      return { kind: "sent", message: "Telegram accepted the message." };
    const status = reply.success
      ? reply.data.error_code ?? response.status
      : response.status;
    if (status === 429)
      return {
        kind: "error",
        message:
          "Telegram is rate limiting this bot. Wait before trying again.",
        retryAfter: reply.success
          ? reply.data.parameters?.retry_after ?? 30
          : 30,
      };
    if (status === 401 || status === 404)
      return {
        kind: "error",
        message: "Telegram rejected the bot token. Check it in BotFather.",
      };
    if (status === 403)
      return {
        kind: "error",
        message:
          "The bot cannot post here. Start the bot, unblock it, or grant channel posting permission.",
      };
    if (status === 400)
      return {
        kind: "error",
        message:
          "Telegram rejected the destination. Check the chat/topic ID and start or add the bot first.",
      };
    return {
      kind: "error",
      message:
        "Telegram did not confirm delivery. Check the chat before retrying.",
    };
  } catch {
    return signal.aborted
      ? { kind: "skipped", message: "Telegram send cancelled." }
      : {
          kind: "error",
          message:
            "Telegram delivery could not be confirmed. Check your connection and chat before retrying.",
        };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
  }
}

export function telegramAlertModels(
  packet: Packet,
  selected: readonly Model[],
): Model[] {
  if (
    packet.synthetic ||
    packet.type === "snapshot" ||
    packet.status === "offline" ||
    !packet.publicationId ||
    packet.lastPublisherAt === null ||
    packet.serverTime - packet.lastPublisherAt < 0 ||
    packet.serverTime - packet.lastPublisherAt >= packet.offlineAfterMs
  )
    return [];
  return [...new Set(selected)].filter((model) => {
    const card = packet.cards.find((c) => c.model === model);
    return (
      packet.alerts.includes(model) &&
      card?.available === true &&
      card.status === "healthy" &&
      card.observedAt !== null &&
      packet.serverTime - card.observedAt >= 0 &&
      packet.serverTime - card.observedAt <= 15000
    );
  });
}

export function telegramAlertText(
  packet: Packet,
  models: readonly Model[],
): string {
  const page = `https://notify-fe.plen.io/?region=${packet.locale}`;
  let text = `Notify-FE: RTX ${models.join(" / ")} spotted in stock in ${COUNTRIES[packet.locale].name}.\n\n${page}`;
  for (const model of models) {
    const link = `\n\nRTX ${model}: ${storeUrl(packet.locale, packet.cards.find((c) => c.model === model)?.productUrl)}`;
    // Never truncate a signed checkout URL; the website link remains usable.
    if (text.length + link.length <= 4096) text += link;
  }
  return text;
}

type Receipt = { id: string; at: number };
const receiptsSchema = z
  .array(z.object({ id: z.string().max(256), at: z.number().finite() }))
  .max(256);
type Lock = <T>(work: () => Promise<T>, signal: AbortSignal) => Promise<T>;
type Options = {
  request?: typeof fetch;
  storage?: StorageAccess | null;
  lock?: Lock;
  now?: () => number;
  wait?: (ms: number, signal: AbortSignal) => Promise<void>;
};
const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
    if (signal.aborted) done();
  });

/** A bounded, best-effort cross-tab claim. Unknown delivery is never blindly retried. */
export class TelegramNotifier {
  private receipts: Receipt[] = [];
  private pauses = new Map<string, number>();
  private options: Options;
  constructor(options: Options = {}) {
    this.options = options;
  }

  async send(
    settings: TelegramSettings,
    packet: Packet | null,
    selected: readonly Model[],
    signal: AbortSignal,
  ): Promise<TelegramResult> {
    const checked = validateTelegram(settings);
    if (!checked.settings) return { kind: "error", message: checked.error };
    const models = packet ? telegramAlertModels(packet, selected) : [];
    if (packet && (!settings.enabled || !models.length))
      return { kind: "skipped", message: "No new selected live drop." };
    const now = this.options.now ?? Date.now;
    const started = now();
    const expires = packet
      ? started +
        Math.min(
          ...models.map(
            (model) =>
              15000 -
              (packet.serverTime -
                packet.cards.find((c) => c.model === model)!.observedAt!),
          ),
        )
      : started + 15000;
    // Neither lock names nor the shared receipt list contain credentials.
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(
        `${settings.token.trim()}\0${settings.chatId.trim()}\0${settings.topicId.trim()}`,
      ),
    );
    const destination = Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    const work = async (): Promise<TelegramResult> => {
      if (signal.aborted || now() >= expires)
        return {
          kind: "skipped",
          message: "Telegram alert expired or was cancelled.",
        };
      try {
        const shared = receiptsSchema.safeParse(
          JSON.parse(
            this.options.storage?.getItem(TELEGRAM_RECEIPTS_KEY) ?? "[]",
          ) as unknown,
        );
        if (shared.success) this.receipts.push(...shared.data);
      } catch {
        /* Tab-local deduplication still works without storage. */
      }
      this.receipts = this.receipts
        .filter((r) => r.at > now() - 86400000)
        .slice(-256);
      const id = (model: Model) =>
        `${destination}:${packet?.publicationId}:${packet?.locale}:${model}`;
      const fresh = models.filter(
        (model) => !this.receipts.some((r) => r.id === id(model)),
      );
      if (packet && !fresh.length)
        return {
          kind: "skipped",
          message: "This drop was already handled in this browser.",
        };
      const pause = (this.pauses.get(destination) ?? 0) - now();
      if (pause > 0)
        return {
          kind: "error",
          message:
            "Telegram is rate limiting this bot. Wait before trying again.",
          retryAfter: Math.ceil(pause / 1000),
        };
      if (packet) {
        this.receipts.push(
          ...fresh.map((model) => ({ id: id(model), at: now() })),
        );
        this.receipts = this.receipts.slice(-256);
        try {
          this.options.storage?.setItem(
            TELEGRAM_RECEIPTS_KEY,
            JSON.stringify(this.receipts),
          );
        } catch {
          /* Best effort only. */
        }
      }
      const text = packet
        ? telegramAlertText(packet, fresh)
        : "Notify-FE test: Telegram notifications are working. Keep the website open and your device awake to receive new drop alerts.";
      let result = await sendTelegram(
        settings,
        text,
        signal,
        this.options.request,
        Math.min(8000, Math.max(1, expires - now())),
      );
      if (result.retryAfter) {
        this.pauses.set(destination, now() + result.retryAfter * 1000);
        if (this.pauses.size > 16) {
          for (const oldest of this.pauses.keys()) {
            this.pauses.delete(oldest);
            break;
          }
        }
        // Only retry an explicit rejection, once, while the alert is still fresh.
        if (packet && now() + result.retryAfter * 1000 + 1000 < expires) {
          await (this.options.wait ?? wait)(result.retryAfter * 1000, signal);
          if (!signal.aborted && now() < expires) {
            result = await sendTelegram(
              settings,
              text,
              signal,
              this.options.request,
              Math.min(8000, expires - now()),
            );
            if (result.retryAfter)
              this.pauses.set(destination, now() + result.retryAfter * 1000);
          }
        }
      }
      return result;
    };
    try {
      return await (this.options.lock
        ? this.options.lock(work, signal)
        : work());
    } catch {
      return {
        kind: "skipped",
        message: "Telegram send cancelled or unavailable.",
      };
    }
  }
}
