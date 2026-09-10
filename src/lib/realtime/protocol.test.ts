import assert from "node:assert/strict";
import test from "node:test";
import { demoPacket } from "./demo.ts";
import { storeUrl, legacyRedirectTarget } from "./catalog.ts";
import {
  MonitorState,
  isStockCheckFresh,
  isStockCheckInGrace,
  packetSchema,
  relativeTime,
  subscriptionUrl,
  unhealthyStockModels,
  type Packet,
} from "./protocol.ts";

const START = 1_788_900_000_000;
void test("catalog evidence is optional, bounded, unique and not from the future", () => {
  const p = demoPacket("de-de", START);
  assert.equal(packetSchema.safeParse(p).success, true);
  for (const models of [[], ["5090"], ["5070", "5080", "5090"]]) {
    const parsed = packetSchema.parse({
      ...p,
      catalogResult: { checkedAt: START, models },
    });
    assert.deepEqual(parsed.catalogResult?.models, models);
  }
  for (const result of [
    { checkedAt: START + 1, models: ["5090"] },
    { checkedAt: -1, models: [] },
    { checkedAt: START, models: ["5090", "5090"] },
    { checkedAt: START, models: ["4090"] },
    { models: ["5090"] },
  ])
    assert.equal(
      packetSchema.safeParse({ ...p, catalogResult: result }).success,
      false,
    );
});

void test("legacy redirect accepts only HTTPS NVIDIA destinations", () => {
  assert.equal(
    legacyRedirectTarget("https://store.nvidia.com/item"),
    "https://store.nvidia.com/item",
  );
  for (const bad of [
    "javascript:alert(1)",
    "https://nvidia.com.attacker.example/",
    "https://user:pass@nvidia.com/",
    "https://attacker.example/",
    ["https://nvidia.com/"],
    null,
  ])
    assert.equal(legacyRedirectTarget(bad), null);
});

void test("last-available timestamps must fit a JavaScript Date", () => {
  const p = packet();
  p.cards[0]!.lastAvailableAt = Number.MAX_SAFE_INTEGER;
  assert.equal(packetSchema.safeParse(p).success, false);
});
function packet(
  sequence = 1,
  type: Packet["type"] = "snapshot",
  available = false,
): Packet {
  return {
    ...demoPacket(
      "de-de",
      START + sequence,
      sequence,
      available ? "5090" : null,
    ),
    synthetic: false,
    type,
  };
}

void test("initial positive snapshots are quiet; a new live positive alerts once", () => {
  const state = new MonitorState("de-de");
  assert.deepEqual(state.accept(packet(1, "snapshot", true), 0)?.alerts, []);
  assert.deepEqual(state.accept(packet(2, "update", true), 10)?.alerts, [
    "5090",
  ]);
  assert.deepEqual(state.accept(packet(2, "update", true), 11)?.alerts, []);
});

void test("alarm sequence changes and equal-sequence retries use immutable notification identity", () => {
  const state = new MonitorState("de-de");
  state.accept(packet(), 0);
  const alert = packet(2, "update", true);
  assert.deepEqual(
    state.accept({ ...alert, type: "health", alerts: [] }, 1)?.alerts,
    [],
  );
  assert.deepEqual(state.accept(alert, 2)?.alerts, ["5090"]);
  assert.deepEqual(state.accept({ ...alert, sequence: 99 }, 3)?.alerts, []);
  assert.equal(state.accept(packet(1, "update", true), 4), null);
});

void test("reconnect snapshot is a quiet baseline; buffered updates before it are ignored", () => {
  const state = new MonitorState("de-de");
  assert.equal(state.accept(packet(2, "update", true), 0), null);
  state.accept(packet(), 1);
  state.accept(packet(2, "update", true), 2);
  state.beginConnection();
  assert.deepEqual(state.accept(packet(3, "snapshot", true), 3)?.alerts, []);
  assert.deepEqual(state.accept(packet(3, "update", true), 4)?.alerts, []);
});

void test("expired, future, blocked and offline positives cannot trigger alerts", () => {
  for (const failure of ["expired", "future", "blocked", "offline"]) {
    const state = new MonitorState("de-de");
    state.accept(packet(), 0);
    const p = packet(2, "update", true);
    const card = p.cards.find((c) => c.model === "5090")!;
    if (failure === "expired") card.observedAt = p.serverTime - 15_001;
    if (failure === "future") card.observedAt = p.serverTime + 1;
    if (failure === "blocked") card.status = "blocked";
    if (failure === "offline") p.status = "offline";
    assert.deepEqual(state.accept(p, 1)?.alerts, [], failure);
  }
});

void test("source health expires using server time plus monotonic elapsed time", () => {
  const state = new MonitorState("de-de");
  state.accept(packet(), 10_000);
  assert.equal(state.health(10_000), "healthy");
  assert.equal(state.health(56_000), "transport_silent");
  assert.equal(state.health(85_001), "offline");
  const p = packet(2, "health");
  p.cards[0]!.observedAt = p.serverTime - 60_000;
  state.accept(p, 85_100);
  assert.equal(state.health(85_100), "source_degraded");
});

