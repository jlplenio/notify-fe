import assert from "node:assert/strict";
import test from "node:test";
import { demoPacket } from "./demo.ts";
import { autoOpenDiscoveryStores } from "./actions.ts";
import {
  MonitorState,
  packetSchema,
  type Packet,
  type DiscoveryProduct,
} from "./protocol.ts";
import { readPreferences } from "./preferences.ts";
import { TelegramNotifier } from "./telegram.ts";

const NOW = 1_800_000_000_000;
const ID = "a".repeat(64);
function packet(
  revision = 1,
  type: Packet["type"] = "update",
  available = false,
): Packet {
  const product: DiscoveryProduct = {
    id: ID,
    name: "NVIDIA RTX future variant",
    memory: "24 GB",
    sku: "NEW-SKU",
    firstSeenAt: NOW,
    discoveredRevision: 1,
    availableRevision: available ? revision : 0,
    available: available ? true : null,
    productUrl: "https://store.example/product",
    observedAt: available ? NOW : null,
    status: available ? "healthy" : "queued",
  };
  return {
    ...demoPacket("de-de", NOW, revision + 1),
    type,
    synthetic: false,
    alerts: [],
    discoveries: {
      revision,
      checkedAt: NOW,
      status: "healthy",
      overflow: false,
      products: [product],
    },
    discoveryAlerts: [
      { id: ID, kind: available ? "available" : "discovered", revision },
    ],
  };
}
function baseline(): Packet {
  const value = packet(0, "snapshot");
  value.discoveries!.products = [];
  value.discoveryAlerts = [];
  return value;
}

void test("new-product alerts default on and migrate saved settings without changing fixed cards", () => {
  const old = {
    ...readPreferences(null),
    locale: "de-de",
    models: [],
    soundEnabled: false,
    autoOpen: true,
  };
  const legacy: Partial<typeof old> = { ...old };
  delete legacy.watchNewProducts;
  assert.deepEqual(readPreferences(JSON.stringify(legacy)), {
    ...old,
    watchNewProducts: true,
  });
  assert.equal(
    readPreferences(JSON.stringify({ ...old, watchNewProducts: true }), "fr-fr")
      .watchNewProducts,
    true,
  );
  assert.equal(
    readPreferences(
      JSON.stringify({ ...old, watchNewProducts: false }),
      "fr-fr",
    ).watchNewProducts,
    false,
  );
});

void test("bounded optional discovery validation never interrupts a valid fixed-card update", () => {
  assert.equal(packetSchema.parse(packet()).discoveries?.products.length, 1);
  const group = packet().discoveries!;
  const product = group.products[0]!;
  for (const invalid of [
    {
      ...group,
      products: Array.from({ length: 6 }, (_, i) => ({
        ...product,
        id: i.toString(16).repeat(64),
      })),
    },
    { ...group, products: [product, product] },
    { ...group, products: [{ ...product, status: "healthy" }] },
    { ...group, products: [{ ...product, discoveredRevision: 2 }] },
    { ...group, products: [{ ...product, sku: "bad/path" }] },
    { ...group, products: [{ ...product, productUrl: "javascript:alert(1)" }] },
    { ...group, products: [{ ...product, productUrl: "not a URL" }] },
    {
      ...group,
      products: [
        { ...product, productUrl: "https://user:secret@store.example" },
      ],
    },
    { ...group, revision: Number.MAX_SAFE_INTEGER + 1 },
  ]) {
    const value = packetSchema.parse({ ...packet(), discoveries: invalid });
    assert.equal(value.discoveries, undefined);
    assert.equal(value.cards.length, 3);
  }
  assert.equal(
    packetSchema.parse({
      ...packet(),
      discoveryAlerts: Array(11).fill(packet().discoveryAlerts![0]),
    }).discoveryAlerts,
    undefined,
  );
});

void test("discovery and first positive stock each alert once, without requiring prior out-of-stock", () => {
  const monitor = new MonitorState("de-de");
  monitor.accept(baseline(), 0);
  assert.deepEqual(
    monitor.accept(packet(), 1)?.discoveryAlerts.map((event) => event.kind),
    ["discovered"],
  );
  assert.deepEqual(monitor.accept(packet(), 2)?.discoveryAlerts, []);
  assert.deepEqual(
    monitor
      .accept(packet(2, "update", true), 3)
      ?.discoveryAlerts.map((event) => event.kind),
    ["available"],
  );
  assert.deepEqual(
    monitor.accept({ ...packet(2, "update", true), sequence: 99 }, 4)
      ?.discoveryAlerts,
    [],
  );
});

