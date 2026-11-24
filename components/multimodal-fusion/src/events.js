export const SIGNALS = Object.freeze(['expression', 'gesture', 'gaze', 'head_pose']);
export const DIRECTIONS = Object.freeze(['left', 'right', 'up', 'down', 'center']);
export const GESTURES = Object.freeze(['Give', 'Take', 'Hello', 'Goodbye']);
export const EXPRESSIONS = Object.freeze(['neutral', 'happiness', 'surprise', 'sadness', 'anger', 'disgust', 'fear', 'contempt']);
const SCORE_KINDS = ['model_score', 'heuristic_score', 'unavailable'];
export const finiteTime = value => Number.isFinite(value) && value >= 0;
export const nonempty = value => typeof value === 'string' && value.trim().length > 0;

export function validateEvent(event) {
  if (!event || !SIGNALS.includes(event.signal)) throw new TypeError('Invalid event signal');
  if (!finiteTime(event.timestampMs)) throw new TypeError('Invalid event timestampMs');
  if (!['ok', 'missing', 'unknown', 'idle'].includes(event.status) ||
      (event.status === 'idle' && event.signal !== 'gesture')) throw new TypeError('Invalid event status');
  if (!nonempty(event.source)) throw new TypeError('Invalid event source');
  if (!SCORE_KINDS.includes(event.confidenceKind) ||
      (event.confidenceKind === 'unavailable' ? event.confidence !== null :
        !Number.isFinite(event.confidence) || event.confidence < 0 || event.confidence > 1)) {
    throw new TypeError('Invalid event confidence');
  }
  if (event.reason != null && !nonempty(event.reason)) throw new TypeError('Invalid event reason');
  const { signal, value, status } = event;
  if (status !== 'ok' && value !== null) throw new TypeError('Non-ok event value must be null');
  if (status === 'ok') {
    let valid = false;
    if (signal === 'expression') valid = EXPRESSIONS.includes(value);
    if (signal === 'gesture') valid = GESTURES.includes(value);
    if (signal === 'gaze') valid = value && DIRECTIONS.includes(value.direction) &&
      (value.targetId === null || nonempty(value.targetId));
    if (signal === 'head_pose') valid = value && DIRECTIONS.includes(value.direction) &&
      [value.yaw, value.pitch, value.roll].every(Number.isFinite);
    if (!valid) throw new TypeError('Invalid event value');
  }
  // Keep the wire format small: never retain arbitrary input metadata or frames.
  const normalizedValue = status !== 'ok' ? null : signal === 'gaze'
    ? { direction: value.direction, targetId: value.targetId }
    : signal === 'head_pose'
      ? { direction: value.direction, yaw: value.yaw, pitch: value.pitch, roll: value.roll }
      : value;
  return {
    signal, timestampMs: event.timestampMs, status, value: normalizedValue,
    confidence: event.confidence, confidenceKind: event.confidenceKind,
    source: event.source, reason: event.reason ?? null,
  };
}

export function stateKey(event) {
  const value = event.signal === 'head_pose' ? event.value?.direction : event.value;
  return JSON.stringify([event.status, value, event.source, event.confidenceKind]);
}
