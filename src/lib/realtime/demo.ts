import { MODELS, type Locale, type Model } from "./catalog.ts";
import type { Packet } from "./protocol.ts";

/** Explicit preview only. Never stored as history and never sent to a server. */
export function demoPacket(
  locale: Locale,
  now: number,
  sequence = 1,
  available: Model | null = null,
): Packet {
  const elapsed: Record<Model, number> = {
    "5090": 10_860_000,
    "5080": 172_800_000,
    "5070": 25_200_000,
  };
  const byLocale: Record<Locale, number> = {
    "de-de": 24,
    "en-gb": 19,
    "de-at": 6,
    "da-dk": 5,
    "es-es": 10,
    "fr-fr": 16,
    "it-it": 12,
    "nl-nl": 9,
    "nb-no": 4,
    "pl-pl": 7,
    "fi-fi": 3,
    "sv-se": 5,
    "en-us": 8,
  };
  const website = Math.round((byLocale[locale] * 100) / 128);
  return {
    version: 1,
    type: "snapshot",
    sequence,
    publicationId: `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
    synthetic: true,
    serverTime: now,
    locale,
    models: [...MODELS],
    status: "healthy",
    lastPublisherAt: now,
    monitorHealthPercent: 100,
    staleAfterMs: 60_000,
    catalogStaleAfterMs: 75_000,
    offlineAfterMs: 75_000,
    catalogStatus: "healthy",
    catalogCheckedAt: now,
    metrics: {
      requests: 2160,
      http200: 2160,
      valid: 2160,
      failed: 0,
      windowRequests: 9,
      windowValid: 9,
      windowFailed: 0,
      lastStatus: 200,
      lastLatencyMs: 140,
      lastAttemptAt: now,
      lastSuccessAt: now,
    },
    globalMetrics: {
      requests: 28080,
      valid: 28080,
      failed: 0,
      windowRequests: 117,
      windowValid: 117,
      windowFailed: 0,
    },
    clients: {
      total: 128,
      locale: byLocale[locale],
      byModel: {
        "5070": byLocale[locale],
        "5080": byLocale[locale],
        "5090": byLocale[locale],
      },
      byLocale,
      byClient: { website: 100, unclassified: 28 },
      localeByClient: { website, unclassified: byLocale[locale] - website },
    },
    cards: MODELS.map((model) => ({
      model,
      sku: `DEMO${model}`,
      available: model === available,
      productUrl: null,
      observedAt: now,
      lastAvailableAt: model === available ? now : now - elapsed[model],
      status: "healthy",
    })),
    alerts: available ? [available] : [],
  };
}

export const PREVIEW_SCENARIOS = [
  ["healthy", "All good"],
  ["5090-delayed", "5090 delayed"],
  ["5080-delayed", "5080 delayed"],
  ["all-delayed", "All delayed"],
] as const;
export type PreviewScenario = (typeof PREVIEW_SCENARIOS)[number][0];

/** Explicit local scenarios only; live packets never use these transformations. */
export function previewPacket(
  locale: Locale,
  now: number,
  sequence = 1,
  available: Model | null = null,
  scenario: PreviewScenario = "5080-delayed",
): Packet {
  const packet = demoPacket(locale, now, sequence, available);
  packet.monitorHealthPercent =
    scenario === "healthy" ? 100 : scenario === "all-delayed" ? 0 : 72;
  const delayed = packet.cards.filter(
    (card) =>
      card.model !== available &&
      (scenario === "all-delayed" || scenario === `${card.model}-delayed`),
  );
  if (delayed.length === 0) return packet;
  for (const card of delayed) {
    card.status = "timeout";
    card.observedAt = now - 45_000;
  }
  const failures = delayed.length * 3;
  packet.status = "source_degraded";
  packet.metrics!.valid -= failures;
  packet.metrics!.http200 -= failures;
  packet.metrics!.failed += failures;
  packet.metrics!.windowValid -= failures;
  packet.metrics!.windowFailed += failures;
  packet.metrics!.lastStatus = null;
  if (delayed.length === packet.cards.length)
    packet.metrics!.lastSuccessAt = now - 45_000;
  packet.globalMetrics.valid -= failures;
  packet.globalMetrics.failed += failures;
  packet.globalMetrics.windowValid -= failures;
  packet.globalMetrics.windowFailed += failures;
  return packet;
}
