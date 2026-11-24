export const SOURCE_MODELS = {
  ferplus: {
    id: "ferplus",
    sourcePath: "models/emotion-ferplus.onnx",
    sha256: "a2a2ba6a335a3b29c21acb6272f962bd3d47f84952aaffa03b60986e04efa61c",
    browserStatus: "ready_for_local_browser_adapter",
    browserRuntime: "onnxruntime-web",
  },
  blazeface: {
    id: "blazeface_short_range",
    sourcePath: "models/blaze_face_short_range.tflite",
    sha256: "b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f",
    browserStatus: "ready_for_local_browser_adapter",
    browserRuntime: "mediapipe-tasks-vision",
  },
};

export const MODEL_READINESS = {
  canUseExistingWeightsInBrowser: true,
  status: "ready_for_local_browser_adapter",
  reason:
    "Existing weights now have a local manifest, source/license notes, hash checks, and browser IO metadata. Runtime packages still need to be bundled before live browser inference can run.",
};

export function getModelStatusText() {
  return MODEL_READINESS.canUseExistingWeightsInBrowser
    ? "Модель проверена"
    : "Модель ожидает manifest";
}