void test("catalog degradation does not mislabel fresh stock checks or rewrite the wire status", () => {
  for (const catalogStatus of [
    "stale",
    "unknown",
    "blocked",
    "timeout",
    "network_error",
    "rate_limited",
    "invalid_response",
  ] as const) {
    const p = packet();
    p.status = "source_degraded";
    p.catalogStatus = catalogStatus;
    p.catalogCheckedAt = null;
    const state = new MonitorState("de-de");
    state.accept(p, 0);
    assert.equal(state.health(0), "healthy", catalogStatus);
    assert.equal(state.packet?.status, "source_degraded");
    assert.equal(state.packet?.catalogStatus, catalogStatus);
    assert.equal(state.packet?.catalogCheckedAt, null);
  }
});

void test("missing, stale, failed, future or unknown stock stays degraded even with a fresh catalog", () => {
  for (const reason of [
    "missing",
    "stale",
    "failed",
    "future",
    "unknown",
    "unobserved",
  ]) {
    const p = packet();
    const card = p.cards.find((c) => c.model === "5070")!;
    if (reason === "missing")
      p.cards = p.cards.filter((c) => c.model !== "5070");
    if (reason === "stale") card.observedAt = p.serverTime - p.staleAfterMs;
    if (reason === "failed") {
      card.status = "blocked";
      card.observedAt = p.serverTime - 30_000;
    }
    if (reason === "future") card.observedAt = p.serverTime + 1;
    if (reason === "unknown") card.available = null;
    if (reason === "unobserved") card.observedAt = null;
    const state = new MonitorState("de-de");
    state.accept(p, 0);
    assert.equal(state.health(0), "source_degraded", reason);
    assert.deepEqual(unhealthyStockModels(p, p.serverTime), ["5070"], reason);
    assert.ok(
      isStockCheckFresh(
        p.cards.find((c) => c.model === "5090"),
        p.serverTime,
        p.staleAfterMs,
      ),
    );
  }
});

void test("transient failures have a 30-second display grace without rewriting raw state", () => {
  for (const status of [
    "blocked",
    "timeout",
    "network_error",
    "rate_limited",
    "stale",
  ] as const) {
    const p = packet();
    p.status = "source_degraded";
    const card = p.cards[0]!;
    card.status = status;
    card.observedAt = p.serverTime - 10_000;
    const state = new MonitorState("de-de");
    state.accept(p, 0);
    assert.equal(state.health(19_999), "healthy", status);
    assert.equal(state.health(20_000), "source_degraded", status);
    assert.equal(state.packet?.cards[0]?.status, status);
    assert.equal(state.packet?.cards[0]?.observedAt, card.observedAt);
    assert.equal(isStockCheckFresh(card, p.serverTime, p.staleAfterMs), false);
    assert.equal(isStockCheckInGrace(card, p.serverTime, p.staleAfterMs), true);
    assert.deepEqual(unhealthyStockModels(p, p.serverTime + 30_000), [
      card.model,
    ]);
  }
});

void test("heartbeats cannot renew failure grace and recovery clears it", () => {
  const state = new MonitorState("de-de");
  const p = packet();
  p.cards[0]!.status = "blocked";
  p.cards[0]!.observedAt = p.serverTime - 20_000;
  state.accept(p, 0);
  const heartbeat = {
    ...p,
    type: "health" as const,
    sequence: 2,
    serverTime: p.serverTime + 9000,
  };
  state.accept(heartbeat, 9000);
  assert.equal(state.health(9999), "healthy");
  assert.equal(state.health(10_000), "source_degraded");
  state.accept(packet(3, "update"), 10_001);
  assert.equal(state.health(10_001), "healthy");
});

void test("grace is bounded by source freshness and cannot hide unknown, invalid or future results", () => {
  const p = packet();
  const card = p.cards[0]!;
  card.status = "timeout";
  card.observedAt = p.serverTime - 15_000;
  assert.equal(isStockCheckInGrace(card, p.serverTime, 10_000), false);
  for (const patch of [
    { status: "unknown" as const },
    { status: "invalid_response" as const },
    { available: null },
    { observedAt: null },
    { observedAt: p.serverTime + 1 },
  ])
    assert.equal(
      isStockCheckInGrace({ ...card, ...patch }, p.serverTime, 60_000),
      false,
    );
  assert.equal(isStockCheckInGrace(undefined, p.serverTime, 60_000), false);
});

void test("display grace never produces an alert from cached positive stock", () => {
  const state = new MonitorState("de-de");
  state.accept(packet(), 0);
  const p = packet(2, "update", true);
  p.cards.find((c) => c.model === "5090")!.status = "timeout";
  assert.deepEqual(state.accept(p, 1)?.alerts, []);
  assert.equal(state.health(1), "healthy");
  p.sequence++;
  p.cards.find((c) => c.model === "5090")!.status = "healthy";
  assert.deepEqual(state.accept(p, 2)?.alerts, ["5090"]);
});

