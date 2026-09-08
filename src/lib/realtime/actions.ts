import { storeUrl, type Model } from "./catalog.ts";
import type { Packet } from "./protocol.ts";

/** Best-effort, opt-in store tabs. Synthetic events never navigate to a shop. */
export function autoOpenStores(
  packet: Packet,
  models: readonly Model[],
  enabled: boolean,
  open: (url: string, target: string, features: string) => unknown,
): number {
  if (
    !enabled ||
    packet.synthetic ||
    packet.type === "snapshot" ||
    packet.status === "offline"
  )
    return 0;
  const urls = new Set<string>();
  for (const model of models) {
    const card = packet.cards.find((c) => c.model === model);
    if (
      packet.alerts.includes(model) &&
      card?.available === true &&
      card.status === "healthy" &&
      card.observedAt !== null &&
      packet.serverTime - card.observedAt >= 0 &&
      packet.serverTime - card.observedAt <= 15_000
    )
      urls.add(storeUrl(packet.locale, card.productUrl));
  }
  for (const url of urls) {
    try {
      open(url, "_blank", "noopener,noreferrer");
    } catch {
      /* The visible alert and manual links remain available. */
    }
  }
  // noopener itself can return null: never misreport that as a proven blocker.
  return urls.size;
}
