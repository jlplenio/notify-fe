import assert from "node:assert/strict";
import test from "node:test";
import { checkReleaseEnv } from "./check-release-env.mjs";

const production = {
  VERCEL_ENV: "production",
  NEXT_PUBLIC_WEBSOCKET_URL: "wss://monitor.example/v1/ws",
  NEXT_PUBLIC_ALLOW_SYNTHETIC: "false",
  NEXT_PUBLIC_ENABLE_DEMO: "false",
};

test("production requires a secure endpoint and disabled test features", () => {
  assert.doesNotThrow(() => checkReleaseEnv(production));
  for (const flag of [
    "NEXT_PUBLIC_ALLOW_SYNTHETIC",
    "NEXT_PUBLIC_ENABLE_DEMO",
  ]) {
    for (const value of [undefined, "true", "FALSE", ""]) {
      assert.throws(() => checkReleaseEnv({ ...production, [flag]: value }));
    }
  }
});

test("reject invalid or credential-bearing production endpoints without exposing values", () => {
  for (const url of [
    undefined,
    "ws://monitor.example/v1/ws",
    "https://monitor.example/v1/ws",
    "wss://localhost/v1/ws",
    "wss://127.0.0.1/v1/ws",
    "wss://[::1]/v1/ws",
    "wss://user:private-value@monitor.example/v1/ws",
    "wss://monitor.example/v1/publish",
    "wss://monitor.example/v1/ws?key=private-value",
    "wss://monitor.example/v1/ws#private-value",
  ]) {
    assert.throws(
      () => checkReleaseEnv({ ...production, NEXT_PUBLIC_WEBSOCKET_URL: url }),
      (error) => !error.message.includes("private-value"),
    );
  }
});

test("isolated local and preview tests can still enable demos", () => {
  assert.doesNotThrow(() => checkReleaseEnv({}));
  assert.doesNotThrow(() =>
    checkReleaseEnv({
      ...production,
      VERCEL_ENV: "preview",
      NEXT_PUBLIC_ENABLE_DEMO: "true",
    }),
  );
});
