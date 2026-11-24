import { SIGNALS, finiteTime, stateKey, validateEvent } from './events.js';

const DEFAULTS = Object.freeze({
  windowMs: 2000, stateTtlMs: 750, gestureTtlMs: 1200,
  maxGapMs: 350, holdMs: 300, minSamples: 3, minConfidence: 0.55,
  maxSamplesPerSignal: 256,
});

export class FusionEngine {
  #options;
  #channels;
  #now;

  constructor(options = {}) {
    this.#options = { ...DEFAULTS, ...options };
    for (const [key, value] of Object.entries(this.#options)) {
      if (!(key in DEFAULTS) || !Number.isFinite(value) || value <= 0 ||
          (['minSamples', 'maxSamplesPerSignal'].includes(key) && !Number.isInteger(value))) {
        throw new TypeError(`Invalid fusion option: ${key}`);
      }
    }
    const o = this.#options;
    if (o.windowMs < 1000 || o.windowMs > 2000 || o.stateTtlMs > o.windowMs ||
        o.gestureTtlMs > o.windowMs || o.maxGapMs > o.stateTtlMs ||
        o.holdMs > o.windowMs || o.minConfidence > 1 || o.minSamples < 2 ||
        o.maxSamplesPerSignal < o.minSamples) throw new TypeError('Inconsistent fusion options');
    this.reset();
  }

  reset() {
    this.#now = -Infinity;
    this.#channels = Object.fromEntries(SIGNALS.map(signal => [signal, { history: [], last: null, run: null, action: null }]));
  }

  #advance(nowMs) {
    if (!finiteTime(nowMs) || nowMs < this.#now) throw new RangeError('Session clock must be finite, nonnegative and monotonic');
    this.#now = nowMs;
    for (const channel of Object.values(this.#channels)) {
      channel.history = channel.history.filter(row => row.timestampMs >= nowMs - this.#options.windowMs);
    }
  }

  ingest(input, receivedAtMs) {
    const event = validateEvent(input);
    this.#advance(receivedAtMs);
    if (event.timestampMs > receivedAtMs) return { accepted: false, reason: 'future_event' };
    if (event.timestampMs < receivedAtMs - this.#options.windowMs) return { accepted: false, reason: 'outside_window' };
    const channel = this.#channels[event.signal];
    if (channel.last && event.timestampMs <= channel.last.timestampMs) return { accepted: false, reason: 'out_of_order' };
    if (event.status === 'ok' && event.confidence !== null && event.confidence < this.#options.minConfidence) {
      event.status = 'unknown';
      event.value = null;
      event.reason = 'low_confidence';
    }
    if (event.status === 'ok') {
      const key = stateKey(event);
      const gap = channel.last ? event.timestampMs - channel.last.timestampMs : Infinity;
      if (!channel.run || channel.run.key !== key || gap > this.#options.maxGapMs) {
        channel.run = { key, since: event.timestampMs, samples: 0 };
      }
      channel.run.samples = Math.min(this.#options.maxSamplesPerSignal, channel.run.samples + 1);
      if (event.signal === 'gesture') channel.action = event;
    } else {
      channel.run = null;
      if (event.status !== 'idle') channel.action = null;
    }
    channel.last = event;
    channel.history.push(event);
    if (channel.history.length > this.#options.maxSamplesPerSignal) channel.history.shift();
    return { accepted: true, reason: null };
  }

  #signal(signal, nowMs) {
    const channel = this.#channels[signal];
    const last = channel.last;
    const result = {
      status: 'missing', value: null, confidence: null, confidenceKind: 'unavailable',
      stability: 0, durationMs: 0, observedAtMs: last?.timestampMs ?? null,
      ageMs: last ? nowMs - last.timestampMs : null,
      source: last?.source ?? null, reason: last?.reason ?? 'no_observation',
      sampleCount: channel.history.length,
    };
    if (!last) return result;
    if (signal === 'gesture' && channel.action && nowMs - channel.action.timestampMs <= this.#options.gestureTtlMs) {
      const action = channel.action;
      return { ...result, status: 'ready', value: action.value, confidence: action.confidence,
        confidenceKind: action.confidenceKind, stability: null, observedAtMs: action.timestampMs,
        ageMs: nowMs - action.timestampMs, source: action.source, reason: null };
    }
    if (result.ageMs > this.#options.stateTtlMs) return { ...result, status: 'stale', reason: 'expired' };
    if (last.status !== 'ok') return { ...result, status: last.status, reason: last.reason };
    if (signal === 'gesture') return { ...result, status: 'idle', reason: 'gesture_expired' };
    const run = channel.run;
    const rows = channel.history.filter(row => stateKey(row) === run.key);
    const scores = rows.filter(row => row.timestampMs >= run.since && row.confidence !== null).map(row => row.confidence);
    const durationMs = last.timestampMs - run.since;
    const stable = durationMs >= this.#options.holdMs && run.samples >= this.#options.minSamples;
    return {
      ...result, status: stable ? 'ready' : 'pending', value: stable ? structuredClone(last.value) : null,
      confidence: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
      confidenceKind: last.confidenceKind, stability: rows.length / channel.history.length,
      durationMs, reason: stable ? null : 'awaiting_stability',
    };
  }

  snapshot(nowMs) {
    this.#advance(nowMs);
    const signals = Object.fromEntries(SIGNALS.map(signal => [signal, this.#signal(signal, nowMs)]));
    const availableSignals = SIGNALS.filter(signal => ['ready', 'idle'].includes(signals[signal].status));
    return {
      schemaVersion: 1, timestampMs: nowMs, windowMs: this.#options.windowMs, signals,
      summary: {
        expression: signals.expression.value, activeGesture: signals.gesture.value,
        gazeTarget: signals.gaze.value?.targetId ?? null,
        gazeDirection: signals.gaze.value?.direction ?? null,
        gazeDurationMs: signals.gaze.status === 'ready' ? signals.gaze.durationMs : 0,
        headDirection: signals.head_pose.value?.direction ?? null,
      },
      quality: {
        availableSignals,
        missingSignals: SIGNALS.filter(signal => ['missing', 'stale', 'unknown'].includes(signals[signal].status)),
        pendingSignals: SIGNALS.filter(signal => signals[signal].status === 'pending'),
        coverage: availableSignals.length / SIGNALS.length,
      },
    };
  }
}
