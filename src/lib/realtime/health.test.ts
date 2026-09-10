import assert from "node:assert/strict";
import test from "node:test";
import type { MonitorView } from "../../hooks/useMonitor.ts";
import { demoPacket } from "./demo.ts";
import { cardCatalogNotice, catalogNotice, stockHealthCopy } from "./health.ts";
import { MonitorState, type Packet } from "./protocol.ts";

const START = 1_788_900_000_000;
function view(
  packet: Packet = demoPacket("de-de", START),
  elapsed = 0,
): MonitorView {
  const state = new MonitorState(packet.locale, true);
  state.accept(packet, 0);
  return {
    packet: state.packet,
    health: state.health(elapsed),
    serverNow: state.serverNow(elapsed),
    connection: "connected",
    issue: null,
  };
}

void test("legacy feeds get generic information without guessing which cards are omitted", () => {
  const p = demoPacket("de-de", START);
  p.status = "source_degraded";
  p.catalogStatus = "stale";
  p.catalogCheckedAt = null;
  const monitor = view(p);
  assert.equal(stockHealthCopy(monitor).title, "Stock checks active");
  assert.equal(stockHealthCopy(monitor).tone, "healthy");
  assert.deepEqual(catalogNotice(monitor), {
    text: "A fresh, complete SKU confirmation is not available. Stock checks use the known SKUs; details about individual catalog omissions are not available yet.",
    tone: "muted",
  });
  for (const model of p.models)
    assert.equal(cardCatalogNotice(monitor, model), null);
});

void test("a successful partial response marks only the omitted cards, keeping stock green", () => {
  const p = demoPacket("de-de", START);
  p.catalogStatus = "stale";
  p.catalogCheckedAt = null;
  p.catalogResult = { checkedAt: START, models: ["5090"] };
  const monitor = view(p);
  assert.equal(stockHealthCopy(monitor).tone, "healthy");
  assert.match(
    catalogNotice(monitor)!.text,
    /catalog response omitted some cards/,
  );
  assert.equal(catalogNotice(monitor)!.tone, "muted");
  assert.equal(cardCatalogNotice(monitor, "5090"), null);
  for (const model of ["5070", "5080"] as const) {
    assert.match(
      cardCatalogNotice(monitor, model)!.text,
      /did not list this card/,
    );
    assert.equal(cardCatalogNotice(monitor, model)!.tone, "muted");
  }
  p.catalogResult = { checkedAt: START, models: ["5080"] };
  assert.equal(cardCatalogNotice(view(p), "5080"), null);
  assert.notEqual(cardCatalogNotice(view(p), "5090"), null);
});

void test("an empty valid catalog is not a missing SKU when saved mappings exist", () => {
  const p = demoPacket("de-de", START);
  p.catalogStatus = "stale";
  p.catalogResult = { checkedAt: START, models: [] };
  for (const model of p.models) {
    const info = cardCatalogNotice(view(p), model)!;
    assert.match(info.text, /last-known SKU/);
    assert.equal(info.tone, "muted");
  }
  assert.equal(stockHealthCopy(view(p)).tone, "healthy");
  p.cards = p.cards.filter((card) => card.model !== "5080");
  assert.match(cardCatalogNotice(view(p), "5080")!.text, /No SKU is known/);
  assert.equal(cardCatalogNotice(view(p), "5080")!.tone, "warning");
  assert.equal(stockHealthCopy(view(p)).tone, "warning");
});

void test("stale response details and another locale cannot identify current omissions", () => {
  const p = demoPacket("de-de", START);
  p.catalogStatus = "stale";
  p.catalogCheckedAt = null;
  p.catalogResult = {
    checkedAt: START - p.catalogStaleAfterMs,
    models: ["5090"],
  };
  assert.match(
    catalogNotice(view(p))!.text,
    /details about individual catalog omissions are not available/,
  );
  for (const model of p.models)
    assert.equal(cardCatalogNotice(view(p), model), null);
  const finland = demoPacket("fi-fi", START);
  finland.catalogResult = { checkedAt: START, models: [...finland.models] };
  assert.equal(catalogNotice(view(finland)), null);
  for (const model of finland.models)
    assert.equal(cardCatalogNotice(view(finland), model), null);
});

