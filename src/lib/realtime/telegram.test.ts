import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { demoPacket } from "./demo.ts";
import { LOCALES } from "./catalog.ts";
import { MonitorState, type Packet } from "./protocol.ts";
import {
  EMPTY_TELEGRAM,
  LEGACY_TELEGRAM_KEY,
  TELEGRAM_KEY,
  forgetTelegram,
  importLegacyTelegram,
  persistTelegram,
  restoreTelegram,
  validateTelegram,
  type StorageAccess,
  type TelegramSettings,
} from "./telegram-settings.ts";
import {
  sendTelegram,
  TelegramNotifier,
  telegramAlertModels,
  telegramAlertText,
} from "./telegram.ts";
import {
  credentialCleanupScript,
  stripTelegramCredentials,
} from "./credential-url.ts";

// Deliberately fictitious credentials; every transport below is intercepted.
const settings: TelegramSettings = {
  version: 1,
  enabled: true,
  token: "123456789:OFFLINE_TEST_CREDENTIAL_NEVER_SEND",
  chatId: "-100123456789",
  topicId: "",
};
const NOW = 1_800_000_000_000;
const signal = () => new AbortController().signal;
function live(): Packet {
  return {
    ...demoPacket("de-de", NOW, 2, "5090"),
    type: "update",
    synthetic: false,
  };
}
function memory(): StorageAccess {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}
const legacyUrl = `https://api.telegram.org/bot${settings.token}/sendMessage?chat_id=${settings.chatId}&message_thread_id=12`;
const ok = () => Response.json({ ok: true, result: { message_id: 1 } });

void test("Telegram settings start disabled; tab storage and explicit persistent opt-in never coexist", () => {
  const session = memory(),
    local = memory();
  assert.deepEqual(restoreTelegram(session, local), {
    settings: EMPTY_TELEGRAM,
    remember: false,
  });
  assert.equal(persistTelegram(settings, false, session, local), null);
  assert.equal(local.getItem(TELEGRAM_KEY), null);
  assert.deepEqual(restoreTelegram(session, local), {
    settings,
    remember: false,
  });
  assert.equal(persistTelegram(settings, true, session, local), null);
  assert.equal(session.getItem(TELEGRAM_KEY), null);
  assert.deepEqual(restoreTelegram(memory(), local), {
    settings,
    remember: true,
  });
  local.setItem(LEGACY_TELEGRAM_KEY, legacyUrl);
  assert.equal(persistTelegram(settings, false, session, local), null);
  assert.equal(local.getItem(TELEGRAM_KEY), null);
  assert.equal(local.getItem(LEGACY_TELEGRAM_KEY), null);
  assert.equal(forgetTelegram(session, local), true);
  assert.deepEqual(restoreTelegram(session, local).settings, EMPTY_TELEGRAM);
});

void test("corrupt, hostile and inaccessible saved settings are non-fatal", () => {
  const local = memory();
  local.setItem(TELEGRAM_KEY, "{broken");
  assert.deepEqual(restoreTelegram(null, local).settings, EMPTY_TELEGRAM);
  local.setItem(
    TELEGRAM_KEY,
    JSON.stringify({ ...settings, token: "x/../getUpdates" }),
  );
  assert.deepEqual(restoreTelegram(null, local).settings, EMPTY_TELEGRAM);
  const blocked: StorageAccess = {
    getItem() {
      throw new Error(settings.token);
    },
    setItem() {
      throw new Error(settings.token);
    },
    removeItem() {
      throw new Error(settings.token);
    },
  };
  assert.deepEqual(restoreTelegram(blocked, blocked).settings, EMPTY_TELEGRAM);
  const warning = persistTelegram(settings, false, blocked, blocked);
  assert.ok(warning);
  assert.ok(!warning.includes(settings.token));
  assert.equal(forgetTelegram(blocked, blocked), false);
});

void test("legacy import is disabled and restricted to Telegram sendMessage", () => {
  assert.deepEqual(importLegacyTelegram(legacyUrl), {
    ...settings,
    enabled: false,
    topicId: "12",
  });
  for (const url of [
    legacyUrl.replace("api.telegram.org", "attacker.example"),
    legacyUrl.replace("https:", "http:"),
    legacyUrl.replace("sendMessage", "getUpdates"),
    legacyUrl.replace("api.telegram.org", "api.telegram.org.attacker.example"),
    legacyUrl.replace("https://", "https://user:password@"),
    `${legacyUrl}&chat_id=987654321`,
    `${legacyUrl}#extra`,
  ])
    assert.equal(importLegacyTelegram(url), null);
  assert.ok(validateTelegram({ ...settings, token: legacyUrl }).error);
  assert.ok(validateTelegram({ ...settings, chatId: "../../path" }).error);
  assert.ok(validateTelegram({ ...settings, topicId: "-2" }).error);
  assert.ok(validateTelegram({ ...settings, chatId: "@my_channel" }).settings);
});

