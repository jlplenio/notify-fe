import { useEffect, useRef, useState } from "react";
import { type Locale, type Model } from "../lib/realtime/catalog.ts";
import { demoPacket } from "../lib/realtime/demo.ts";
import {
  MonitorState,
  subscriptionUrl,
  type MonitorHealth,
  type Packet,
} from "../lib/realtime/protocol.ts";

export type Connection =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "browser_offline"
  | "unconfigured";
export interface MonitorView {
  packet: Packet | null;
  health: MonitorHealth;
  connection: Connection;
  serverNow: number | null;
  issue: string | null;
}
const emptyView: MonitorView = {
  packet: null,
  health: "waiting",
  connection: "connecting",
  serverNow: null,
  issue: null,
};

export function useMonitor({
  locale,
  ready,
  endpoint,
  allowSynthetic,
  demo,
  onAlerts,
}: {
  locale: Locale;
  ready: boolean;
  endpoint?: string;
  allowSynthetic: boolean;
  demo: boolean;
  onAlerts: (packet: Packet, models: Model[]) => void;
}) {
  const [view, setView] = useState<MonitorView>(emptyView);
  const [demoDropAt, setDemoDropAt] = useState<number | null>(null);
  const callback = useRef(onAlerts);
  callback.current = onAlerts;
  const reconnectRef = useRef<(() => void) | null>(null);
  const demoRef = useRef<((model: Model) => void) | null>(null);

  useEffect(() => {
    if (!ready) return;
    setDemoDropAt(null);
    let disposed = false;
    const state = new MonitorState(locale, demo || allowSynthetic);
    let connection: Connection = "connecting";
    let issue: string | null = null;
    const render = () => {
      if (!disposed)
        setView({
          packet: state.packet,
          health: state.health(performance.now()),
          connection,
          serverNow: state.serverNow(performance.now()),
          issue,
        });
    };
    const accept = (packet: unknown) => {
      const result = state.accept(packet, performance.now());
      if (!result) return;
      render();
      if (result.alerts.length) callback.current(result.packet, result.alerts);
    };
    render();

    if (demo) {
      connection = "connected";
      let sequence = 0,
        positive: Model | null = null;
      const history = new Map(
        demoPacket(locale, Date.now()).cards.map((c) => [
          c.model,
          c.lastAvailableAt,
        ]),
      );
      const send = (type: Packet["type"], alerts: Model[] = []) => {
        const packet = demoPacket(locale, Date.now(), ++sequence, positive);
        packet.type = type;
        packet.alerts = alerts;
        packet.cards.forEach((card) => {
          card.lastAvailableAt = history.get(card.model) ?? null;
        });
        accept(packet);
      };
      send("snapshot");
      let reset: ReturnType<typeof setTimeout> | undefined;
      let pending: ReturnType<typeof setTimeout> | undefined;
      demoRef.current = (model) => {
        if (positive !== null || pending !== undefined) return;
        // Simulate an arriving alert outside the click handler. No tab is
        // pre-opened; the browser's normal popup policy still applies.
        setDemoDropAt(Date.now() + 6000);
        pending = setTimeout(() => {
          pending = undefined;
          setDemoDropAt(null);
          positive = model;
          history.set(positive, Date.now());
          send("update", [positive]);
          reset = setTimeout(() => {
            positive = null;
            send("update");
          }, 8000);
        }, 6000);
      };
      const heartbeat = setInterval(() => send("health"), 30_000);
      const ticker = setInterval(render, 1000);
      return () => {
        disposed = true;
        demoRef.current = null;
        clearInterval(heartbeat);
        clearInterval(ticker);
        clearTimeout(pending);
        clearTimeout(reset);
      };
    }

    if (!endpoint) {
      connection = "unconfigured";
      issue = "Live monitoring is not configured yet.";
      render();
      return () => {
        disposed = true;
      };
    }
    let target: string;
    try {
      target = subscriptionUrl(endpoint, locale);
    } catch {
      connection = "unconfigured";
      issue = "The monitoring endpoint is not configured correctly.";
      render();
      return;
    }

    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0,
      openedAt = 0,
      lastTransportAt = 0,
      lastPingAt = 0;
    const schedule = () => {
      clearTimeout(retry);
      connection = navigator.onLine ? "reconnecting" : "browser_offline";
      render();
      if (navigator.onLine) {
        const delay =
          Math.min(30_000, 1000 * 2 ** Math.min(attempt++, 5)) *
          (0.5 + Math.random() * 0.5);
        retry = setTimeout(connect, delay);
      }
    };
    const closeCurrent = () => {
      const previous = socket;
      socket = null;
      if (previous && previous.readyState < WebSocket.CLOSING)
        previous.close(1000, "Listener reconnect");
    };
    const connect = () => {
      if (disposed) return;
      clearTimeout(retry);
      closeCurrent();
      state.beginConnection();
      if (!navigator.onLine) {
        connection = "browser_offline";
        render();
        return;
      }
      connection = attempt ? "reconnecting" : "connecting";
      openedAt = lastTransportAt = lastPingAt = performance.now();
      render();
      let current: WebSocket;
      try {
        current = new WebSocket(target);
      } catch {
        issue = "Could not open the monitoring connection.";
        schedule();
        return;
      }
      socket = current;
      current.onmessage = (event: MessageEvent<unknown>) => {
        if (disposed || socket !== current) return;
        lastTransportAt = performance.now();
        if (event.data === "pong") return; // Never renew source health from a transport pong.
        try {
          if (typeof event.data !== "string" || event.data.length > 128_000)
            throw new Error("Invalid frame");
          const result = state.accept(
            JSON.parse(event.data) as unknown,
            performance.now(),
          );
          if (!result) return;
          connection = "connected";
          issue = null;
          if (performance.now() - openedAt > 5000) attempt = 0;
          render();
          if (result.alerts.length)
            callback.current(result.packet, result.alerts);
        } catch {
          issue = "Monitoring data could not be verified. Reconnecting safely.";
          closeCurrent();
          schedule();
        }
      };
      current.onclose = () => {
        if (!disposed && socket === current) {
          socket = null;
          schedule();
        }
      };
      current.onerror = () => {
        if (!disposed && socket === current) {
          issue = "The monitoring connection was interrupted.";
          render();
        }
      };
    };
    const recover = () => {
      if (!disposed) connect();
    };
    const visibility = () => {
      if (
        document.visibilityState === "visible" &&
        (!socket || performance.now() - lastTransportAt > 45_000)
      )
        recover();
    };
    const pause = () => {
      clearTimeout(retry);
      closeCurrent();
      connection = navigator.onLine ? "reconnecting" : "browser_offline";
      render();
    };
    const resume = (event: PageTransitionEvent) => {
      if (event.persisted) recover();
    };
    reconnectRef.current = recover;
    window.addEventListener("online", recover);
    window.addEventListener("offline", pause);
    window.addEventListener("pageshow", resume);
    window.addEventListener("pagehide", pause);
    document.addEventListener("visibilitychange", visibility);
    connect();
    const ticker = setInterval(() => {
      const now = performance.now();
      if (
        socket &&
        ((!state.packet && now - openedAt > 10_000) ||
          now - lastTransportAt > 55_000)
      ) {
        issue = "No response from the monitoring connection.";
        closeCurrent();
        schedule();
      }
      if (socket?.readyState === WebSocket.OPEN && now - lastPingAt >= 25_000) {
        socket.send("ping");
        lastPingAt = now;
      }
      render();
    }, 1000);
    return () => {
      disposed = true;
      reconnectRef.current = null;
      clearTimeout(retry);
      clearInterval(ticker);
      closeCurrent();
      window.removeEventListener("online", recover);
      window.removeEventListener("offline", pause);
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("pagehide", pause);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [locale, ready, endpoint, allowSynthetic, demo]);

  // A locale switch must never briefly display the previous country's stock.
  const current =
    view.packet && view.packet.locale !== locale ? emptyView : view;
  return {
    ...current,
    reconnect: () => reconnectRef.current?.(),
    demoCountdown:
      demo && demoDropAt !== null
        ? Math.max(0, Math.ceil((demoDropAt - Date.now()) / 1000))
        : null,
    simulateDrop: (model: Model) => demoRef.current?.(model),
  };
}
