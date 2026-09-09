import assert from "node:assert/strict";
import test from "node:test";
import type { MonitorView } from "../../hooks/useMonitor.ts";
import { demoPacket } from "./demo.ts";
import { catalogNotice, stockHealthCopy } from "./health.ts";
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

void test("Germany's incomplete catalog gets a small note, not a stock-check warning", () => {
  const p = demoPacket("de-de", START);
  p.status = "source_degraded";
  p.catalogStatus = "stale";
  p.catalogCheckedAt = null;
  const monitor = view(p);
  assert.equal(stockHealthCopy(monitor).title, "Stock checks active");
  assert.equal(stockHealthCopy(monitor).tone, "healthy");
  assert.deepEqual(catalogNotice(monitor), {
    text: "SKU verification incomplete — using last-known mappings.",
    tone: "muted",
  });
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