void test("old credential links are stripped before hydration and at analytics without importing", () => {
  for (const url of [
    `https://notify-fe.plen.io/?region=de-de&telegramApiUrl=${encodeURIComponent(legacyUrl)}`,
    `https://notify-fe.plen.io/?BotToken=${encodeURIComponent(settings.token)}&region=de-de`,
    `https://notify-fe.plen.io/?region=de-de#telegramApiUrl=${encodeURIComponent(legacyUrl)}`,
  ]) {
    let replaced = "";
    const state = { unchanged: true };
    runInNewContext(credentialCleanupScript, {
      URL,
      URLSearchParams,
      location: { href: url },
      history: {
        state,
        replaceState: (received: unknown, _title: string, target: string) => {
          assert.equal(received, state);
          replaced = target;
        },
      },
    });
    assert.equal(
      new URL(replaced, url).href,
      "https://notify-fe.plen.io/?region=de-de",
    );
    assert.equal(
      stripTelegramCredentials(url),
      "https://notify-fe.plen.io/?region=de-de",
    );
  }
  assert.equal(
    stripTelegramCredentials("https://notify-fe.plen.io/?region=fr-fr#help"),
    "https://notify-fe.plen.io/?region=fr-fr#help",
  );
});

void test("Telegram uses only the fixed HTTPS endpoint and POST body; previews, redirects, cookies and referrers are disabled", async () => {
  const response = await sendTelegram(
    { ...settings, topicId: "12" },
    "RTX 5090 <plain> & literal",
    signal(),
    async (url, init) => {
      assert.equal(
        url,
        `https://api.telegram.org/bot${settings.token}/sendMessage`,
      );
      assert.equal(new URL(String(url)).search, "");
      assert.equal(init?.method, "POST");
      assert.equal(init?.credentials, "omit");
      assert.equal(init?.referrerPolicy, "no-referrer");
      assert.equal(init?.cache, "no-store");
      assert.equal(init?.redirect, "error");
      const body = init?.body as URLSearchParams;
      assert.equal(body.get("chat_id"), settings.chatId);
      assert.equal(body.get("message_thread_id"), "12");
      assert.equal(body.get("text"), "RTX 5090 <plain> & literal");
      assert.equal(body.has("parse_mode"), false);
      assert.equal(body.get("link_preview_options"), '{"is_disabled":true}');
      assert.ok(!body.toString().includes(settings.token));
      return ok();
    },
  );
  assert.equal(response.kind, "sent");
});

void test("only confirmed API success is called sent; raw descriptions and credential-bearing errors are suppressed", async () => {
  for (const [status, data, match] of [
    [200, { ok: false, error_code: 401, description: settings.token }, /token/],
    [403, { ok: false, description: settings.token }, /permission/],
    [400, { ok: false, description: settings.token }, /destination/],
    [500, { ok: true }, /did not confirm/],
  ] as const) {
    const result = await sendTelegram(settings, "test", signal(), async () =>
      Response.json(data, { status }),
    );
    assert.equal(result.kind, "error");
    assert.match(result.message, match);
    assert.ok(!result.message.includes(settings.token));
  }
  const result = await sendTelegram(settings, "test", signal(), async () => {
    throw new Error(legacyUrl);
  });
  assert.equal(result.kind, "error");
  assert.ok(!result.message.includes(settings.token));
  assert.equal(
    (
      await sendTelegram(
        settings,
        "test",
        signal(),
        async () => new Response("not JSON"),
      )
    ).kind,
    "error",
  );
});

void test("a stalled request is bounded; cancelling before sending never calls Telegram", async () => {
  const result = await sendTelegram(
    settings,
    "test",
    signal(),
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new Error("aborted")),
        );
      }),
    10,
  );
  assert.equal(result.kind, "error");
  const cancel = new AbortController();
  cancel.abort();
  assert.equal(
    (
      await sendTelegram(settings, "test", cancel.signal, async () => {
        assert.fail("must not send");
      })
    ).kind,
    "skipped",
  );
});

void test("all regions use generic retailer links or the regional fallback, without any page-URL credentials", () => {
  for (const locale of LOCALES) {
    const packet = { ...live(), locale };
    const card = packet.cards.find((c) => c.model === "5090")!;
    card.productUrl = `https://retailer.example/${locale}/basket?t=test%2Bsigned%3D`;
    const text = telegramAlertText(packet, ["5090"]);
    const link = text.split("RTX 5090: ")[1]!;
    assert.equal(new URL(link).searchParams.get("url"), card.productUrl);
    assert.ok(text.includes(`https://notify-fe.plen.io/?region=${locale}`));
    assert.ok(!text.includes(settings.token));
    card.productUrl = null;
    assert.ok(
      new URL(
        telegramAlertText(packet, ["5090"]).split("RTX 5090: ")[1]!,
      ).searchParams
        .get("url")
        ?.includes(`/${locale}/`),
    );
    card.productUrl = `https://retailer.example/?t=${"+".repeat(1800)}`;
    const long = telegramAlertText(packet, ["5090"]);
    assert.ok(long.length <= 4096);
    assert.ok(
      !long.includes("retailer.example"),
      "Do not truncate a signed URL to fit",
    );
  }
});

