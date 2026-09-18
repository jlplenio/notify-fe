/** Isolated browser acceptance: fictitious credentials, mocked sockets and Telegram. */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { demoPacket } from "../src/lib/realtime/demo.ts";
import {
  TELEGRAM_KEY,
  LEGACY_TELEGRAM_KEY,
} from "../src/lib/realtime/telegram-settings.ts";

const base = new URL(process.env.FRONTEND_TEST_URL ?? "http://127.0.0.1:3000");
assert.ok(
  ["localhost", "127.0.0.1"].includes(base.hostname) &&
    !base.username &&
    !base.password,
);
const screenshots = process.env.SCREENSHOT_DIR ?? ".test-artifacts";
await mkdir(screenshots, { recursive: true });
const fakeToken = "123456789:OFFLINE_TEST_CREDENTIAL_NEVER_SEND";
const fakeChat = "-100123456789";
const legacy = `https://api.telegram.org/bot${fakeToken}/sendMessage?chat_id=${fakeChat}`;
const settings = {
  version: 1,
  enabled: true,
  token: fakeToken,
  chatId: fakeChat,
  topicId: "",
};
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
});
const errors = [],
  unexpected = [];
let sequence = 10,
  phase = "setup";

async function waitFor(check, label) {
  const end = Date.now() + 12000;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error(label);
}

async function setup(options = {}) {
  const context = await browser.newContext({
    viewport: { width: 1250, height: 950 },
    locale: "en-GB",
  });
  const sent = [],
    sockets = new Set();
  let response = { status: 200, body: { ok: true, result: { message_id: 1 } } };
  let delayed = false,
    release;
  await context.addInitScript(({ blockedStorage }) => {
    window.__testAudio = 0;
    window.__testPopups = 0;
    HTMLMediaElement.prototype.play = function () {
      window.__testAudio++;
      return Promise.resolve();
    };
    window.open = () => {
      window.__testPopups++;
      return null;
    };
    if (blockedStorage)
      for (const key of ["localStorage", "sessionStorage"])
        Object.defineProperty(window, key, {
          get() {
            throw new DOMException("Blocked by test", "SecurityError");
          },
        });
  }, options);
  context.on("page", (page) =>
    page.on("pageerror", (error) => errors.push(error.message)),
  );
  await context.route("**/*", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.origin === base.origin) return route.continue();
    // The dev preview loads this optional asset; keep analytics offline in tests.
    if (url.href === "https://va.vercel-scripts.com/v1/script.debug.js")
      return route.fulfill({
        contentType: "application/javascript",
        body: "",
      });
    if (url.origin === "https://api.telegram.org") {
      assert.equal(url.pathname, `/bot${fakeToken}/sendMessage`);
      assert.equal(url.search, "");
      assert.equal(request.method(), "POST");
      assert.equal(request.headers().referer, undefined);
      assert.equal(request.headers().cookie, undefined);
      const body = new URLSearchParams(request.postData());
      assert.equal(body.get("chat_id"), fakeChat);
      assert.ok(!body.get("text").includes(fakeToken));
      assert.ok(!body.get("text").includes("telegramApiUrl"));
      assert.equal(body.get("link_preview_options"), '{"is_disabled":true}');
      sent.push(body);
      if (delayed)
        await new Promise((resolve) => {
          release = resolve;
        });
      return route
        .fulfill({
          status: response.status,
          contentType: "application/json",
          headers: { "access-control-allow-origin": "*" },
          body: JSON.stringify(response.body),
        })
        .catch(() => {});
    }
    unexpected.push(url.hostname);
    return route.abort();
  });
  await context.routeWebSocket(
    (url) => url.pathname === "/v1/ws",
    (socket) => {
      assert.ok(!socket.url().includes(fakeToken));
      sockets.add(socket);
      socket.onClose(() => sockets.delete(socket));
      socket.onMessage((message) => {
        if (message === "ping") socket.send("pong");
      });
      socket.send(
        JSON.stringify({
          ...demoPacket("de-de", Date.now(), ++sequence),
          synthetic: false,
        }),
      );
    },
  );
  const publish = (available = "5090", extra = {}) => {
    const packet = {
      ...demoPacket("de-de", Date.now(), ++sequence, available),
      type: "update",
      synthetic: false,
      ...extra,
    };
    for (const socket of sockets) socket.send(JSON.stringify(packet));
    return packet;
  };
  const page = await context.newPage();
  await page.goto(new URL("/?region=de-de", base).href);
  await page.getByText("Stock checks active", { exact: true }).waitFor();
  return {
    context,
    page,
    sent,
    sockets,
    publish,
    setResponse: (value) => {
      response = value;
    },
    setDelay: (value) => {
      delayed = value;
      if (!value) release?.();
    },
  };
}
async function open(page) {
  await page
    .getByRole("button", { name: "Telegram settings", exact: true })
    .click();
}
async function enter(page) {
  await page.getByLabel("Bot token", { exact: true }).fill(fakeToken);
  await page.getByLabel("Chat ID or channel", { exact: true }).fill(fakeChat);
  await page.getByLabel("Send Telegram alerts", { exact: true }).check();
}
async function close(page) {
  await page.getByRole("button", { name: "Close Telegram settings" }).click();
}

