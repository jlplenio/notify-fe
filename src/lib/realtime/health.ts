import type { MonitorView } from "../../hooks/useMonitor.ts";
import type { Model } from "./catalog.ts";
import { unhealthyStockModels } from "./protocol.ts";

/** Display the producer's percentage only while the feed remains current. */
export function monitorHealthPercent(view: MonitorView): number | null {
  const packet = view.packet;
  const now = view.serverNow;
  if (
    view.connection !== "connected" ||
    ["waiting", "offline", "transport_silent"].includes(view.health) ||
    !packet ||
    now === null ||
    packet.lastPublisherAt === null ||
    now < packet.lastPublisherAt ||
    now - packet.lastPublisherAt >= packet.offlineAfterMs
  )
    return null;
  return packet.monitorHealthPercent ?? null;
}

interface HealthCopy {
  title: string;
  detail: string;
  tone: "muted" | "healthy" | "warning";
}

/** Main banner: connection and stock results for the displayed locale only. */
export function stockHealthCopy(view: MonitorView): HealthCopy {
  if (view.connection === "unconfigured")
    return {
      title: "Monitoring not connected",
      detail: view.issue ?? "Waiting for a monitoring endpoint.",
      tone: "muted",
    };
  if (view.connection === "browser_offline")
    return {
      title: "You’re offline",
      detail: "We’ll reconnect when your internet connection returns.",
      tone: "warning",
    };
  if (view.connection !== "connected")
    return {
      title:
        view.connection === "reconnecting"
          ? "Reconnecting…"
          : "Connecting to the monitor…",
      detail: view.issue ?? "Getting a fresh snapshot for your region.",
      tone: "muted",
    };
  if (view.health === "offline")
    return {
      title: "The monitor is offline",
      detail:
        "The source has stopped reporting. Availability is unconfirmed until it recovers.",
      tone: "warning",
    };
  if (view.health === "transport_silent")
    return {
      title: "Waiting for a fresh heartbeat",
      detail: "The connection is open, but monitoring updates are delayed.",
      tone: "warning",
    };
  if (view.health === "waiting")
    return {
      title: "Waiting for stock data",
      detail: "Getting the first stock results for your region.",
      tone: "muted",
    };
  if (view.health === "healthy")
    return {
      title: "Stock checks active",
      detail:
        "Stock checks run every 10 seconds. Changes are sent immediately.",
      tone: "healthy",
    };
  const affected =
    view.packet && view.serverNow !== null
      ? unhealthyStockModels(view.packet, view.serverNow)
      : [];
  return {
    title:
      affected.length > 0 && affected.length < 3
        ? `RTX ${affected.join(" / ")} stock status unavailable`
        : "Stock status unavailable",
    detail:
      affected.length > 0 && affected.length < 3
        ? "Waiting for the next update. Checks continue automatically; other cards continue to be monitored."
        : "Waiting for the next update. Checks continue automatically.",
    tone: "warning",
  };
}

export interface CatalogInfo {
  text: string;
  tone: "muted" | "warning";
}

function hasCatalogContext(view: MonitorView): boolean {
  return (
    view.packet !== null &&
    view.serverNow !== null &&
    view.connection === "connected" &&
    !["offline", "transport_silent", "waiting"].includes(view.health)
  );
}

function recentCatalogResult(view: MonitorView) {
  const p = view.packet;
  const result = p?.catalogResult;
  const now = view.serverNow;
  return p &&
    result &&
    now !== null &&
    now - result.checkedAt >= 0 &&
    now - result.checkedAt < p.catalogStaleAfterMs
    ? result
    : null;
}

/** Compact, on-demand context; never changes the stock-health banner. */
export function catalogNotice(view: MonitorView): CatalogInfo | null {
  const p = view.packet,
    now = view.serverNow;
  if (!p || now === null || !hasCatalogContext(view)) return null;

  const failures = {
    blocked: "SKU updates blocked",
    rate_limited: "SKU updates rate-limited",
    timeout: "SKU refresh timed out",
    network_error: "SKU refresh unavailable",
    invalid_response: "SKU response could not be verified",
  };
  if (p.catalogStatus in failures)
    return {
      text: `${failures[p.catalogStatus as keyof typeof failures]} — using last-known mappings.`,
      tone: "warning",
    };
  const result = recentCatalogResult(view);
  if (result && p.models.some((model) => !result.models.includes(model)))
    return {
      text: "NVIDIA’s latest catalog response omitted some cards. Stock checks use their last-known SKUs. A newer SKU may not be detected until it appears in the catalog.",
      tone: "muted",
    };
  if (
    p.catalogStatus === "healthy" &&
    p.catalogCheckedAt !== null &&
    now - p.catalogCheckedAt >= 0 &&
    now - p.catalogCheckedAt < p.catalogStaleAfterMs
  )
    return null;
  // "stale" is also used for partial responses; its timestamp records the
  // last FULL confirmation, not the most recent successful catalog request.
  return {
    text: "A fresh, complete SKU confirmation is not available. Stock checks use the known SKUs; details about individual catalog omissions are not available yet.",
    tone: "muted",
  };
}

/** Only mark a card when the feed gives evidence for that particular card. */
export function cardCatalogNotice(
  view: MonitorView,
  model: Model,
): CatalogInfo | null {
  if (!hasCatalogContext(view)) return null;
  const card = view.packet?.cards.find((entry) => entry.model === model);
  if (!card?.sku)
    return {
      text: "No SKU is known for this card yet. Stock checks cannot run until a mapping is found.",
      tone: "warning",
    };
  const result = recentCatalogResult(view);
  if (!result || result.models.includes(model)) return null;
  return {
    text: "NVIDIA’s latest successful catalog response did not list this card. Stock checks use its last-known SKU. A newer SKU may not be detected until it appears in the catalog.",
    tone: "muted",
  };
}
