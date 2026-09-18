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

async function closeCatalogInfo(page) {
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "detached" });
}

async function setup(
  context,
  blockedStorage = false,
  realAudio = false,
  realPopups = false,
) {
  await context.addInitScript(
    ({ blockedStorage, realAudio, realPopups }) => {
      window.__testAudioPlays = 0;
      window.__testAudioRates = [];
      window.__testOpened = [];
      window.__testOpenActivation = [];
      const nativeOpen = window.open.bind(window);
      window.open = (...args) => {
        window.__testOpened.push(args);
        window.__testOpenActivation.push(navigator.userActivation.isActive);
        if (realPopups) {
          const target = new URL(args[0], location.href);
          if (
            target.origin !== location.origin ||
            target.pathname !== "/auto-open-preview"
          )
            throw new Error(
              "Only same-origin demo tabs are allowed in this test",
            );
          return nativeOpen(...args);
        }
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
    { blockedStorage, realAudio, realPopups },
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
  // The local demo never opens a monitor socket. Playwright's WebSocket-routing
  // shim can renew user activation while forwarding Next's HMR messages, which
  // would artificially allow a popup. Use native sockets for real-policy tests.
  if (realPopups) return;
  await context.routeWebSocket(
    (url) => url.pathname === "/v1/ws",
    (socket) => {
      const locale = new URL(socket.url()).searchParams.get("locale");
      assert.equal(
        new URL(socket.url()).searchParams.get("models"),
        "5070,5080,5090",
      );
      assert.equal(new URL(socket.url()).searchParams.get("client"), "website");
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
  return deliver(packet);
}

function deliver(packet) {
  latest.set(packet.locale, packet);
  for (const [socket, subscribed] of sockets)
    if (subscribed === packet.locale) socket.send(JSON.stringify(packet));
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
    .getByText("Stock checks active", { exact: true })
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
  assert.equal(
    await page.getByText("10s check target", { exact: true }).count(),
    0,
  );
  await page
    .getByTestId("last-heartbeat")
    .getByText(/^Last heartbeat ·/)
    .waitFor();
  assert.equal(
    await page
      .getByText("Independent. Not affiliated with NVIDIA.", { exact: true })
      .count(),
    0,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Alert settings", exact: true })
      .count(),
    0,
  );
  const support = page.getByTestId("support-banner");
  await support
    .getByRole("heading", { name: "Got your card?", exact: true })
    .waitFor();
  assert.match(await support.innerText(), /card \+ country/);
  assert.match(await support.innerText(), /servers running/);
  const supportLink = support.getByRole("link", {
    name: "Say thanks on Ko-fi",
  });
  assert.equal(
    await supportLink.getAttribute("href"),
    "https://ko-fi.com/timesaved",
  );
  assert.equal(await supportLink.getAttribute("rel"), "noopener noreferrer");
  const rows = await Promise.all(
    ["5090", "5080", "5070"].map((m) =>
      page.getByTestId(`card-${m}`).boundingBox(),
    ),
  );
  assert.ok(rows.every((row) => row.width > 700 && row.height <= 90));
  const settingsBox = await page.getByTestId("alert-settings").boundingBox();
  assert.ok(
    settingsBox.y + settingsBox.height < rows[0].y && settingsBox.height < 90,
    "Alert controls are a compact toolbar above the rows, not a sidebar",
  );
  assert.ok(
    rows[2].y + rows[2].height < 670,
    "All cards fit in a short desktop view",
  );
  assert.ok(
    await page
      .getByTestId("stock-5090")
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize) >= 14),
  );
  assert.ok(
    await page
      .getByTestId("card-5090")
      .locator("time")
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize) >= 12),
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Auto-open off", exact: true })
      .count(),
    1,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Auto-open off", exact: true })
      .getAttribute("aria-pressed"),
    "false",
  );
  await page.getByRole("slider", { name: "Alert volume" }).focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(await page.locator("#volume").inputValue(), "0.55");
  assert.equal(
    await page.getByText("Connected tabs", { exact: true }).count(),
    0,
  );
  await page.getByText("Total listeners", { exact: true }).waitFor();
  assert.equal(
    await page.getByTestId("listeners-de-de").getAttribute("data-selected"),
    "true",
  );
  assert.equal(
    await page.getByTestId("connection-counts").locator("li").count(),
    13,
  );
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

  phase = "stock health independent of catalog completeness and other locales";
  assert.equal(await page.getByTestId("catalog-info").count(), 0);
  const incomplete = () => {
    const packet = demoPacket("de-de", Date.now(), ++sequence);
    return {
      ...packet,
      type: "health",
      status: "source_degraded",
      catalogStatus: "stale",
      catalogCheckedAt: null,
      catalogResult: { checkedAt: packet.serverTime, models: ["5090"] },
    };
  };
  const legacyPartial = incomplete();
  delete legacyPartial.catalogResult;
  deliver(legacyPartial);
  await page.getByTestId("catalog-info").waitFor();
  for (const model of ["5070", "5080", "5090"])
    assert.equal(await page.getByTestId(`catalog-info-${model}`).count(), 0);
  await page.getByTestId("catalog-info").focus();
  await page.keyboard.press("Enter");
  await page
    .getByRole("dialog", { name: "About SKU verification" })
    .getByText(/details about individual catalog omissions are not available/)
    .waitFor();
  await closeCatalogInfo(page);
  await waitFor(
    () =>
      page
        .getByTestId("catalog-info")
        .evaluate((el) => el === document.activeElement),
    "Closing catalog info restores focus to its trigger",
  );
  deliver(incomplete());
  await page.getByTestId("catalog-info-5080").waitFor();
  assert.equal(await page.getByTestId("catalog-info-5070").count(), 1);
  assert.equal(await page.getByTestId("catalog-info-5090").count(), 0);
  assert.equal(
    await page.getByTestId("catalog-notice").count(),
    0,
    "No persistent catalog banner",
  );
  assert.equal(await page.getByRole("dialog").count(), 0);
  await page.getByTestId("catalog-info").click();
  await page
    .getByRole("dialog", { name: "About SKU verification" })
    .getByText(/catalog response omitted some cards/)
    .waitFor();
  await closeCatalogInfo(page);
  await page
    .getByTestId("monitor-health")
    .getByText("Stock checks active", { exact: true })
    .waitFor();
  assert.equal(
    await page.getByTestId("monitor-health").getAttribute("data-tone"),
    "healthy",
  );
  assert.equal(
    await page.getByTestId("catalog-info").getAttribute("data-tone"),
    "muted",
  );
  assert.equal(
    await page.getByText("Some checks are delayed", { exact: true }).count(),
    0,
  );
  for (const model of ["5090", "5080", "5070"])
    assert.equal(
      await page.getByTestId(`stock-${model}`).innerText(),
      "Out of stock",
    );
  await page.screenshot({
    path: resolve(screenshots, "catalog-partial-desktop-light.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.getByTestId("catalog-info-5080").click();
  await page
    .getByRole("dialog", { name: "SKU information for RTX 5080" })
    .getByText(/did not list this card/)
    .waitFor();
  await page.screenshot({
    path: resolve(screenshots, "catalog-card-popover-desktop.png"),
    animations: "disabled",
  });
  await closeCatalogInfo(page);
  await page.getByRole("button", { name: "Toggle theme" }).click();
  await page.getByRole("menuitem", { name: "Dark", exact: true }).click();
  await page.waitForFunction(() =>
    document.documentElement.classList.contains("dark"),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: resolve(screenshots, "catalog-partial-mobile-dark.png"),
    fullPage: true,
    animations: "disabled",
  });
  for (const width of [320, 390, 600, 601, 1365]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Catalog controls fit ${width}px`,
    );
    const info = await page.getByTestId("catalog-info-5080").boundingBox();
    const stock = await page.getByTestId("stock-5080").boundingBox();
    assert.ok(
      info.x + info.width <= stock.x,
      `Card info does not overlap stock at ${width}px`,
    );
    await page.getByTestId("catalog-info-5080").click();
    const popup = page.getByRole("dialog", {
      name: "SKU information for RTX 5080",
    });
    await popup.waitFor();
    const box = await popup.boundingBox();
    assert.ok(
      box.x >= 0 && box.x + box.width <= width,
      `Info popup fits ${width}px`,
    );
    await closeCatalogInfo(page);
  }
  await page.getByRole("button", { name: "Toggle theme" }).click();
  await page.getByRole("menuitem", { name: "Light", exact: true }).click();

  deliver({ ...incomplete(), catalogStatus: "timeout" });
  await page.getByTestId("catalog-info").click();
  await page
    .getByRole("dialog", { name: "About SKU verification" })
    .getByText("SKU refresh timed out — using last-known mappings.", {
      exact: true,
    })
    .waitFor();
  assert.equal(
    await page.getByTestId("catalog-info").getAttribute("data-tone"),
    "warning",
  );
  assert.equal(
    await page.getByTestId("monitor-health").getAttribute("data-tone"),
    "healthy",
  );
  await closeCatalogInfo(page);

  const austria = demoPacket("de-at", Date.now(), ++sequence);
  austria.status = "source_degraded";
  austria.cards.find((c) => c.model === "5070").status = "invalid_response";
  austria.cards.find((c) => c.model === "5070").available = null;
  austria.cards.find((c) => c.model === "5070").observedAt = null;
  deliver(austria);
  assert.equal(
    await page.getByTestId("monitor-health").getAttribute("data-tone"),
    "healthy",
    "Austria cannot change Germany's status",
  );
  await page.locator("#locale").selectOption("de-at");
  await page
    .getByTestId("monitor-health")
    .getByText("RTX 5070 checks unavailable", { exact: true })
    .waitFor();
  assert.equal(await page.getByTestId("stock-5070").innerText(), "Unconfirmed");
  assert.equal(
    await page.getByTestId("stock-5080").innerText(),
    "Out of stock",
  );
  assert.equal(
    await page.getByTestId("monitor-health").getAttribute("data-tone"),
    "warning",
  );
  assert.equal(await page.getByTestId("catalog-info").count(), 0);
  assert.equal(await page.getByTestId("catalog-info-5080").count(), 0);
  await page.screenshot({
    path: resolve(screenshots, "stock-card-warning.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.locator("#locale").selectOption("de-de");
  await page
    .getByTestId("monitor-health")
    .getByText("Stock checks active", { exact: true })
    .waitFor();

  const staleStock = incomplete();
  staleStock.cards.find((c) => c.model === "5080").observedAt =
    staleStock.serverTime - staleStock.staleAfterMs;
  deliver(staleStock);
  await page
    .getByTestId("monitor-health")
    .getByText("RTX 5080 checks unavailable", { exact: true })
    .waitFor();
  assert.equal(await page.getByTestId("stock-5080").innerText(), "Unconfirmed");
  assert.equal(
    await page.getByTestId("stock-5090").innerText(),
    "Out of stock",
  );
  publish("de-de", null, "health");
  await page
    .getByTestId("monitor-health")
    .getByText("Stock checks active", { exact: true })
    .waitFor();
  await page.getByTestId("catalog-info").waitFor({ state: "detached" });
  assert.equal(await page.getByTestId("catalog-info-5080").count(), 0);
  assert.equal(await page.getByTestId("availability-alert").count(), 0);
  assert.equal(await page.evaluate(() => window.__testAudioPlays), 0);
  console.log(
    "PASS: catalog-only degradation stays separate, real stock gaps name affected cards, locale isolation and recovery stay correct",
  );

  phase = "transient stock failure grace and strict positive alerts";
  const transient = incomplete();
  const transientCard = transient.cards.find((c) => c.model === "5090");
  transientCard.status = "blocked";
  transientCard.observedAt = transient.serverTime - 10_000;
  deliver(transient);
  await page
    .getByTestId("last-check-5090")
    .getByText(/Last confirmed 1\ds ago/)
    .waitFor();
  assert.equal(
    await page.getByTestId("stock-5090").innerText(),
    "Out of stock",
  );
  assert.equal(
    await page.getByTestId("monitor-health").getAttribute("data-tone"),
    "healthy",
  );
  await page
    .getByRole("button", { name: "Auto-open off", exact: true })
    .click();
  const cachedPositive = {
    ...transient,
    sequence: ++sequence,
    type: "update",
    synthetic: false,
    alerts: ["5090"],
    cards: transient.cards.map((c) =>
      c.model === "5090" ? { ...c, available: true } : c,
    ),
  };
  deliver(cachedPositive);
  await page
    .getByTestId("stock-5090")
    .getByText("Last seen in stock", { exact: true })
    .waitFor();
  assert.equal(
    await page.getByRole("link", { name: "Shop RTX 5090" }).count(),
    0,
  );
  assert.equal(await page.getByTestId("availability-alert").count(), 0);
  assert.equal(await page.evaluate(() => window.__testOpened.length), 0);
  assert.equal(await page.evaluate(() => window.__testAudioPlays), 0);
  await page.screenshot({
    path: resolve(screenshots, "stock-retry-grace.png"),
    animations: "disabled",
  });
  const expired = incomplete();
  expired.cards.find((c) => c.model === "5090").status = "blocked";
  expired.cards.find((c) => c.model === "5090").observedAt =
    expired.serverTime - 30_000;
  deliver(expired);
  await page
    .getByTestId("monitor-health")
    .getByText("RTX 5090 checks unavailable", { exact: true })
    .waitFor();
  assert.equal(await page.getByTestId("stock-5090").innerText(), "Unconfirmed");
  assert.equal(await page.getByTestId("last-check-5090").count(), 0);
  publish("de-de", null, "health");
  await page
    .getByTestId("monitor-health")
    .getByText("Stock checks active", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Auto-open on", exact: true }).click();
  console.log(
    "PASS: transient failures retain labelled last-confirmed stock; 30-second gaps warn; cached positives never sound or open a shop",
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
    await page.locator("#volume").inputValue(),
    "0.55",
    "Volume survives a return visit",
  );
  assert.equal(
    await page
      .getByRole("switch", { name: "Notify me about RTX 5090" })
      .getAttribute("aria-checked"),
    "false",
  );
  await page
    .getByTestId("monitor-health")
    .getByText("Stock checks active", { exact: true })
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
    .getByText("Stock checks active", { exact: true })
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
  await actionPage.getByText("Stock checks active", { exact: true }).waitFor();
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
  await actionPage.getByText("Stock checks active", { exact: true }).waitFor();
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
  await actionPage.getByText("Stock checks active", { exact: true }).waitFor();
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
  await audioPage.getByText("Stock checks active", { exact: true }).waitFor();
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
  await deniedPage.getByText("Stock checks active", { exact: true }).waitFor();
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
    .getByText("Preview", { exact: true })
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

  for (const width of [320, 390, 600, 601, 768, 1365]) {
    await visual.setViewportSize({ width, height: 900 });
    const soundButton = await visual
      .getByRole("button", { name: "Sound on", exact: true })
      .boundingBox();
    const autoButton = await visual
      .getByRole("button", { name: "Auto-open off", exact: true })
      .boundingBox();
    assert.ok(
      Math.abs(soundButton.y - autoButton.y) < 1,
      "Sound and auto-open stay side by side",
    );
    assert.ok(
      soundButton.height >= 44 && autoButton.height >= 44,
      "Alert buttons remain touch-sized",
    );
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
  await visual.clock.install();
  await visual.getByRole("button", { name: "Simulate a drop" }).click();
  assert.equal(await visual.evaluate(() => window.__testOpened.length), 0);
  await visual.getByRole("button", { name: /Drop in \ds…/ }).waitFor();
  await visual.clock.fastForward(6100);
  await visual.getByTestId("availability-alert").waitFor();
  assert.match(
    await visual.getByTestId("availability-alert").innerText(),
    /Test alert/,
  );
  assert.equal(
    await visual.evaluate(() => window.__testOpened.length),
    1,
    "Explicit preview can attempt one demo tab",
  );
  assert.deepEqual(await visual.evaluate(() => window.__testOpened[0]), [
    "/auto-open-preview?region=de-de&model=5090",
    "_blank",
    "noopener,noreferrer",
  ]);
  assert.equal(
    await visual
      .getByRole("link", { name: "Open demo shop", exact: true })
      .getAttribute("href"),
    "/auto-open-preview?region=de-de&model=5090",
  );
  await visual.clock.fastForward(31_000);
  assert.equal(
    await visual.evaluate(() => window.__testOpened.length),
    1,
    "Demo heartbeat must not repeat an auto-open",
  );

  await visual
    .getByRole("button", { name: "Auto-open on", exact: true })
    .click();
  await visual.getByRole("button", { name: "Simulate a drop" }).click();
  await visual.clock.fastForward(6100);
  assert.equal(
    await visual.evaluate(() => window.__testOpened.length),
    1,
    "Auto-open off is respected for demos",
  );
  await visual.clock.fastForward(8100);
  await visual.getByRole("button", { name: "Simulate a drop" }).click();
  await visual.locator("#locale").selectOption("fr-fr");
  await visual.waitForURL((url) => url.searchParams.get("region") === "fr-fr");
  await visual.clock.fastForward(6100);
  assert.equal(
    await visual.getByTestId("availability-alert").count(),
    0,
    "Region changes cancel queued demos",
  );
  assert.equal(await visual.evaluate(() => window.__testOpened.length), 1);

  await visual
    .getByRole("button", { name: "Auto-open off", exact: true })
    .click();
  await visual.getByRole("button", { name: "Simulate a drop" }).click();
  await visual
    .getByRole("switch", { name: "Notify me about RTX 5090" })
    .click();
  await visual.clock.fastForward(6100);
  assert.equal(
    await visual.evaluate(() => window.__testOpened.length),
    1,
    "Deselecting a queued card suppresses its popup",
  );
  await visual.clock.fastForward(8100);
  await visual.getByRole("button", { name: "Simulate a drop" }).click();
  await visual.clock.fastForward(6100);
  assert.deepEqual(await visual.evaluate(() => window.__testOpened[1]), [
    "/auto-open-preview?region=fr-fr&model=5080",
    "_blank",
    "noopener,noreferrer",
  ]);
  console.log(
    "PASS: clearly labelled, server-free demo; light/dark themes and 320–1365px layouts",
  );
  await preview.close();

  phase = "real delayed demo popup with popups allowed by browser launch";
  // Isolate native timers from the earlier fast-forwarded browser scenarios.
  const popupBrowser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
  });
  try {
    const popupContext = await popupBrowser.newContext({ locale: "en-GB" });
    await setup(popupContext, false, false, true);
    const popupPage = await popupContext.newPage();
    await popupPage.goto(new URL("/?demo=1&region=de-de", base).href);
    await popupPage.getByText("Stock checks active", { exact: true }).waitFor();
    await popupPage
      .getByRole("button", { name: "Auto-open off", exact: true })
      .click();
    await popupPage.getByRole("button", { name: "Simulate a drop" }).click();
    // Do not poll DOM assertions while activation expires: automation evaluations
    // can carry a user gesture. Let the page's real six-second timer fire unaided.
    await new Promise((resolve) => setTimeout(resolve, 8500));
    assert.deepEqual(
      await popupPage.evaluate(() => window.__testOpenActivation),
      [false],
      "The test fires after click activation expires",
    );
    const demoShop = popupContext.pages().find((page) => page !== popupPage);
    assert.ok(demoShop, "The browser opened the safe demo tab");
    await demoShop.waitForURL(
      new URL("/auto-open-preview?region=de-de&model=5090", base).href,
    );
    await demoShop
      .getByRole("heading", { name: "Demo shop", exact: true })
      .waitFor();
    await demoShop.getByText("RTX 5090 · Germany", { exact: true }).waitFor();
    assert.equal(await demoShop.evaluate(() => window.opener), null);
    assert.equal(await demoShop.evaluate(() => document.referrer), "");
    assert.equal(popupContext.pages().length, 2);
    await demoShop.screenshot({
      path: resolve(screenshots, "auto-open-demo-shop.png"),
      animations: "disabled",
    });
    await demoShop.setViewportSize({ width: 320, height: 640 });
    assert.ok(
      await demoShop.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await popupContext.close();
  } finally {
    await popupBrowser.close();
  }
  console.log(
    "PASS: real delayed same-origin demo tab, no opener/referrer; popup blocking disabled by this automation launch",
  );

  phase = "real Chromium popup blocking and manual demo fallback";
  const blockingBrowser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
    ignoreDefaultArgs: ["--disable-popup-blocking"],
  });
  try {
    const blockingContext = await blockingBrowser.newContext();
    await setup(blockingContext, false, false, true);
    const blockedPage = await blockingContext.newPage();
    await blockedPage.goto(new URL("/?demo=1&region=de-de", base).href);
    await blockedPage
      .getByText("Stock checks active", { exact: true })
      .waitFor();
    await blockedPage
      .getByRole("button", { name: "Auto-open off", exact: true })
      .click();
    await blockedPage.getByRole("button", { name: "Simulate a drop" }).click();
    await new Promise((resolve) => setTimeout(resolve, 8500));
    assert.deepEqual(
      await blockedPage.evaluate(() => window.__testOpenActivation),
      [false],
    );
    await blockedPage.getByTestId("availability-alert").waitFor();
    assert.equal(
      blockingContext.pages().length,
      1,
      "Default popup policy blocks the delayed tab",
    );
    await blockedPage
      .getByText(
        "No demo tab? Allow popups for this site and retry, or open it below.",
        { exact: true },
      )
      .waitFor();
    const manualPage = blockingContext.waitForEvent("page");
    await blockedPage
      .getByRole("link", { name: "Open demo shop", exact: true })
      .click();
    const fallback = await manualPage;
    await fallback
      .getByRole("heading", { name: "Demo shop", exact: true })
      .waitFor();
    assert.equal(new URL(fallback.url()).origin, base.origin);
    assert.equal(await fallback.evaluate(() => window.opener), null);
    await blockingContext.close();
  } finally {
    await blockingBrowser.close();
  }
  console.log(
    "PASS: default Chromium blocks the delayed popup; the visual alert and manual demo-shop link still work",
  );

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