void test("discovery stock history survives sold-out and reconnect packets without creating alerts", () => {
  const monitor = new MonitorState("de-de");
  monitor.accept(baseline(), 0);
  const positive = packet(2, "update", true);
  positive.discoveries!.products[0]!.lastAvailableAt = NOW;
  assert.equal(monitor.accept(positive, 1)?.discoveryAlerts.length, 1);

  const soldOut = packet(2);
  soldOut.sequence = 4;
  soldOut.serverTime = NOW + 10_000;
  soldOut.lastPublisherAt = soldOut.serverTime;
  Object.assign(soldOut.discoveries!.products[0]!, {
    available: false,
    availableRevision: 2,
    observedAt: soldOut.serverTime,
    lastAvailableAt: NOW,
    status: "healthy",
  });
  soldOut.discoveryAlerts = [];
  const result = monitor.accept(soldOut, 2);
  assert.equal(result?.packet.discoveries?.products[0]?.lastAvailableAt, NOW);
  assert.equal(result?.packet.discoveries?.products[0]?.available, false);
  assert.deepEqual(result?.discoveryAlerts, []);

  const reconnected = new MonitorState("de-de");
  const snapshot = { ...soldOut, type: "snapshot" as const };
  assert.equal(
    reconnected.accept(snapshot, 3)?.packet.discoveries?.products[0]
      ?.lastAvailableAt,
    NOW,
  );
  const historyOnly = { ...soldOut, sequence: 5 };
  historyOnly.discoveries!.products[0]!.lastAvailableAt = NOW - 1000;
  assert.deepEqual(reconnected.accept(historyOnly, 4)?.discoveryAlerts, []);
});

void test("discovery history is optional for old publishers and invalid dates cannot break fixed cards", () => {
  const legacy = packetSchema.parse(packet());
  assert.equal(legacy.discoveries?.products[0]?.lastAvailableAt, undefined);
  for (const stamp of [null, NOW - 86400_000]) {
    const value = packet();
    value.discoveries!.products[0]!.lastAvailableAt = stamp;
    assert.equal(
      packetSchema.parse(value).discoveries?.products[0]?.lastAvailableAt,
      stamp,
    );
  }
  for (const invalid of [-1, Number.NaN, 8_640_000_000_000_001]) {
    const value = packet();
    value.discoveries!.products[0]!.lastAvailableAt = invalid;
    const parsed = packetSchema.parse(value);
    assert.equal(parsed.discoveries, undefined);
    assert.equal(parsed.cards.length, 3);
  }
});

void test("snapshots, reconnects, removal/reappearance and a different country never replay discovery alerts", () => {
  const monitor = new MonitorState("de-de");
  assert.deepEqual(
    monitor.accept(packet(1, "snapshot"), 0)?.discoveryAlerts,
    [],
  );
  assert.deepEqual(monitor.accept(packet(), 1)?.discoveryAlerts, []);
  const removed = packet(2);
  removed.discoveries!.products = [];
  removed.discoveryAlerts = [];
  monitor.accept(removed, 2);
  assert.deepEqual(
    monitor.accept({ ...packet(), sequence: 4 }, 3)?.discoveryAlerts,
    [],
  );
  monitor.beginConnection();
  assert.deepEqual(
    monitor.accept(packet(3, "snapshot", true), 4)?.discoveryAlerts,
    [],
  );
  assert.deepEqual(
    monitor.accept(packet(3, "update", true), 5)?.discoveryAlerts,
    [],
  );
  assert.throws(
    () => monitor.accept({ ...packet(4), locale: "fr-fr" }, 6),
    /Unexpected subscription/,
  );
});

void test("pending events survive health or stale packets and deliver on the next fresh update", () => {
  for (const type of ["health", "stale"] as const) {
    const monitor = new MonitorState("de-de");
    monitor.accept(baseline(), 0);
    const pending = packet(1, type === "health" ? "health" : "update");
    pending.discoveryAlerts = [];
    if (type === "stale") pending.discoveries!.status = "stale";
    assert.deepEqual(monitor.accept(pending, 1)?.discoveryAlerts, []);
    const fresh = { ...packet(), sequence: 3 };
    assert.deepEqual(
      monitor.accept(fresh, 2)?.discoveryAlerts,
      fresh.discoveryAlerts,
    );
    assert.deepEqual(
      monitor.accept({ ...fresh, sequence: 4 }, 3)?.discoveryAlerts,
      [],
    );
  }
});

void test("newer discovery does not consume another product's older pending availability event", () => {
  const monitor = new MonitorState("de-de");
  monitor.accept(baseline(), 0);
  const pending = packet(2, "health", true);
  pending.discoveryAlerts = [];
  monitor.accept(pending, 1);
  const newer = packet(3);
  const second = {
    ...newer.discoveries!.products[0]!,
    id: "b".repeat(64),
    discoveredRevision: 3,
  };
  newer.discoveries!.products = [pending.discoveries!.products[0]!, second];
  newer.discoveryAlerts = [{ id: second.id, kind: "discovered", revision: 3 }];
  assert.deepEqual(
    monitor.accept(newer, 2)?.discoveryAlerts,
    newer.discoveryAlerts,
  );
  const older = {
    ...newer,
    sequence: 5,
    discoveryAlerts: [{ id: ID, kind: "available" as const, revision: 2 }],
  };
  assert.deepEqual(
    monitor.accept(older, 3)?.discoveryAlerts,
    older.discoveryAlerts,
  );
  assert.deepEqual(
    monitor.accept({ ...older, sequence: 6 }, 4)?.discoveryAlerts,
    [],
  );
});

