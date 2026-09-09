import { useEffect, useRef, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/router";
import {
  ArrowUpRight,
  Bell,
  ChevronDown,
  Github,
  Heart,
  Info,
  Radio,
  RefreshCw,
  ExternalLink,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { ModeToggle } from "./ThemeToggle";
import { env } from "~/env";
import { useMonitor, type MonitorView } from "~/hooks/useMonitor";
import { useAlertSound } from "~/hooks/useAlertSound";
import {
  COUNTRIES,
  DISPLAY_MODELS,
  LOCALES,
  isLocale,
  storeUrl,
  type Locale,
  type Model,
} from "~/lib/realtime/catalog";
import {
  PREFERENCES_KEY,
  readPreferences,
  toggleModel,
  type Preferences,
} from "~/lib/realtime/preferences";
import {
  isStockCheckFresh,
  relativeTime,
  type CardState,
  type Packet,
} from "~/lib/realtime/protocol";
import { autoOpenStores, previewStoreUrl } from "~/lib/realtime/actions";
import { catalogNotice, stockHealthCopy } from "~/lib/realtime/health";
import styles from "~/styles/monitor.module.css";

/** Decorative, code-native hardware sketch; not a product photograph. */
function GpuArtwork() {
  return (
    <svg
      viewBox="0 0 112 60"
      className={styles.gpuArtwork}
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x="3"
        y="8"
        width="106"
        height="44"
        rx="6"
        fill="var(--hardware-fill)"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M5 10h30l39 40h32M5 50h30l39-40h32"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        opacity=".55"
      />
      {[29, 83].map((cx) => (
        <g key={cx}>
          <circle
            cx={cx}
            cy="30"
            r="17"
            fill="var(--hardware-fill)"
            stroke="currentColor"
            strokeWidth=".8"
          />
          <circle
            cx={cx}
            cy="30"
            r="13.8"
            fill="none"
            stroke="currentColor"
            strokeWidth=".5"
            opacity=".5"
          />
          {Array.from({ length: 9 }, (_, i) => (
            <path
              key={i}
              d={`M${cx} 26c2-6 8-10 11-6-5 0-7 5-7 10`}
              transform={`rotate(${i * 40} ${cx} 30)`}
              fill="currentColor"
              opacity=".55"
            />
          ))}
          <circle
            cx={cx}
            cy="30"
            r="4"
            fill="var(--hardware-fill)"
            stroke="currentColor"
            strokeWidth=".8"
          />
        </g>
      ))}
      <path
        d="M4 17H1v26h3M45 52v3h20v-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function StockCard({
  model,
  card,
  selected,
  monitor,
  onToggle,
  demo,
}: {
  model: Model;
  card?: CardState;
  selected: boolean;
  monitor: MonitorView;
  onToggle: () => void;
  demo: boolean;
}) {
  const now = monitor.serverNow ?? Date.now();
  const fresh =
    monitor.connection === "connected" &&
    monitor.health !== "offline" &&
    monitor.health !== "transport_silent" &&
    isStockCheckFresh(card, now, monitor.packet?.staleAfterMs ?? 60_000);
  const available = fresh && card?.available === true;
  const known = fresh && card?.available !== null;
  const stamp = card?.lastAvailableAt;
  const date = stamp != null ? new Date(stamp) : null;
  return (
    <article
      className={`${styles.stockCard} ${selected ? styles.selected : ""} ${available ? styles.available : ""}`}
      data-testid={`card-${model}`}
    >
      <div className={styles.cardIdentity}>
        <GpuArtwork />
        <h3 className={styles.model}>
          <span className={styles.rtx}>RTX</span> {model}
        </h3>
      </div>
      <div className={styles.cardAvailability}>
        <span
          className={`${styles.stockBadge} ${available ? styles.inStock : ""}`}
          data-testid={`stock-${model}`}
        >
          <span className={styles.statusDot} />
          {available
            ? "In stock"
            : known
              ? "Out of stock"
              : card
                ? "Unconfirmed"
                : "Awaiting data"}
        </span>
        {available && monitor.packet && (
          <a
            className={styles.shopLink}
            href={
              demo
                ? previewStoreUrl(monitor.packet.locale, model)
                : storeUrl(monitor.packet.locale, card?.productUrl)
            }
            target="_blank"
            rel="noopener noreferrer"
          >
            {demo ? "Demo shop" : `Shop RTX ${model}`}{" "}
            <ArrowUpRight size={13} />
          </a>
        )}
      </div>
      <dl className={styles.lastSeen}>
        <dt className={styles.rowFieldLabel}>Last in stock</dt>
        <dd className={styles.lastSeenTime} data-testid={`last-seen-${model}`}>
          {relativeTime(stamp, now)}
        </dd>
        {date && (
          <dd>
            <time
              dateTime={date.toISOString()}
              title={date.toLocaleString(undefined, { timeZoneName: "short" })}
              className={styles.exactTime}
            >
              {date.toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
          </dd>
        )}
      </dl>
      <div className={styles.cardBottom}>
        <button
          id={`notify-${model}`}
          type="button"
          role="switch"
          aria-checked={selected}
          aria-label={`Notify me about RTX ${model}`}
          onClick={onToggle}
          className={styles.toggle}
        >
          <span />
        </button>
      </div>
    </article>
  );
}

export default function RealtimeMonitor() {
  const router = useRouter();
  const [preferences, setPreferences] = useState<Preferences>(() =>
    readPreferences(null),
  );
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;
  const preferencesLoaded = useRef(false);
  const [ready, setReady] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [lastAlert, setLastAlert] = useState<{
    models: Model[];
    at: number;
    synthetic: boolean;
    demo: boolean;
    url: string;
    autoOpenAttempted: boolean;
  } | null>(null);
  const demo =
    env.NEXT_PUBLIC_ENABLE_DEMO === "true" && router.query.demo === "1";
  const sound = useAlertSound(preferences.volume);

  useEffect(() => {
    if (!router.isReady) return;
    let raw: string | null = null;
    if (!preferencesLoaded.current) {
      try {
        raw = localStorage.getItem(PREFERENCES_KEY);
      } catch {
        setStorageAvailable(false);
      }
    } else {
      // Keep this visit's choices even when browser storage is unavailable.
      raw = JSON.stringify(preferencesRef.current);
    }
    const initial = readPreferences(
      raw,
      router.query.region,
      navigator.language,
    );
    if (initial.locale !== preferencesRef.current.locale) setLastAlert(null);
    preferencesLoaded.current = true;
    preferencesRef.current = initial;
    setPreferences(initial);
    try {
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify(initial));
    } catch {
      setStorageAvailable(false);
    }
    setReady(true);
  }, [router.isReady, router.query.region]);

  const update = (changes: Partial<Preferences>) => {
    const next = { ...preferencesRef.current, ...changes };
    preferencesRef.current = next;
    setPreferences(next);
    try {
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify(next));
      setStorageAvailable(true);
    } catch {
      setStorageAvailable(false);
    }
  };
  const onAlerts = (packet: Packet, models: Model[]) => {
    const selected = models.filter((model) =>
      preferences.models.includes(model),
    );
    const firstModel = selected[0];
    if (!firstModel) return;
    setLastAlert({
      models: selected,
      at: packet.serverTime,
      synthetic: packet.synthetic,
      demo,
      autoOpenAttempted:
        autoOpenStores(
          packet,
          selected,
          preferences.autoOpen,
          (url, target, features) => window.open(url, target, features),
          demo,
        ) > 0,
      url: demo
        ? previewStoreUrl(packet.locale, firstModel)
        : storeUrl(
            packet.locale,
            packet.cards.find((c) => c.model === firstModel)?.productUrl,
          ),
    });
    if (preferences.soundEnabled) void sound.play();
  };
  const monitor = useMonitor({
    locale: preferences.locale,
    ready,
    demo,
    endpoint: env.NEXT_PUBLIC_WEBSOCKET_URL,
    allowSynthetic: env.NEXT_PUBLIC_ALLOW_SYNTHETIC === "true",
    onAlerts,
  });
  const packet = monitor.packet;
  const simulated = demo || packet?.synthetic === true;
  const health = stockHealthCopy(monitor);
  const catalog = catalogNotice(monitor);
  const now = monitor.serverNow ?? Date.now();
  const country = COUNTRIES[preferences.locale];

  useEffect(() => {
    if (!lastAlert) return;
    const timer = setTimeout(() => setLastAlert(null), 20_000);
    return () => clearTimeout(timer);
  }, [lastAlert]);

  const changeLocale = (locale: Locale) => {
    update({ locale });
    setLastAlert(null);
    void router.replace(
      {
        pathname: "/",
        query: { region: locale, ...(demo ? { demo: "1" } : {}) },
      },
      undefined,
      { shallow: true, scroll: false },
    );
  };
  const changeSound = () => {
    const enabled = !preferences.soundEnabled;
    update({ soundEnabled: enabled });
    if (enabled) void sound.enable();
    else sound.mute();
  };
  const toggleDemo = () => {
    setLastAlert(null);
    void router.replace(
      {
        pathname: "/",
        query: { region: preferences.locale, ...(!demo ? { demo: "1" } : {}) },
      },
      undefined,
      { shallow: true, scroll: false },
    );
  };

  return (
    <div className={styles.page}>
      <Head>
        <title>
          {lastAlert
            ? `${lastAlert.synthetic ? "TEST · " : ""}RTX ${lastAlert.models.join(" / ")} spotted · Notify-FE`
            : "Notify-FE · Founders Edition stock alerts"}
        </title>
      </Head>
      <div className={styles.shell}>
        <header className={styles.header}>
          <Link href="/" className={styles.brand} aria-label="Notify-FE home">
            <Image
              src="/favicon-192x192.png"
              width={30}
              height={30}
              alt=""
              priority
            />
            <span>
              Notify<span className={styles.brandSuffix}>-FE</span>
            </span>
          </Link>
          <div className={styles.headerRight}>
            <span>For people. Not scalpers.</span>
            <ModeToggle />
          </div>
        </header>
        <main>
          <div className={styles.masthead}>
            <div className={styles.intro}>
              <h1>
                Founders <em>Edition.</em>
              </h1>
              <p>RTX 50 series stock alerts</p>
            </div>
            <div
              className={styles.audience}
              data-testid="connection-counts"
              aria-label="Live listener counts"
              title="Active alert subscriptions at the last report. One person opening multiple tabs counts more than once."
            >
              <div>
                <span className={styles.audienceNumber}>
                  {packet ? packet.clients.total.toLocaleString() : "—"}
                </span>
                <span className={styles.audienceLabel}>Live listeners</span>
              </div>
              <div>
                <span
                  className={`${styles.audienceNumber} ${styles.localNumber}`}
                >
                  {packet ? packet.clients.locale.toLocaleString() : "—"}
                </span>
                <span className={styles.audienceLabel}>
                  Listening in {country.name}
                </span>
              </div>
            </div>
          </div>
          {simulated && (
            <div
              className={styles.demoBanner}
              role="status"
              data-testid="demo-banner"
            >
              <span>
                <strong>{demo ? "Preview" : "Staging test data"}</strong> ·
                Simulated data
              </span>
              {demo && (
                <button
                  type="button"
                  onClick={() => {
                    const model = DISPLAY_MODELS.find((m) =>
                      preferences.models.includes(m),
                    );
                    if (model) monitor.simulateDrop(model);
                  }}
                  title="A selected card will drop after six seconds. Auto-open uses a safe demo shop in a new tab; your browser may require popup permission."
                  disabled={
                    monitor.demoCountdown !== null ||
                    preferences.models.length === 0 ||
                    packet?.cards.some((c) => c.available === true)
                  }
                >
                  {monitor.demoCountdown !== null
                    ? `Drop in ${monitor.demoCountdown}s…`
                    : "Simulate a drop"}{" "}
                  <ArrowUpRight size={14} />
                </button>
              )}
            </div>
          )}

          <section
            className={styles.watchlist}
            aria-labelledby="watchlist-title"
          >
            <h2 id="watchlist-title" className={styles.srOnly}>
              Your watchlist
            </h2>
            <div className={styles.toolbar} data-testid="alert-settings">
              <div className={styles.localeField} data-testid="region-selector">
                <label htmlFor="locale" className={styles.srOnly}>
                  Your region
                </label>
                <span className={styles.countryCode} aria-hidden="true">
                  {country.code}
                </span>
                <select
                  id="locale"
                  value={preferences.locale}
                  disabled={!ready}
                  onChange={(event) => {
                    if (isLocale(event.target.value))
                      changeLocale(event.target.value);
                  }}
                >
                  {LOCALES.map((locale) => (
                    <option key={locale} value={locale}>
                      {COUNTRIES[locale].name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={18} aria-hidden="true" />
              </div>
              <div className={styles.toolbarActions}>
                <button
                  type="button"
                  onClick={changeSound}
                  aria-pressed={preferences.soundEnabled}
                  className={`${styles.controlButton} ${preferences.soundEnabled ? styles.controlEnabled : ""}`}
                  disabled={!ready}
                >
                  {preferences.soundEnabled ? (
                    <Volume2 size={18} />
                  ) : (
                    <VolumeX size={18} />
                  )}
                  {preferences.soundEnabled ? "Sound on" : "Sound off"}
                </button>
                <button
                  type="button"
                  onClick={() => update({ autoOpen: !preferences.autoOpen })}
                  aria-pressed={preferences.autoOpen}
                  title={
                    demo
                      ? "Test auto-open using a same-site demo shop. Your browser must allow popups."
                      : "Open the store on new alerts. Your browser must allow popups; server test alerts never open a shop."
                  }
                  className={`${styles.controlButton} ${preferences.autoOpen ? styles.controlEnabled : ""}`}
                  disabled={!ready}
                >
                  <ExternalLink size={17} />
                  {preferences.autoOpen ? "Auto-open on" : "Auto-open off"}
                </button>
              </div>
            </div>
            <div
              className={`${styles.healthPanel} ${health.tone === "healthy" ? styles.healthHealthy : health.tone === "warning" ? styles.healthWarning : ""}`}
              data-testid="monitor-health"
              data-tone={health.tone}
            >
              <p className={styles.healthTitle} role="status">
                <Radio
                  size={16}
                  className={styles.healthBeacon}
                  aria-hidden="true"
                />{" "}
                {health.title}
              </p>
              <span
                className={styles.healthReport}
                data-testid="last-heartbeat"
                title="The monitor sends a heartbeat about every 30 seconds. Availability changes are pushed as soon as detected."
              >
                {packet?.lastPublisherAt != null
                  ? `Last heartbeat · ${relativeTime(packet.lastPublisherAt, now).toLowerCase()}`
                  : "Last heartbeat · waiting"}
              </span>
              {health.tone === "warning" &&
                monitor.connection !== "browser_offline" && (
                  <button
                    type="button"
                    className={styles.retry}
                    onClick={monitor.reconnect}
                    aria-label="Reconnect to monitor"
                  >
                    <RefreshCw size={16} />
                  </button>
                )}
              {health.tone !== "healthy" && (
                <p className={styles.healthDetail}>{health.detail}</p>
              )}
            </div>
            {catalog && (
              <p
                className={styles.catalogNotice}
                data-testid="catalog-notice"
                data-tone={catalog.tone}
                role="status"
                title="Stock checks use known SKU mappings. The catalog has not fully reverified them, so a newer SKU could be missed."
              >
                <Info size={14} aria-hidden="true" />
                <span>{catalog.text}</span>
              </p>
            )}
            <div className={styles.columnLabels} aria-hidden="true">
              <span>Graphics card</span>
              <span>Availability</span>
              <span className={styles.historyHeading}>Last in stock</span>
              <span>Alert</span>
            </div>
            <div className={styles.cardGrid}>
              {DISPLAY_MODELS.map((model) => (
                <StockCard
                  key={model}
                  model={model}
                  card={packet?.cards.find((card) => card.model === model)}
                  selected={preferences.models.includes(model)}
                  monitor={monitor}
                  demo={demo}
                  onToggle={() =>
                    update({ models: toggleModel(preferences.models, model) })
                  }
                />
              ))}
            </div>
            <div className={styles.watchlistFooter}>
              <div className={styles.soundHint}>
                <span
                  role="status"
                  className={
                    !sound.ready && !sound.blocked && preferences.soundEnabled
                      ? styles.audioPrompt
                      : undefined
                  }
                >
                  {!preferences.soundEnabled
                    ? "Alerts are muted"
                    : sound.blocked
                      ? "Browser blocked audio — test to retry"
                      : sound.ready
                        ? "Audio ready in this tab"
                        : "Keep this tab open."}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    void sound.enable();
                  }}
                >
                  Test sound
                </button>
                <label
                  className={styles.volumeControl}
                  htmlFor="volume"
                  title={`Alert volume: ${Math.round(preferences.volume * 100)}%`}
                >
                  <span className={styles.srOnly}>Alert volume</span>
                  <Volume2 size={14} aria-hidden="true" />
                  <input
                    id="volume"
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={preferences.volume}
                    aria-valuetext={`${Math.round(preferences.volume * 100)}%`}
                    onChange={(event) =>
                      update({ volume: Number(event.target.value) })
                    }
                  />
                </label>
              </div>
              <a
                href={storeUrl(preferences.locale)}
                target="_blank"
                rel="noopener noreferrer"
              >
                NVIDIA store <ArrowUpRight size={14} />
              </a>
            </div>
          </section>
          {!storageAvailable && (
            <p className={styles.storageWarning} role="status">
              Settings can’t be saved in this browser. They’ll reset next visit.
            </p>
          )}
          {preferences.models.length === 0 && (
            <p className={styles.storageWarning} role="status">
              Notifications paused. Select a card to receive alerts.
            </p>
          )}
          <section
            className={styles.supportBanner}
            aria-labelledby="support-title"
            data-testid="support-banner"
          >
            <Heart
              className={styles.supportIcon}
              size={22}
              aria-hidden="true"
            />
            <div className={styles.supportCopy}>
              <h2 id="support-title">
                Got your card? <span aria-hidden="true">🎉</span>
              </h2>
              <p>
                Add your card + country to your Ko-fi message. Every tip helps
                keep the servers running.
              </p>
            </div>
            <a
              href="https://ko-fi.com/timesaved"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Say thanks on Ko-fi"
            >
              Say thanks <ArrowUpRight size={15} aria-hidden="true" />
            </a>
          </section>
          <details className={styles.about}>
            <summary>
              Good to know <ChevronDown size={14} />
            </summary>
            <div className={styles.aboutContent}>
              <p>
                Keep this tab open and test the sound. Sleeping devices and
                suspended tabs can delay alerts. Your region, card choices and
                settings are saved on this device.
              </p>
              <p>
                Heartbeats arrive about every 30 seconds. Stock changes are
                pushed as soon as detected. “Live listeners” counts connections,
                not unique people.
              </p>
              <p>
                Last in stock is the latest confirmed sighting, not a guarantee
                of availability. Times use your device’s time zone. First
                snapshots and reconnects are quiet; only new updates for
                selected cards alert.
              </p>
              <p>
                Auto-open opens the store on new selected alerts. Allow popups
                for this site, or use the store link if a tab doesn’t open. Test
                alerts never auto-open a real shop. In local preview, Simulate a
                drop tests a demo shop after a six-second countdown.
              </p>
            </div>
          </details>
        </main>
        <footer className={styles.footer}>
          <nav aria-label="Project links">
            {env.NEXT_PUBLIC_ENABLE_DEMO === "true" && (
              <button type="button" onClick={toggleDemo}>
                {demo ? "Exit preview" : "Preview sample data"}
              </button>
            )}
            <a
              href="https://github.com/jlplenio/notify-fe"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Github size={14} /> Source
            </a>
          </nav>
        </footer>
      </div>
      {lastAlert && (
        <div
          className={styles.alertToast}
          role="alert"
          data-testid="availability-alert"
        >
          <span className={styles.toastIcon}>
            <Bell size={20} />
          </span>
          <div>
            <strong>
              {lastAlert.synthetic ? "Test alert · " : ""}RTX{" "}
              {lastAlert.models.join(" / ")} spotted in stock
            </strong>
            <p>
              {country.name} · {relativeTime(lastAlert.at, now).toLowerCase()} ·
              {lastAlert.demo
                ? "Demo only — no real stock or purchase."
                : "Check the store for current availability."}
            </p>
            {lastAlert.autoOpenAttempted && (
              <p className={styles.popupHint}>
                {lastAlert.demo
                  ? "No demo tab? Allow popups for this site and retry, or open it below."
                  : "No shop tab? Allow popups for this site or open the store below."}
              </p>
            )}
            {lastAlert.synthetic && !lastAlert.demo && preferences.autoOpen && (
              <p className={styles.popupHint}>
                Auto-open is skipped for test alerts.
              </p>
            )}
            <a href={lastAlert.url} target="_blank" rel="noopener noreferrer">
              {lastAlert.demo ? "Open demo shop" : "Open store"}{" "}
              <ArrowUpRight size={14} />
            </a>
          </div>
          <button
            type="button"
            onClick={() => setLastAlert(null)}
            aria-label="Dismiss availability alert"
          >
            <X size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
