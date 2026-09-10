import { z } from "zod";
import { LOCALES, MODELS, type Locale, type Model } from "./catalog.ts";

const counter = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const timestamp = counter.max(8_640_000_000_000_000).nullable();
const source = z.enum([
  "unknown",
  "healthy",
  "blocked",
  "rate_limited",
  "timeout",
  "network_error",
  "invalid_response",
  "stale",
]);
const metrics = z.object({
  requests: counter,
  valid: counter,
  failed: counter,
  windowRequests: counter,
  windowValid: counter,
  windowFailed: counter,
});
export const cardSchema = z.object({
  model: z.enum(MODELS),
  sku: z.string().max(128),
  available: z.boolean().nullable(),
  productUrl: z.string().max(2048).nullable(),
  observedAt: timestamp,
  lastAvailableAt: timestamp.optional().default(null),
  status: source,
});
export type CardState = z.infer<typeof cardSchema>;
export const packetSchema = z
  .object({
    version: z.literal(1),
    type: z.enum(["snapshot", "update", "health"]),
    sequence: counter,
    publicationId: z.string().uuid().nullable(),
    synthetic: z.boolean(),
    serverTime: counter,
    locale: z.enum(LOCALES),
    models: z.array(z.enum(MODELS)).min(1).max(3),
    status: z.enum(["healthy", "source_degraded", "offline"]),
    lastPublisherAt: timestamp,
    staleAfterMs: counter.positive(),
    catalogStaleAfterMs: counter.positive(),
    offlineAfterMs: counter.positive(),
    catalogStatus: source,
    catalogCheckedAt: timestamp,
    // Older publishers omit this; never guess which cards were omitted.
    catalogResult: z
      .object({
        checkedAt: counter,
        models: z
          .array(z.enum(MODELS))
          .max(MODELS.length)
          .refine((models) => new Set(models).size === models.length),
      })
      .nullable()
      .optional(),
    metrics: metrics
      .extend({
        http200: counter,
        lastStatus: z.number().int().nullable(),
        lastLatencyMs: z.number().nonnegative().nullable(),
        lastAttemptAt: timestamp,
        lastSuccessAt: timestamp,
      })
      .nullable(),
    globalMetrics: metrics,
    clients: z.object({
      total: counter,
      locale: counter,
      byModel: z.object({ "5070": counter, "5080": counter, "5090": counter }),
    }),
    cards: z.array(cardSchema).max(3),
    alerts: z.array(z.enum(MODELS)).max(3),
  })
  .superRefine((packet, ctx) => {
    if (
      packet.catalogResult &&
      packet.catalogResult.checkedAt > packet.serverTime
    )
      ctx.addIssue({ code: "custom", message: "Future catalog observation" });
    if (
      new Set(packet.models).size !== packet.models.length ||
      new Set(packet.cards.map((c) => c.model)).size !== packet.cards.length ||
      packet.cards.some((c) => !packet.models.includes(c.model)) ||
      packet.alerts.some((model) => !packet.models.includes(model))
    )
      ctx.addIssue({ code: "custom", message: "Invalid subscription packet" });
  });
export type Packet = z.infer<typeof packetSchema>;
export type MonitorHealth = Packet["status"] | "waiting" | "transport_silent";

/** A current usable stock result, independent of catalog completeness. */
export function isStockCheckFresh(
  card: CardState | undefined,
  now: number,
  staleAfterMs: number,
): boolean {
  return (
    card?.status === "healthy" &&
    typeof card.available === "boolean" &&
    card.observedAt !== null &&
    now - card.observedAt >= 0 &&
    now - card.observedAt < staleAfterMs
  );
}

export const STOCK_FAILURE_GRACE_MS = 30_000;

/** Display grace only: never makes a cached result eligible for an alert. */
export function isStockCheckInGrace(
  card: CardState | undefined,
  now: number,
  staleAfterMs: number,
): boolean {
  return (
    card !== undefined &&
    ["blocked", "rate_limited", "timeout", "network_error", "stale"].includes(
      card.status,
    ) &&
    typeof card.available === "boolean" &&
    card.observedAt !== null &&
    now - card.observedAt >= 0 &&
    now - card.observedAt < Math.min(STOCK_FAILURE_GRACE_MS, staleAfterMs)
  );
}

