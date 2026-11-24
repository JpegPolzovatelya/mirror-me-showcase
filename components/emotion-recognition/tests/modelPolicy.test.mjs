import test from "node:test";
import assert from "node:assert/strict";
import { MODEL_READINESS, SOURCE_MODELS } from "../src/domain/modelPolicy.js";

test("marks existing model weights ready for the local browser adapter after manifest checks", () => {
  assert.equal(MODEL_READINESS.canUseExistingWeightsInBrowser, true);
  assert.equal(MODEL_READINESS.status, "ready_for_local_browser_adapter");
  assert.match(MODEL_READINESS.reason, /Runtime packages/);
});

test("records the audited source model hashes without bundling weights", () => {
  assert.equal(
    SOURCE_MODELS.ferplus.sha256,
    "a2a2ba6a335a3b29c21acb6272f962bd3d47f84952aaffa03b60986e04efa61c",
  );
  assert.equal(
    SOURCE_MODELS.blazeface.sha256,
    "b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f",
  );
  assert.equal(SOURCE_MODELS.ferplus.browserStatus, "ready_for_local_browser_adapter");
  assert.equal(SOURCE_MODELS.ferplus.browserRuntime, "onnxruntime-web");
});
