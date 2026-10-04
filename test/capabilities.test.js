import test from "node:test";
import assert from "node:assert/strict";

import { CAPABILITY_DEFINITIONS, getCapabilityStatus } from "../capabilities/registry.js";

test("registry contains the five approved capability components", () => {
  assert.deepEqual(
    CAPABILITY_DEFINITIONS.map((x) => x.id),
    ["jev-ultrafast", "laya", "ax", "hindsight", "paperclip"],
  );
});

test("status is fail-closed when runtime configuration is absent", () => {
  const status = getCapabilityStatus({});
  assert.equal(status.length, 5);
  assert.ok(status.every((x) => x.integrated === true));
  assert.ok(status.every((x) => x.configured === false));
  assert.ok(status.every((x) => x.missingConfig.length === 1));
});

test("status reports configured capabilities without exposing endpoint values", () => {
  const env = {
    JEV_RUNTIME_URL: "http://127.0.0.1:8766",
    LAYA_RUNTIME_URL: "http://127.0.0.1:9001",
    AX_CONTROL_PLANE: "dns:///ax-system:443",
    HINDSIGHT_API_URL: "http://127.0.0.1:8888",
    PAPERCLIP_API_URL: "http://127.0.0.1:3100",
  };
  const status = getCapabilityStatus(env);
  assert.ok(status.every((x) => x.configured === true));
  const serialized = JSON.stringify(status);
  for (const value of Object.values(env)) assert.equal(serialized.includes(value), false);
});
