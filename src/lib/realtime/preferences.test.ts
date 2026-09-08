import assert from "node:assert/strict";
import test from "node:test";
import { MODELS } from "./catalog.ts";
import { readPreferences, toggleModel } from "./preferences.ts";

void test("first visit enables all three 50-series cards and uses a supported locale", () => {
  assert.deepEqual(readPreferences(null).models, [...MODELS]);
  assert.equal(readPreferences(null).soundEnabled, true);
  assert.equal(readPreferences(null).autoOpen, false);
  assert.equal(readPreferences(null, undefined, "de-DE").locale, "de-de");
  assert.equal(readPreferences(null, "en-in", "xx-YY").locale, "en-gb");
});

void test("return visits keep locale, empty selections and sound preferences; valid region links override locale only", () => {
  const saved = {
    ...readPreferences(null),
    locale: "de-de",
    models: [],
    soundEnabled: false,
    autoOpen: true,
    volume: 0.2,
  };
  assert.deepEqual(readPreferences(JSON.stringify(saved)), saved);
  assert.deepEqual(readPreferences(JSON.stringify(saved), "fr-fr"), {
    ...saved,
    locale: "fr-fr",
  });
  assert.equal(readPreferences(JSON.stringify(saved), "en-in").locale, "de-de");
});

void test("new auto-open preference does not reset previously saved v2 choices", () => {
  const saved = {
    ...readPreferences(null),
    locale: "de-de",
    models: [],
    soundEnabled: false,
  };
  const legacy: Partial<typeof saved> = { ...saved };
  delete legacy.autoOpen;
  assert.deepEqual(readPreferences(JSON.stringify(legacy)), {
    ...saved,
    autoOpen: false,
  });
});

void test("malformed storage, old cards, duplicate cards and out-of-range volume fall back safely", () => {
  const valid = readPreferences(null);
  for (const value of [
    "broken",
    "null",
    JSON.stringify({ ...valid, models: ["4090"] }),
    JSON.stringify({ ...valid, models: ["5090", "5090"] }),
    JSON.stringify({ ...valid, volume: 100 }),
    JSON.stringify({ ...valid, version: 99 }),
  ]) {
    assert.deepEqual(readPreferences(value), valid);
  }
});

void test("every card may be disabled and re-enabled, without losing canonical order", () => {
  let models = [...MODELS];
  for (const model of MODELS) models = toggleModel(models, model);
  assert.deepEqual(models, []);
  models = toggleModel(models, "5090");
  models = toggleModel(models, "5070");
  assert.deepEqual(models, ["5070", "5090"]);
});
