import assert from "node:assert/strict";
import test from "node:test";
import { autoOpenStores, previewStoreUrl } from "./actions.ts";
import { demoPacket } from "./demo.ts";
import { MonitorState, type Packet } from "./protocol.ts";

const NOW = 1_800_000_000_000;

function live(): Packet {
  return {
    ...demoPacket("de-de", NOW, 2, "5090"),
    type: "update",
    synthetic: false,
  };
}

void test("auto-open is opt-in, selected, live-only by default and quiet on snapshots", () => {
  const packet = live();
  const unexpected = () => {
    assert.fail("Must not open a shop");
  };
  assert.equal(autoOpenStores(packet, ["5090"], false, unexpected), 0);
  assert.equal(autoOpenStores(packet, ["5070"], true, unexpected), 0);
  assert.equal(
    autoOpenStores({ ...packet, synthetic: true }, ["5090"], true, unexpected),
    0,
  );
  assert.equal(
    autoOpenStores({ ...packet, type: "snapshot" }, ["5090"], true, unexpected),
    0,
  );
  assert.equal(
    autoOpenStores(
      { ...packet, status: "offline" },
      ["5090"],
      true,
      unexpected,
    ),
    0,
  );
});

void test("explicit demo auto-open uses only a fixed same-origin test destination", () => {
  const packet = { ...live(), synthetic: true };
  packet.cards.find((c) => c.model === "5090")!.productUrl =
    "https://store.example/never-open";
  const calls: string[][] = [];
  assert.equal(
    autoOpenStores(
      packet,
      ["5090", "5090"],
      true,
      (...args) => calls.push(args),
      true,
    ),
    1,
  );
  assert.deepEqual(calls, [
    [
      "/auto-open-preview?region=de-de&model=5090",
      "_blank",
      "noopener,noreferrer",
    ],
  ]);
  assert.equal(
    previewStoreUrl("en-gb", "5080"),
    "/auto-open-preview?region=en-gb&model=5080",
  );
});

void test("demo auto-open cannot leak into live, disabled, unselected or stale alerts", () => {
  const unexpected = () => assert.fail("No test tab expected");
  const packet = { ...live(), synthetic: true };
  assert.equal(autoOpenStores(live(), ["5090"], true, unexpected, true), 0);
  assert.equal(autoOpenStores(packet, ["5090"], false, unexpected, true), 0);
  assert.equal(autoOpenStores(packet, ["5070"], true, unexpected, true), 0);
  assert.equal(
    autoOpenStores(
      { ...packet, type: "snapshot" },
      ["5090"],
      true,
      unexpected,
      true,
    ),
    0,
  );
  assert.equal(
    autoOpenStores(
      { ...packet, status: "offline" },
      ["5090"],
      true,
      unexpected,
      true,
    ),
    0,
  );
  packet.cards.find((c) => c.model === "5090")!.observedAt = NOW - 20_000;
  assert.equal(autoOpenStores(packet, ["5090"], true, unexpected, true), 0);
});

void test("synthetic retries and reconnect snapshots cannot duplicate test tabs", () => {
  const state = new MonitorState("de-de", true);
  state.accept(demoPacket("de-de", NOW - 1000, 1), 0);
  const packet = { ...live(), synthetic: true };
  let opened = 0;
  const apply = (input: Packet) => {
    const result = state.accept(input, 1000);
    if (result)
      autoOpenStores(
        result.packet,
        result.alerts,
        true,
        () => {
          opened++;
        },
        true,
      );
  };
  apply(packet);
  apply({ ...packet, sequence: 3 });
  state.beginConnection();
  apply({ ...packet, type: "snapshot", alerts: [] });
  apply(packet);
  assert.equal(opened, 1);
});

void test("auto-open safely deduplicates destinations and tolerates popup blocking", () => {
  const packet = live();
  const calls: string[][] = [];
  assert.equal(
    autoOpenStores(packet, ["5090", "5090"], true, (...args) => {
      calls.push(args);
      return null;
    }),
    1,
  );
  assert.match(calls[0]![0]!, /^https:\/\/marketplace\.nvidia\.com\/de-de\//);
  assert.deepEqual(calls[0]!.slice(1), ["_blank", "noopener,noreferrer"]);
  assert.equal(
    autoOpenStores(packet, ["5090"], true, () => {
      throw new Error("Blocked");
    }),
    1,
  );
});

void test("bad, future or stale card observations cannot auto-open", () => {
  for (const changes of [
    { status: "blocked" as const },
    { observedAt: 1 },
    { observedAt: NOW + 1 },
    { available: false },
    { observedAt: null },
  ]) {
    const packet = live();
    Object.assign(packet.cards.find((c) => c.model === "5090")!, changes);
    assert.equal(
      autoOpenStores(packet, ["5090"], true, () =>
        assert.fail("No fresh stock"),
      ),
      0,
    );
  }
});

void test("only validated HTTPS links are opened, with no executable destination", () => {
  const packet = live();
  packet.cards.find((c) => c.model === "5090")!.productUrl =
    "javascript:alert(1)";
  let destination = "";
  autoOpenStores(packet, ["5090"], true, (url) => {
    destination = url;
  });
  assert.ok(destination.startsWith("https://marketplace.nvidia.com/"));
});

void test("protocol deduplication prevents tabs on retries or reconnect snapshots", () => {
  const state = new MonitorState("de-de");
  state.accept({ ...demoPacket("de-de", NOW - 1000, 1), synthetic: false }, 0);
  const packet = live();
  let opened = 0;
  const apply = (input: Packet) => {
    const result = state.accept(input, 1000);
    if (result)
      autoOpenStores(result.packet, result.alerts, true, () => {
        opened++;
      });
  };
  apply(packet);
  apply({ ...packet, sequence: 3 });
  state.beginConnection();
  apply({ ...packet, type: "snapshot", alerts: [] });
  apply(packet);
  assert.equal(opened, 1);
});