void test("only fresh selected real drops can send; source recovery, snapshots and retries respect existing protocol deduplication", async () => {
  let calls = 0;
  const notifier = new TelegramNotifier({
    request: async () => {
      calls++;
      return ok();
    },
  });
  const state = new MonitorState("de-de");
  const baseline = {
    ...live(),
    type: "snapshot" as const,
    alerts: [],
    sequence: 1,
    publicationId: "00000000-0000-4000-8000-000000000001",
  };
  const first = state.accept(baseline, 0)!;
  await notifier.send(settings, first.packet, first.alerts, signal());
  const packet = live();
  for (const value of [
    packet,
    packet,
    { ...packet, type: "health" as const, sequence: 3 },
  ]) {
    const accepted = state.accept(value, 1)!;
    await notifier.send(settings, accepted.packet, accepted.alerts, signal());
  }
  assert.equal(calls, 1);
  for (const value of [
    { ...packet, synthetic: true },
    { ...packet, type: "snapshot" as const },
    { ...packet, status: "offline" as const },
    { ...packet, serverTime: packet.serverTime + 16000 },
  ]) {
    assert.deepEqual(telegramAlertModels(value, ["5090"]), []);
    await notifier.send(settings, value, ["5090"], signal());
  }
  await notifier.send(
    { ...settings, enabled: false },
    packet,
    ["5090"],
    signal(),
  );
  await notifier.send(settings, packet, ["5080"], signal());
  assert.equal(calls, 1);
});

void test("cross-tab claims send one message per destination/model; disjoint selections still get their alerts", async () => {
  const storage = memory();
  let tail = Promise.resolve();
  const lock = <T>(work: () => Promise<T>) => {
    const result = tail.then(work);
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
  const texts: string[] = [];
  const request: typeof fetch = async (_url, init) => {
    texts.push((init?.body as URLSearchParams).get("text")!);
    return ok();
  };
  const a = new TelegramNotifier({ storage, lock, request }),
    b = new TelegramNotifier({ storage, lock, request });
  const packet = live();
  packet.cards.find((c) => c.model === "5080")!.available = true;
  packet.alerts = ["5090", "5080"];
  await Promise.all([
    a.send(settings, packet, ["5090"], signal()),
    b.send(settings, packet, ["5090", "5080"], signal()),
  ]);
  assert.equal(texts.length, 2);
  assert.match(texts[0]!, /RTX 5090 spotted/);
  assert.match(texts[1]!, /RTX 5080 spotted/);
  await b.send(settings, packet, ["5090", "5080"], signal());
  assert.equal(texts.length, 2);
  assert.ok(
    !storage
      .getItem("notify-fe.telegram.receipts.v1")!
      .includes(settings.token),
  );
});

void test("rate-limit retry waits once while fresh; long cooldowns and unknown failures are not blindly retried", async () => {
  let time = NOW,
    calls = 0;
  const notifier = new TelegramNotifier({
    now: () => time,
    wait: async (ms) => {
      time += ms;
    },
    request: async () => {
      calls++;
      return calls === 1
        ? Response.json(
            { ok: false, parameters: { retry_after: 1 } },
            { status: 429 },
          )
        : ok();
    },
  });
  assert.equal(
    (await notifier.send(settings, live(), ["5090"], signal())).kind,
    "sent",
  );
  assert.equal(calls, 2);
  assert.equal(time, NOW + 1000);
  calls = 0;
  const paused = new TelegramNotifier({
    now: () => time,
    request: async () => {
      calls++;
      return Response.json(
        { ok: false, parameters: { retry_after: 60 } },
        { status: 429 },
      );
    },
  });
  await paused.send(settings, live(), ["5090"], signal());
  await paused.send(
    settings,
    { ...live(), publicationId: "next-drop" },
    ["5090"],
    signal(),
  );
  assert.equal(calls, 1);
  let unknown = 0;
  const failing = new TelegramNotifier({
    request: async () => {
      unknown++;
      throw new Error("Unknown delivery");
    },
  });
  await failing.send(settings, live(), ["5090"], signal());
  await failing.send(settings, live(), ["5090"], signal());
  assert.equal(unknown, 1);
});

void test("a queued drop that expires while waiting for another tab never sends stale stock", async () => {
  let time = NOW;
  const notifier = new TelegramNotifier({
    now: () => time,
    lock: async (work) => {
      time += 16000;
      return work();
    },
    request: async () => {
      assert.fail("Expired drop must not send");
    },
  });
  assert.equal(
    (await notifier.send(settings, live(), ["5090"], signal())).kind,
    "skipped",
  );
});
