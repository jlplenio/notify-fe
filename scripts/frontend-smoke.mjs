/** Local UI acceptance. Browser sockets are mocked; no cloud or source probes. */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { demoPacket } from "../src/lib/realtime/demo.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const base = new URL(process.env.FRONTEND_TEST_URL ?? "http://127.0.0.1:3000");
assert.ok(
  ["localhost", "127.0.0.1"].includes(base.hostname) &&
    !base.username &&
    !base.password,
  "Local frontend only",
);
const screenshots =
  process.env.SCREENSHOT_DIR ?? resolve(root, ".test-artifacts");
await mkdir(screenshots, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ["--autoplay-policy=document-user-activation-required"],
  executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
});
let phase = "setup";
const errors = [],
  unexpectedRequests = [];
let totalConnections = 0,
  sequence = 10,
  pings = 0;
const sockets = new Map(),
  latest = new Map();

async function waitFor(check, message) {
  const end = Date.now() + 15_000;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(message);
}

async function setup(context, blockedStorage = false, realAudio = false) {
  await context.addInitScript(
    ({ blockedStorage, realAudio }) => {
      window.__testAudioPlays = 0;
      window.__testAudioRates = [];
      window.__testOpened = [];
      window.open = (...args) => {
        window.__testOpened.push(args);
        return null;
      };
      const nativePlay = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        window.__testAudioPlays++;
        window.__testAudioRates.push(this.playbackRate);
        if (realAudio) return nativePlay.call(this);
        if (window.__testRejectAudio)
          return Promise.reject(
            new DOMException("Blocked by test policy", "NotAllowedError"),
          );
        return Promise.resolve();
      };
      if (blockedStorage)
        Object.defineProperty(window, "localStorage", {
          get() {
            throw new DOMException("Test storage unavailable", "SecurityError");
          },
        });
    },
    { blockedStorage, realAudio },
  );
  context.on("page", (page) =>
    page.on("pageerror", (error) => errors.push(error.message)),
  );
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin === base.origin) return route.continue();
    unexpectedRequests.push(url.hostname);
    return route.abort();
  });
  await context.routeWebSocket(
    (url) => url.pathname === "/v1/ws",
    (socket) => {
      const locale = new URL(socket.url()).searchParams.get("locale");
      assert.equal(
        new URL(socket.url()).searchParams.get("models"),
        "5070,5080,5090",
      );
      sockets.set(socket, locale);
      totalConnections++;
      socket.onClose(() => sockets.delete(socket));
      socket.onMessage((message) => {
        assert.equal(message, "ping");
        pings++;
        socket.send("pong");
      });
      const snapshot =
        latest.get(locale) ?? demoPacket(locale, Date.now(), ++sequence);
      socket.send(
        JSON.stringify({ ...snapshot, type: "snapshot", alerts: [] }),
      );
    },
  );
}

function publish(locale, available = null, type = "update", synthetic = true) {
  const packet = {
    ...demoPacket(locale, Date.now(), ++sequence, available),
    type,
    synthetic,
  };
  latest.set(locale, packet);
  for (const [socket, subscribed] of sockets)
    if (subscribed === locale) socket.send(JSON.stringify(packet));
  return packet;
}