try {
  phase = "tab-only setup, explicit test and sound-independent live drops";
  const first = await setup(),
    { page } = first;
  await open(page);
  assert.equal(
    await page.getByLabel("Remember on this device").isChecked(),
    false,
  );
  assert.equal(
    await page.getByLabel("Bot token", { exact: true }).getAttribute("type"),
    "password",
  );
  await enter(page);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByText("Telegram alerts enabled.", { exact: true }).waitFor();
  assert.equal(first.sent.length, 0);
  assert.equal(
    await page.evaluate((key) => localStorage.getItem(key), TELEGRAM_KEY),
    null,
  );
  assert.equal(
    JSON.parse(
      await page.evaluate((key) => sessionStorage.getItem(key), TELEGRAM_KEY),
    ).token,
    fakeToken,
  );
  await page.getByRole("button", { name: "Test message", exact: true }).click();
  await page
    .getByText("Telegram accepted the message.", { exact: true })
    .waitFor();
  assert.equal(first.sent.length, 1);
  await close(page);
  await page.getByRole("button", { name: "Sound on", exact: true }).click();
  const drop = first.publish();
  await waitFor(
    () => first.sent.length === 2,
    "Muted alert still sends Telegram",
  );
  assert.equal(await page.evaluate(() => window.__testAudio), 0);
  for (const socket of first.sockets) socket.send(JSON.stringify(drop));
  first.publish("5090", { type: "snapshot" });
  await page.reload();
  await page.getByText("Stock checks active", { exact: true }).waitFor();
  assert.equal(
    first.sent.length,
    2,
    "Retries and reconnect snapshots remain quiet",
  );
  assert.match(
    await page
      .getByRole("button", { name: "Telegram settings", exact: true })
      .innerText(),
    /on/,
  );
  await page.getByRole("switch", { name: "Notify me about RTX 5090" }).click();
  first.publish();
  first.publish("5080");
  await waitFor(
    () => first.sent.length === 3,
    "Selected other card still alerts",
  );
  assert.match(first.sent[2].get("text"), /RTX 5080/);
  const freshTab = await first.context.newPage();
  await freshTab.goto(new URL("/?region=de-de", base).href);
  await freshTab.getByText("Stock checks active", { exact: true }).waitFor();
  assert.match(
    await freshTab
      .getByRole("button", { name: "Telegram settings", exact: true })
      .innerText(),
    /off/,
  );
  await freshTab.close();
  console.log(
    "PASS: default tab storage, explicit test, mute independence, selection and quiet snapshots/retries",
  );

  phase = "remembered settings and cross-tab deduplication";
  await page.getByRole("switch", { name: "Notify me about RTX 5090" }).click();
  await open(page);
  await page.getByLabel("Remember on this device").check();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await close(page);
  assert.equal(
    await page.evaluate((key) => sessionStorage.getItem(key), TELEGRAM_KEY),
    null,
  );
  const second = await first.context.newPage();
  await second.goto(new URL("/?region=de-de", base).href);
  await second.getByText("Stock checks active", { exact: true }).waitFor();
  assert.match(
    await second
      .getByRole("button", { name: "Telegram settings", exact: true })
      .innerText(),
    /on/,
  );
  const before = first.sent.length;
  first.publish();
  await waitFor(
    () => first.sent.length === before + 1,
    "One Telegram send across two tabs",
  );
  await open(page);
  await page.getByRole("button", { name: "Test message", exact: true }).click();
  await page
    .getByText("Telegram accepted the message.", { exact: true })
    .waitFor();
  assert.equal(
    first.sent.length,
    before + 2,
    "Second tab did not duplicate the drop",
  );
  await page.getByRole("button", { name: "Forget", exact: true }).click();
  assert.equal(
    await page.getByLabel("Bot token", { exact: true }).inputValue(),
    "",
  );
  assert.equal(
    await page.evaluate((key) => localStorage.getItem(key), TELEGRAM_KEY),
    null,
  );
  await waitFor(
    async () =>
      /off/.test(
        await second
          .getByRole("button", { name: "Telegram settings", exact: true })
          .innerText(),
      ),
    "Forget disables other remembered tab",
  );
  await first.context.close();
  console.log(
    "PASS: remembered settings, browser-tab deduplication and Forget",
  );

  phase = "legacy credential URL cleanup and explicit import";
  const imported = await setup();
  const credentialLink = new URL("/?region=de-de", base);
  credentialLink.searchParams.set("telegramApiUrl", legacy);
  await imported.page.goto(credentialLink.href);
  await imported.page
    .getByText("Stock checks active", { exact: true })
    .waitFor();
  assert.equal(new URL(imported.page.url()).search, "?region=de-de");
  assert.equal(imported.sent.length, 0);
  await imported.page.evaluate(
    ({ key, value }) => localStorage.setItem(key, value),
    { key: LEGACY_TELEGRAM_KEY, value: legacy },
  );
  await imported.page.reload();
  await open(imported.page);
  await imported.page
    .getByRole("button", { name: "Import old saved settings" })
    .click();
  assert.equal(
    await imported.page.getByLabel("Send Telegram alerts").isChecked(),
    false,
  );
  assert.equal(
    await imported.page.getByLabel("Remember on this device").isChecked(),
    false,
  );
  await imported.page
    .getByRole("button", { name: "Save", exact: true })
    .click();
  assert.equal(imported.sent.length, 0);
  assert.equal(
    await imported.page.evaluate(
      (key) => localStorage.getItem(key),
      LEGACY_TELEGRAM_KEY,
    ),
    null,
  );
  imported.setResponse({
    status: 403,
    body: { ok: false, description: `DO NOT DISPLAY ${fakeToken}` },
  });
  await imported.page
    .getByRole("button", { name: "Test message", exact: true })
    .click();
  await imported.page.getByText(/The bot cannot post here/).waitFor();
  assert.ok(
    !(await imported.page.locator("body").innerText()).includes(fakeToken),
  );
  await imported.context.close();
  console.log(
    "PASS: old URL scrubbed without importing; explicit local import stays disabled; API error is sanitized",
  );

  phase = "unavailable storage and Telegram requests that stall";
  const blocked = await setup({ blockedStorage: true });
  await open(blocked.page);
  await enter(blocked.page);
  await blocked.page.getByRole("button", { name: "Save", exact: true }).click();
  await blocked.page
    .getByText(
      /Telegram works for this visit, but your settings could not be saved/,
    )
    .waitFor();
  await close(blocked.page);
  await blocked.page
    .getByRole("button", { name: "Auto-open off", exact: true })
    .click();
  blocked.setDelay(true);
  blocked.publish();
  await blocked.page.getByTestId("availability-alert").waitFor();
  await waitFor(() => blocked.sent.length === 1, "The mock send has begun");
  assert.equal(await blocked.page.evaluate(() => window.__testAudio), 1);
  assert.equal(await blocked.page.evaluate(() => window.__testPopups), 1);
  await open(blocked.page);
  await blocked.page
    .getByRole("button", { name: "Forget", exact: true })
    .click();
  blocked.setDelay(false);
  assert.match(
    await blocked.page
      .getByRole("button", { name: "Telegram settings", exact: true })
      .innerText(),
    /off/,
  );
  await blocked.context.close();
  console.log(
    "PASS: blocked storage stays usable; a stalled Telegram send cannot delay sound/auto-open; Forget cancels it",
  );

  phase = "demo suppression and mobile/desktop settings";
  const visual = await setup();
  await visual.page.evaluate(
    ({ key, settings }) => localStorage.setItem(key, JSON.stringify(settings)),
    { key: TELEGRAM_KEY, settings },
  );
  await visual.page.goto(new URL("/?demo=1&region=de-de", base).href);
  await visual.page.getByTestId("demo-banner").waitFor();
  await visual.page.clock.install();
  await visual.page.getByRole("button", { name: "Simulate a drop" }).click();
  await visual.page.clock.fastForward(6100);
  await visual.page.getByTestId("availability-alert").waitFor();
  assert.equal(visual.sent.length, 0);
  await visual.page.clock.resume();
  await open(visual.page);
  for (const [width, theme] of [
    [1250, "light"],
    [390, "light"],
    [320, "dark"],
  ]) {
    await visual.page.setViewportSize({ width, height: 900 });
    await visual.page.evaluate(
      (theme) =>
        document.documentElement.classList.toggle("dark", theme === "dark"),
      theme,
    );
    assert.ok(
      await visual.page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await visual.page.screenshot({
      path: resolve(screenshots, `telegram-${width}-${theme}.png`),
      fullPage: true,
      animations: "disabled",
    });
  }
  await visual.page
    .getByRole("dialog")
    .evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
  await visual.page.keyboard.press("Escape");
  await visual.page.getByRole("dialog").waitFor({ state: "detached" });
  assert.equal(
    await visual.page
      .getByRole("button", { name: "Telegram settings", exact: true })
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await visual.context.close();
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);
  console.log(
    "PASS: demo alerts never send Telegram; responsive settings reviewed at 320–1250px",
  );
  console.log(
    "TELEGRAM SMOKE PASS — all Telegram requests and stock packets mocked; no real messages or probes.",
  );
} catch (error) {
  console.error(`TELEGRAM SMOKE FAILED during ${phase}: ${error.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