void test("catalog-only degradation cannot keep stock green after its own freshness deadline", () => {
  const p = packet();
  p.status = "source_degraded";
  p.catalogStatus = "stale";
  p.catalogCheckedAt = null;
  p.cards[0]!.observedAt = p.serverTime - p.staleAfterMs + 1000;
  const state = new MonitorState("de-de");
  state.accept(p, 0);
  assert.equal(state.health(999), "healthy");
  assert.equal(state.health(1000), "source_degraded");
});

void test("a dead, missing or invalid publisher is never masked by healthy stock", () => {
  for (const reason of ["explicit", "expired", "missing", "future"]) {
    const p = packet();
    if (reason === "explicit") p.status = "offline";
    if (reason === "expired")
      p.lastPublisherAt = p.serverTime - p.offlineAfterMs;
    if (reason === "missing") p.lastPublisherAt = null;
    if (reason === "future") p.lastPublisherAt = p.serverTime + 1;
    const state = new MonitorState("de-de");
    state.accept(p, 0);
    assert.equal(state.health(0), "offline", reason);
  }
});

void test("another locale's failures do not degrade this locale's stock checks", () => {
  const p = packet();
  p.globalMetrics = {
    requests: 90,
    valid: 0,
    failed: 90,
    windowRequests: 90,
    windowValid: 0,
    windowFailed: 90,
  };
  const state = new MonitorState("de-de");
  state.accept(p, 0);
  assert.equal(state.health(0), "healthy");
});

void test("fresh in-stock updates still alert with an incomplete catalog", () => {
  const state = new MonitorState("de-de");
  state.accept(packet(), 0);
  const p = packet(2, "update", true);
  p.status = "source_degraded";
  p.catalogStatus = "stale";
  p.catalogCheckedAt = null;
  assert.deepEqual(state.accept(p, 1)?.alerts, ["5090"]);
  assert.equal(state.health(1), "healthy");
  assert.deepEqual(state.accept(p, 2)?.alerts, []);
});

void test("source and subscription identity are validated; synthetic is opt-in", () => {
  assert.throws(() =>
    new MonitorState("de-de").accept(demoPacket("de-de", START), 0),
  );
  assert.ok(
    new MonitorState("de-de", true).accept(demoPacket("de-de", START), 0),
  );
  assert.throws(() => new MonitorState("fr-fr").accept(packet(), 0));
  const malformed = { ...packet(), models: ["5090", "5090"], cards: [] };
  assert.equal(packetSchema.safeParse(malformed).success, false);
  assert.throws(() =>
    new MonitorState("de-de").accept(
      { ...packet(), clients: { total: -1 } },
      0,
    ),
  );
});

void test("last-available timestamps are optional for old servers and never generate alerts", () => {
  const old = packet();
  const wire = {
    ...old,
    cards: old.cards.map(({ lastAvailableAt: _oldTimestamp, ...card }) => card),
  };
  assert.ok(
    packetSchema.parse(wire).cards.every((c) => c.lastAvailableAt === null),
  );
  const state = new MonitorState("de-de");
  assert.deepEqual(state.accept(old, 0)?.alerts, []);
  assert.equal(
    state.packet?.cards[0]?.lastAvailableAt,
    old.cards[0]?.lastAvailableAt,
  );
});

void test("notification memory stays bounded", () => {
  const state = new MonitorState("de-de");
  state.accept(packet(), 0);
  for (let i = 2; i < 400; i++) state.accept(packet(i, "update", true), i);
  assert.equal(state.seen.size, 256);
});

void test("WebSocket URL cannot contain credentials, arbitrary paths or insecure remote transport", () => {
  const url = new URL(subscriptionUrl("wss://monitor.example/v1/ws", "de-de"));
  assert.equal(url.searchParams.get("models"), "5070,5080,5090");
  for (const bad of [
    "ws://monitor.example/v1/ws",
    "https://monitor.example/v1/ws",
    "wss://user:secret@monitor.example/v1/ws",
    "wss://monitor.example/v1/publish",
    "wss://monitor.example/v1/ws?secret=secret",
    "broken",
  ]) {
    assert.throws(
      () => subscriptionUrl(bad, "de-de"),
      (error: Error) => !error.message.includes("secret"),
    );
  }
});

void test("store links reject executable/credential-bearing URLs and unknown time stays unknown", () => {
  const fallback = storeUrl("de-de");
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,test",
    "https://user:password@shop.example/",
    "http://shop.example/",
  ])
    assert.equal(storeUrl("de-de", url), fallback);
  assert.equal(
    storeUrl("de-de", "https://store.nvidia.com/item"),
    "https://store.nvidia.com/item",
  );
  assert.equal(relativeTime(null, START), "Not recorded yet");
  assert.equal(relativeTime(START - 2 * 86400_000, START), "2 days ago");
});