void test("actual catalog errors get explicit separate wording without claiming stock failed", () => {
  const cases = [
    ["blocked", "SKU updates blocked"],
    ["rate_limited", "SKU updates rate-limited"],
    ["timeout", "SKU refresh timed out"],
    ["network_error", "SKU refresh unavailable"],
    ["invalid_response", "SKU response could not be verified"],
  ] as const;
  for (const [status, text] of cases) {
    const p = demoPacket("de-de", START);
    p.status = "source_degraded";
    p.catalogStatus = status;
    p.catalogResult = { checkedAt: START, models: ["5090"] };
    const monitor = view(p);
    assert.equal(stockHealthCopy(monitor).tone, "healthy");
    assert.deepEqual(catalogNotice(monitor), {
      text: `${text} — using last-known mappings.`,
      tone: "warning",
    });
  }
});

void test("catalog notices clear only on a fresh full confirmation", () => {
  assert.equal(catalogNotice(view()), null);
  for (const stamp of [null, START - 75_000, START + 1]) {
    const p = demoPacket("de-de", START);
    p.catalogCheckedAt = stamp;
    assert.equal(stockHealthCopy(view(p)).tone, "healthy");
    assert.equal(catalogNotice(view(p))?.tone, "muted");
  }
  const p = demoPacket("de-de", START);
  p.catalogCheckedAt = START - p.catalogStaleAfterMs + 1000;
  assert.equal(catalogNotice(view(p, 999)), null);
  assert.equal(catalogNotice(view(p, 1000))?.tone, "muted");
});

void test("only the affected cards are named in a stock warning", () => {
  const p = demoPacket("de-at", START);
  p.cards[0]!.status = "invalid_response";
  p.cards[0]!.available = null;
  p.cards[0]!.observedAt = null;
  assert.equal(stockHealthCopy(view(p)).title, "RTX 5070 checks unavailable");
  assert.match(stockHealthCopy(view(p)).detail, /Other cards continue/);
  assert.equal(stockHealthCopy(view(p)).tone, "warning");
  p.cards[1]!.status = "timeout";
  p.cards[1]!.observedAt = START - 30_000;
  assert.equal(
    stockHealthCopy(view(p)).title,
    "RTX 5070 / 5080 checks unavailable",
  );
  p.cards = [];
  assert.equal(stockHealthCopy(view(p)).title, "Stock checks unavailable");
  assert.doesNotMatch(stockHealthCopy(view(p)).detail, /Other cards continue/);
  assert.equal(
    stockHealthCopy(view()).tone,
    "healthy",
    "Germany stays healthy",
  );
});

void test("connection and publisher failures take precedence over catalog notices", () => {
  const p = demoPacket("de-de", START);
  p.catalogStatus = "stale";
  const monitor = view(p);
  for (const [connection, title] of [
    ["unconfigured", "Monitoring not connected"],
    ["connecting", "Connecting to the monitor…"],
    ["reconnecting", "Reconnecting…"],
    ["browser_offline", "You’re offline"],
  ] as const) {
    const disconnected = { ...monitor, connection };
    assert.equal(stockHealthCopy(disconnected).title, title);
    assert.notEqual(stockHealthCopy(disconnected).tone, "healthy");
    assert.equal(catalogNotice(disconnected), null);
    assert.equal(cardCatalogNotice(disconnected, "5080"), null);
  }
  assert.equal(
    stockHealthCopy(view(p, 45_000)).title,
    "Waiting for a fresh heartbeat",
  );
  assert.equal(catalogNotice(view(p, 45_000)), null);
  assert.equal(
    stockHealthCopy(view(p, 75_000)).title,
    "The monitor is offline",
  );
  assert.equal(catalogNotice(view(p, 75_000)), null);
  const waiting: MonitorView = {
    ...monitor,
    packet: null,
    serverNow: null,
    health: "waiting",
  };
  assert.equal(stockHealthCopy(waiting).title, "Waiting for stock data");
  assert.equal(catalogNotice(waiting), null);
});