void test("received events stay consumed when muted or removed; reconnect suppresses pending history", () => {
  const monitor = new MonitorState("de-de");
  monitor.accept(baseline(), 0);
  // MonitorState consumes the event before the caller discards it for an off toggle.
  monitor.accept(packet(), 1);
  const removed = packet(2);
  removed.discoveries!.products = [];
  removed.discoveryAlerts = [];
  monitor.accept(removed, 2);
  assert.deepEqual(
    monitor.accept({ ...packet(), sequence: 4 }, 3)?.discoveryAlerts,
    [],
  );
  const pending = packet(3, "health", true);
  pending.sequence = 5;
  pending.discoveryAlerts = [];
  monitor.accept(pending, 4);
  monitor.beginConnection();
  // Even an older snapshot must not replay an event seen as pending before reconnect.
  monitor.accept(packet(2, "snapshot"), 5);
  assert.deepEqual(
    monitor.accept(packet(3, "update", true), 6)?.discoveryAlerts,
    [],
  );
});

void test("health, stale, offline and mismatched discovery events are quiet", () => {
  for (const change of [
    (p: Packet) => {
      p.type = "health";
    },
    (p: Packet) => {
      p.status = "offline";
    },
    (p: Packet) => {
      p.discoveries!.status = "stale";
    },
    (p: Packet) => {
      p.discoveries!.checkedAt = NOW - 90_000;
    },
    (p: Packet) => {
      p.discoveries!.checkedAt = NOW + 1;
    },
    (p: Packet) => {
      p.discoveryAlerts![0]!.revision = 3;
    },
    (p: Packet) => {
      p.discoveryAlerts![0]!.id = "b".repeat(64);
    },
    (p: Packet) => {
      p.discoveries!.products[0]!.observedAt = NOW - 15_001;
    },
    (p: Packet) => {
      p.discoveries!.products[0]!.status = "timeout";
    },
  ]) {
    const monitor = new MonitorState("de-de");
    monitor.accept(baseline(), 0);
    const value = packet(2, "update", true);
    change(value);
    assert.deepEqual(monitor.accept(value, 1)?.discoveryAlerts, []);
  }
});

void test("new listing never auto-opens; live availability honors opt-in and the existing safe redirect", () => {
  const calls: string[][] = [];
  const open = (...args: string[]) => calls.push(args);
  const listed = packet();
  assert.equal(
    autoOpenDiscoveryStores(listed, listed.discoveryAlerts!, true, open),
    0,
  );
  const available = packet(2, "update", true);
  assert.equal(
    autoOpenDiscoveryStores(available, available.discoveryAlerts!, false, open),
    0,
  );
  assert.equal(
    autoOpenDiscoveryStores(
      { ...available, synthetic: true },
      available.discoveryAlerts!,
      true,
      open,
    ),
    0,
  );
  assert.equal(
    autoOpenDiscoveryStores(available, available.discoveryAlerts!, true, open),
    1,
  );
  assert.equal(
    new URL(calls[0]![0]!).searchParams.get("url"),
    "https://store.example/product",
  );
  assert.deepEqual(calls[0]!.slice(1), ["_blank", "noopener,noreferrer"]);
});

void test("Telegram shares its existing delivery gate and deduplicates discovery events across publications", async () => {
  const texts: string[] = [];
  const notifier = new TelegramNotifier({
    request: async (_url, init) => {
      texts.push((init?.body as URLSearchParams).get("text")!);
      return Response.json({ ok: true });
    },
  });
  const settings = {
    version: 1 as const,
    enabled: true,
    token: "123456789:OFFLINE_TEST_CREDENTIAL_NEVER_SEND",
    chatId: "-100123456789",
    topicId: "",
  };
  const signal = new AbortController().signal;
  const listed = packet();
  await notifier.send(settings, listed, [], signal, []);
  assert.equal(texts.length, 0);
  await notifier.send(settings, listed, [], signal, listed.discoveryAlerts);
  await notifier.send(
    settings,
    { ...listed, publicationId: "different-publication" },
    [],
    signal,
    listed.discoveryAlerts,
  );
  assert.equal(texts.length, 1);
  assert.match(texts[0]!, /new listing detected/);
  const available = packet(2, "update", true);
  await notifier.send(
    { ...settings, enabled: false },
    available,
    [],
    signal,
    available.discoveryAlerts,
  );
  await notifier.send(
    settings,
    { ...available, synthetic: true },
    [],
    signal,
    available.discoveryAlerts,
  );
  assert.equal(texts.length, 1);
  await notifier.send(
    settings,
    available,
    [],
    signal,
    available.discoveryAlerts,
  );
  assert.equal(texts.length, 2);
  assert.match(texts[1]!, /spotted in stock/);
});