try {
  phase = "safe legacy redirect";
  const legacy = new URL("/marketplace.nvidia.comm", base);
  legacy.searchParams.set("target", "javascript:alert(1)");
  assert.equal((await fetch(legacy, { redirect: "manual" })).status, 404);
  legacy.searchParams.set("target", "https://store.nvidia.com/item");
  const redirect = await fetch(legacy, { redirect: "manual" });
  assert.equal(redirect.status, 307);
  assert.equal(
    redirect.headers.get("location"),
    "https://store.nvidia.com/item",
  );
  console.log(
    "PASS: unsafe legacy redirect rejected; valid NVIDIA link preserved without following it",
  );

  const context = await browser.newContext({
    viewport: { width: 1365, height: 1000 },
    locale: "en-GB",
    colorScheme: "light",
  });
  await setup(context);
  const page = await context.newPage();
  phase = "initial defaults and full locale snapshot";
  await page.goto(new URL("/?region=de-de", base).href);
  await page
    .getByTestId("monitor-health")
    .getByText("Preview monitor is healthy", { exact: true })
    .waitFor();
  assert.equal(await page.getByRole("switch").count(), 3);
  for (const model of ["5090", "5080", "5070"])
    assert.equal(
      await page
        .getByRole("switch", { name: `Notify me about RTX ${model}` })
        .getAttribute("aria-checked"),
      "true",
    );
  assert.equal(await page.locator("#locale option").count(), 13);
  assert.equal(await page.locator('#locale option[value="en-in"]').count(), 0);
  assert.match(await page.getByTestId("last-seen-5090").innerText(), /3h ago/);
  assert.equal(await page.getByTestId("availability-alert").count(), 0);
  assert.equal(
    await page
      .getByRole("button", { name: "Sound on", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(
    await page
      .getByText(/Last successful check|Last reported check|Next health update/)
      .count(),
    0,
  );
  await page
    .getByText(
      "Stock-check target: every 10s. Alerts pushed as soon as detected.",
    )
    .waitFor();
  const rows = await Promise.all(
    ["5090", "5080", "5070"].map((m) =>
      page.getByTestId(`card-${m}`).boundingBox(),
    ),
  );
  assert.ok(rows.every((row) => row.width > 700 && row.height < 125));
  assert.ok(rows[0].y < rows[1].y && rows[1].y < rows[2].y);
  assert.ok(
    (await page.getByTestId("connection-counts").boundingBox()).y < rows[0].y,
  );
  assert.ok(
    await page
      .getByTestId("region-selector")
      .evaluate(
        (el) =>
          parseFloat(getComputedStyle(el).borderWidth) > 0 &&
          el.getBoundingClientRect().height >= 44,
      ),
  );
  console.log(
    "PASS: 13 locales, exactly three 50-series cards, all selected by default, history visible, quiet initial snapshot",
  );

  phase = "persistent choices without a socket reconnect";
  await waitFor(() => sockets.size === 1, "Expected one active subscription");
  const connectionBaseline = totalConnections;
  await page.getByRole("switch", { name: "Notify me about RTX 5090" }).click();
  assert.equal(totalConnections, connectionBaseline);
  await page.goto(base.href);
  await page.waitForFunction(
    () => document.querySelector("#locale").value === "de-de",
  );
  assert.equal(
    await page
      .getByRole("switch", { name: "Notify me about RTX 5090" })
      .getAttribute("aria-checked"),
    "false",
  );
  await page
    .getByTestId("monitor-health")
    .getByText("Preview monitor is healthy", { exact: true })
    .waitFor();
  publish("de-de", "5090");
  await page
    .getByTestId("stock-5090")
    .getByText("In stock", { exact: true })
    .waitFor();
  assert.equal(
    await page.getByRole("link", { name: "Shop RTX 5090" }).count(),
    1,
  );
  assert.equal(await page.getByTestId("availability-alert").count(), 0);
  assert.equal(await page.evaluate(() => window.__testAudioPlays), 0);
  console.log(
    "PASS: preferences survive a return visit; deselected cards stay visible but do not alert",
  );

  phase = "default sound and exactly-once notification";
  await page.getByRole("button", { name: "Test sound", exact: true }).click();
  await page.getByRole("button", { name: "Sound on", exact: true }).waitFor();
  await page.getByRole("switch", { name: "Notify me about RTX 5090" }).click();
  assert.equal(await page.getByTestId("availability-alert").count(), 0);
  publish("de-de");
  await page
    .getByTestId("stock-5090")
    .getByText("Out of stock", { exact: true })
    .waitFor();
  const alert = publish("de-de", "5090");
  await page.getByTestId("availability-alert").waitFor();
  assert.match(
    await page.getByTestId("availability-alert").innerText(),
    /Test alert/,
  );
  await waitFor(
    async () => (await page.evaluate(() => window.__testAudioPlays)) === 2,
    "One test sound plus one alert sound expected",
  );
  assert.deepEqual(
    await page.evaluate(() => window.__testAudioRates),
    [0.7, 0.7],
  );
  await page
    .getByRole("button", { name: "Dismiss availability alert" })
    .click();
  for (const [socket, locale] of sockets)
    if (locale === "de-de")
      socket.send(JSON.stringify({ ...alert, sequence: ++sequence }));
  assert.equal(await page.getByTestId("availability-alert").count(), 0);
  console.log(
    "PASS: default-on audio at the original 0.7x speed, fresh selected alert, and immutable-ID retry deduplication",
  );

  phase = "automatic reconnect while a card is available";
  const beforeReconnect = totalConnections;
  for (const socket of sockets.keys())
    socket.close({ code: 4001, reason: "Synthetic interruption" });
  await waitFor(
    () => totalConnections > beforeReconnect,
    "Expected automatic reconnect",
  );
  await page
    .getByTestId("monitor-health")
    .getByText("Preview monitor is healthy", { exact: true })
    .waitFor();
  assert.equal(await page.getByTestId("availability-alert").count(), 0);
  assert.equal(await page.evaluate(() => window.__testAudioPlays), 2);
  console.log(
    "PASS: interrupted transport reconnects quietly, without another sound",
  );

  phase = "source silence despite healthy transport pong";
  await page.clock.install();
  publish("de-de", null, "health");
  await page
    .getByTestId("stock-5090")
    .getByText("Out of stock", { exact: true })
    .waitFor();
  await page.clock.fastForward(46_000);
  await page
    .getByTestId("monitor-health")
    .getByText("Waiting for a fresh heartbeat", { exact: true })
    .waitFor();
  await waitFor(
    () => pings > 0,
    "Expected application ping and automatic pong",
  );
  await page.clock.fastForward(31_000);
  await page
    .getByTestId("monitor-health")
    .getByText("The monitor is offline", { exact: true })
    .waitFor();
  await page
    .getByTestId("stock-5090")
    .getByText("Unconfirmed", { exact: true })
    .waitFor();
  console.log(
    "PASS: pong does not fake source health; silent source becomes offline and stock unconfirmed",
  );
  await context.close();

  phase = "saved auto-open, default sound, and quiet reconnects";
  latest.clear();
  const actionsContext = await browser.newContext({ locale: "en-GB" });
  await setup(actionsContext);
  const actionPage = await actionsContext.newPage();
  await actionPage.goto(new URL("/?region=de-de", base).href);
  await actionPage
    .getByText("Preview monitor is healthy", { exact: true })
    .waitFor();
  publish("de-de", "5090", "update", false);
  await actionPage.getByTestId("availability-alert").waitFor();
  assert.equal(
    await actionPage.evaluate(() => window.__testAudioPlays),
    1,
    "Sound defaults on without a separate enable step",
  );
  assert.equal(await actionPage.evaluate(() => window.__testOpened.length), 0);
  await actionPage
    .getByRole("button", { name: "Auto-open off", exact: true })
    .click();
  publish("de-de", null, "update", false);
  const opening = publish("de-de", "5090", "update", false);
  await waitFor(
    async () =>
      (await actionPage.evaluate(() => window.__testOpened.length)) === 1,
    "One automatic store tab expected",
  );
  assert.equal(
    await actionPage.evaluate(() => window.__testOpened[0][2]),
    "noopener,noreferrer",
  );
  for (const [socket, locale] of sockets)
    if (locale === "de-de")
      socket.send(JSON.stringify({ ...opening, sequence: ++sequence }));
  await actionPage
    .getByRole("button", { name: "Dismiss availability alert" })
    .click();
  assert.equal(await actionPage.evaluate(() => window.__testOpened.length), 1);
  await actionPage.reload();
  await actionPage
    .getByText("Monitoring is healthy", { exact: true })
    .waitFor();
  assert.equal(
    await actionPage
      .getByRole("button", { name: "Auto-open on", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(
    await actionPage.evaluate(() => window.__testOpened.length),
    0,
    "Snapshot must not open another shop",
  );
  await actionPage
    .getByRole("button", { name: "Sound on", exact: true })
    .click();
  await actionPage.reload();
  await actionPage
    .getByRole("button", { name: "Sound off", exact: true })
    .waitFor();
  await actionPage
    .getByText("Monitoring is healthy", { exact: true })
    .waitFor();
  publish("de-de", null, "update", false);
  publish("de-de", "5090", "update", false);
  await waitFor(
    async () =>
      (await actionPage.evaluate(() => window.__testOpened.length)) === 1,
    "Auto-open operates independently of mute",
  );
  assert.equal(await actionPage.evaluate(() => window.__testAudioPlays), 0);
  await actionPage
    .getByRole("switch", { name: "Notify me about RTX 5090" })
    .click();
  publish("de-de", null, "update", false);
  publish("de-de", "5090", "update", false);
  await actionPage
    .getByRole("button", { name: "Auto-open on", exact: true })
    .click();
  publish("de-de", "5080", "update", false);
  await actionPage
    .getByTestId("stock-5080")
    .getByText("In stock", { exact: true })
    .waitFor();
  assert.equal(
    await actionPage.evaluate(() => window.__testOpened.length),
    1,
    "Deselected or auto-open-disabled cards must not open tabs",
  );
  await actionsContext.close();
  console.log(
    "PASS: auto-open/mute persist independently; selected live updates open once, never on snapshots or retries (window.open intercepted)",
  );

  phase = "actual Chromium playback and user-activated 0.7x audio";
  latest.clear();
  const audioContext = await browser.newContext();
  await setup(audioContext, false, true);
  const audioPage = await audioContext.newPage();
  await audioPage.goto(new URL("/?region=de-de", base).href);
  await audioPage
    .getByText("Preview monitor is healthy", { exact: true })
    .waitFor();
  publish("de-de", "5090");
  await audioPage
    .getByText(
      /^(Browser blocked audio — test to retry|Audio ready in this tab)$/,
    )
    .waitFor();
  await audioPage
    .getByRole("button", { name: "Test sound", exact: true })
    .click();
  await audioPage
    .getByText("Audio ready in this tab", { exact: true })
    .waitFor();
  assert.deepEqual(
    await audioPage.evaluate(() => window.__testAudioRates),
    [0.7, 0.7],
  );
  await audioContext.close();
  console.log(
    "PASS: real Chromium plays the actual local MP3 at 0.7x and reports its playback permission outcome",
  );

  phase = "explicit playback-denial fallback";
  latest.clear();
  const deniedContext = await browser.newContext();
  await setup(deniedContext);
  const deniedPage = await deniedContext.newPage();
  await deniedPage.goto(new URL("/?region=de-de", base).href);
  await deniedPage
    .getByText("Preview monitor is healthy", { exact: true })
    .waitFor();
  await deniedPage.evaluate(() => {
    window.__testRejectAudio = true;
  });
  publish("de-de", "5090");
  await deniedPage
    .getByText("Browser blocked audio — test to retry", { exact: true })
    .waitFor();
  await deniedPage.getByTestId("availability-alert").waitFor();
  await deniedPage.evaluate(() => {
    window.__testRejectAudio = false;
  });
  await deniedPage
    .getByRole("button", { name: "Test sound", exact: true })
    .click();
  await deniedPage
    .getByText("Audio ready in this tab", { exact: true })
    .waitFor();
  await deniedContext.close();
  console.log(
    "PASS: injected NotAllowedError keeps the visual alert and offers a working sound retry",
  );

  phase = "demo isolation and responsive visual review";
  latest.clear();
  const preview = await browser.newContext({
    viewport: { width: 1365, height: 1080 },
    locale: "en-GB",
    colorScheme: "light",
  });
  await setup(preview);
  const visual = await preview.newPage();
  const beforeDemo = totalConnections;
  await visual.goto(new URL("/?demo=1&region=de-de", base).href);
  await visual
    .getByTestId("demo-banner")
    .getByText("Preview mode", { exact: true })
    .waitFor();
  await visual
    .getByTestId("last-seen-5090")
    .getByText("3h ago", { exact: true })
    .waitFor();
  assert.equal(
    totalConnections,
    beforeDemo,
    "Demo must not open a backend socket",
  );
  await visual.screenshot({
    path: resolve(screenshots, "frontend-desktop-light.png"),
    fullPage: true,
    animations: "disabled",
  });
  await visual.getByRole("button", { name: "Toggle theme" }).click();
  await visual.getByRole("menuitem", { name: "Dark", exact: true }).click();
  await visual.waitForFunction(() =>
    document.documentElement.classList.contains("dark"),
  );
  await visual.screenshot({
    path: resolve(screenshots, "frontend-desktop-dark.png"),
    fullPage: true,
    animations: "disabled",
  });
  await visual.setViewportSize({ width: 390, height: 844 });
  await visual.screenshot({
    path: resolve(screenshots, "frontend-mobile-dark.png"),
    fullPage: true,
    animations: "disabled",
  });
  for (const width of [320, 390, 768, 1365]) {
    await visual.setViewportSize({ width, height: 900 });
    assert.ok(
      await visual.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      `No horizontal overflow at ${width}px`,
    );
  }
  await visual
    .getByRole("button", { name: "Auto-open off", exact: true })
    .click();
  await visual.getByRole("button", { name: "Simulate a drop" }).click();
  await visual.getByTestId("availability-alert").waitFor();
  assert.match(
    await visual.getByTestId("availability-alert").innerText(),
    /Test alert/,
  );
  assert.equal(
    await visual.evaluate(() => window.__testOpened.length),
    0,
    "Sample drops must never open a real shop",
  );
  console.log(
    "PASS: clearly labelled, server-free demo; light/dark themes and 320–1365px layouts",
  );
  await preview.close();

  phase = "blocked storage and unsupported locale";
  const locked = await browser.newContext({ locale: "en-GB" });
  await setup(locked, true);
  const lockedPage = await locked.newPage();
  await lockedPage.goto(new URL("/?region=en-in", base).href);
  await lockedPage
    .getByText(
      "Settings can’t be saved in this browser. They’ll reset next visit.",
    )
    .waitFor();
  assert.equal(await lockedPage.locator("#locale").inputValue(), "en-gb");
  await lockedPage
    .getByRole("switch", { name: "Notify me about RTX 5090" })
    .click();
  assert.equal(
    await lockedPage
      .getByRole("switch", { name: "Notify me about RTX 5090" })
      .getAttribute("aria-checked"),
    "false",
  );
  await lockedPage.locator("#locale").selectOption("de-de");
  await lockedPage.waitForURL(
    (url) => url.searchParams.get("region") === "de-de",
  );
  assert.equal(
    await lockedPage
      .getByRole("switch", { name: "Notify me about RTX 5090" })
      .getAttribute("aria-checked"),
    "false",
    "Changing region must retain this visit's choices even without localStorage",
  );
  await locked.close();
  assert.deepEqual(errors, []);
  assert.deepEqual(
    unexpectedRequests,
    [],
    "No NVIDIA, SKU blob, analytics, proxy or Telegram browser requests",
  );
  console.log(
    "PASS: blocked storage is non-fatal; no browser JS errors or external requests",
  );
  console.log(
    "FRONTEND SMOKE PASS — mocked loopback transport only; screenshots saved for review.",
  );
} catch (error) {
  console.error(`FRONTEND SMOKE FAILED during ${phase}: ${error.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
