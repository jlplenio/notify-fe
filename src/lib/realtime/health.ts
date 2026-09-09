import type { MonitorView } from "../../hooks/useMonitor.ts";
import { unhealthyStockModels } from "./protocol.ts";

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
      detail: "Receiving live stock updates.",
      tone: "healthy",
    };
  const affected =
    view.packet && view.serverNow !== null
      ? unhealthyStockModels(view.packet, view.serverNow)
      : [];
  return {
    title:
      affected.length > 0 && affected.length < 3
        ? `RTX ${affected.join(" / ")} checks unavailable`
        : "Stock checks unavailable",
    detail:
      affected.length > 0 && affected.length < 3
        ? `${affected.length === 1 ? "This card’s stock is" : "These cards’ stock is"} unconfirmed. Other cards continue to be monitored.`
        : "Fresh stock results are unavailable. Alerts may be delayed.",
    tone: "warning",
  };
}

/** Catalog limitations stay visible without claiming the stock polls failed. */
export function catalogNotice(view: MonitorView): {
  text: string;
  tone: "muted" | "warning";
} | null {
  const p = view.packet,
    now = view.serverNow;
  if (
    !p ||
    now === null ||
    view.connection !== "connected" ||
    view.health === "offline" ||
    view.health === "transport_silent" ||
    view.health === "waiting"
  )
    return null;

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
    text: "SKU verification incomplete — using last-known mappings.",
    tone: "muted",
  };
}