export function unhealthyStockModels(packet: Packet, now: number): Model[] {
  return MODELS.filter((model) => {
    const card = packet.cards.find((card) => card.model === model);
    return (
      !isStockCheckFresh(card, now, packet.staleAfterMs) &&
      !isStockCheckInGrace(card, now, packet.staleAfterMs)
    );
  });
}

export function subscriptionUrl(endpoint: string, locale: Locale): string {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error("Invalid monitoring endpoint");
  }
  if (
    !["wss:", "ws:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/v1/ws" ||
    url.search ||
    url.hash ||
    (url.protocol === "ws:" &&
      !["localhost", "127.0.0.1"].includes(url.hostname))
  )
    throw new Error("Use a credential-free WSS monitoring endpoint");
  url.searchParams.set("locale", locale);
  // Keep the whole locale visible; alert preferences are applied locally.
  url.searchParams.set("models", MODELS.join(","));
  return url.toString();
}

/** Immutable notification IDs survive retries and alarm sequence changes. */
export class MonitorState {
  packet: Packet | null = null;
  receivedAt = 0;
  readonly seen = new Set<string>();
  readonly locale: Locale;
  readonly allowSynthetic: boolean;

  constructor(locale: Locale, allowSynthetic = false) {
    this.locale = locale;
    this.allowSynthetic = allowSynthetic;
  }

  beginConnection() {
    this.packet = null;
    this.receivedAt = 0;
  }

  private remember(id: string) {
    this.seen.add(id);
    for (const oldest of this.seen) {
      if (this.seen.size <= 256) break;
      this.seen.delete(oldest);
    }
  }

  accept(
    input: unknown,
    monotonicNow: number,
  ): { packet: Packet; alerts: Model[] } | null {
    const parsed = packetSchema.safeParse(input);
    if (!parsed.success) throw new Error("Unsupported monitoring data");
    const next = parsed.data;
    if (
      next.locale !== this.locale ||
      next.models.length !== MODELS.length ||
      MODELS.some((m) => !next.models.includes(m))
    )
      throw new Error("Unexpected subscription");
    if (next.synthetic && !this.allowSynthetic)
      throw new Error("Test data is not enabled");
    if (!this.packet && next.type !== "snapshot") return null;
    if (
      this.packet &&
      (next.sequence < this.packet.sequence || next.type === "snapshot")
    )
      return null;
    const id = (model: Model) =>
      `${next.synthetic}:${next.publicationId}:${next.locale}:${model}`;
    if (next.type === "snapshot" && next.publicationId)
      for (const model of MODELS) this.remember(id(model));
    const alerts: Model[] = [];
    if (
      next.type !== "snapshot" &&
      next.publicationId &&
      next.status !== "offline" &&
      next.lastPublisherAt !== null &&
      next.serverTime - next.lastPublisherAt >= 0 &&
      next.serverTime - next.lastPublisherAt < next.offlineAfterMs
    ) {
      for (const model of new Set(next.alerts)) {
        const card = next.cards.find((c) => c.model === model);
        if (
          !this.seen.has(id(model)) &&
          card?.available === true &&
          card.status === "healthy" &&
          card.observedAt !== null &&
          next.serverTime - card.observedAt >= 0 &&
          next.serverTime - card.observedAt <= 15_000
        ) {
          this.remember(id(model));
          alerts.push(model);
        }
      }
    }
    this.packet = next;
    this.receivedAt = monotonicNow;
    return { packet: next, alerts };
  }

  serverNow(monotonicNow: number) {
    return this.packet
      ? this.packet.serverTime + Math.max(0, monotonicNow - this.receivedAt)
      : null;
  }

  health(monotonicNow: number): MonitorHealth {
    const p = this.packet,
      now = this.serverNow(monotonicNow);
    if (!p || now === null) return "waiting";
    if (
      p.status === "offline" ||
      p.lastPublisherAt === null ||
      now - p.lastPublisherAt < 0 ||
      now - p.lastPublisherAt >= p.offlineAfterMs
    )
      return "offline";
    if (monotonicNow - this.receivedAt >= 45_000) return "transport_silent";
    // The gateway's combined status also includes catalog verification. Keep
    // it unchanged in the packet; the main UI describes stock checking only.
    return unhealthyStockModels(p, now).length ? "source_degraded" : "healthy";
  }
}

export function relativeTime(
  timestamp: number | null | undefined,
  now: number,
): string {
  if (timestamp == null) return "Not recorded yet";
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 5) return "Just now";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  const days = Math.floor(seconds / 86400);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}
