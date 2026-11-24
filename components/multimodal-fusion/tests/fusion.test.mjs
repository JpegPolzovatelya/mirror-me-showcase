import test from 'node:test';
import assert from 'node:assert/strict';
import { FusionEngine } from '../src/fusion.js';

export const event = (signal, timestampMs, value, extra = {}) => ({
  signal, timestampMs, value, status: 'ok', confidence: 0.9,
  confidenceKind: 'model_score', source: `test.${signal}`, ...extra,
});
const gaze = { direction: 'left', targetId: 'apple' };
const feed = (engine, signal, value, times = [0, 150, 300], extra = {}) => {
  for (const time of times) engine.ingest(event(signal, time, value, extra), time);
};

test('confirms repeated observations and exposes synchronized fields', () => {
  const engine = new FusionEngine();
  for (const time of [0, 150, 300]) {
    engine.ingest(event('expression', time, 'happiness'), time);
    engine.ingest(event('gaze', time, gaze), time);
    engine.ingest(event('head_pose', time, { direction: 'center', yaw: 0, pitch: 0, roll: 0 }), time);
  }
  engine.ingest(event('gesture', 300, 'Give', { confidence: null, confidenceKind: 'unavailable' }), 300);
  const context = engine.snapshot(300);
  assert.deepEqual(context.summary, {
    expression: 'happiness', activeGesture: 'Give', gazeTarget: 'apple',
    gazeDirection: 'left', gazeDurationMs: 300, headDirection: 'center',
  });
  assert.equal(context.quality.coverage, 1);
  assert.equal(context.signals.gesture.confidence, null);
  assert.equal(context.signals.gaze.stability, 1);
});

test('one isolated sample cannot become stable by waiting', () => {
  const engine = new FusionEngine();
  engine.ingest(event('gaze', 0, gaze), 0);
  const signal = engine.snapshot(400).signals.gaze;
  assert.equal(signal.status, 'pending');
  assert.equal(signal.value, null);
  assert.equal(signal.durationMs, 0);
});

test('weak confidence immediately clears a previously confirmed state', () => {
  const engine = new FusionEngine();
  feed(engine, 'expression', 'happiness');
  engine.ingest(event('expression', 400, 'anger', { confidence: 0.2 }), 400);
  assert.equal(engine.snapshot(400).summary.expression, null);
  assert.equal(engine.snapshot(400).signals.expression.reason, 'low_confidence');
});

test('new direction does not inherit duration or retain the previous target', () => {
  const engine = new FusionEngine();
  feed(engine, 'gaze', gaze);
  engine.ingest(event('gaze', 450, { direction: 'right', targetId: 'star' }), 450);
  assert.equal(engine.snapshot(450).summary.gazeTarget, null);
  assert.equal(engine.snapshot(450).signals.gaze.durationMs, 0);
  feed(engine, 'gaze', { direction: 'right', targetId: 'star' }, [600, 750]);
  assert.equal(engine.snapshot(750).summary.gazeTarget, 'star');
  assert.equal(engine.snapshot(750).summary.gazeDurationMs, 300);
});

test('missing source does not destroy the other channels and recovers with new evidence', () => {
  const engine = new FusionEngine();
  feed(engine, 'gaze', gaze);
  engine.ingest(event('expression', 300, null, { status: 'missing', reason: 'no_face' }), 300);
  assert.equal(engine.snapshot(300).summary.gazeTarget, 'apple');
  assert.equal(engine.snapshot(300).signals.expression.status, 'missing');
  feed(engine, 'expression', 'neutral', [400, 550, 700]);
  assert.equal(engine.snapshot(700).summary.expression, 'neutral');
});

test('state expires without events; reacquisition does not bridge a tracking gap', () => {
  const engine = new FusionEngine();
  feed(engine, 'gaze', gaze);
  assert.equal(engine.snapshot(1051).signals.gaze.status, 'stale');
  feed(engine, 'gaze', gaze, [1100, 1250, 1400]);
  assert.equal(engine.snapshot(1400).summary.gazeDurationMs, 300);
});

test('gesture survives idle frames but expires based on its own detection time', () => {
  const engine = new FusionEngine();
  engine.ingest(event('gesture', 0, 'Hello'), 0);
  engine.ingest(event('gesture', 600, null, { status: 'idle' }), 600);
  assert.equal(engine.snapshot(600).summary.activeGesture, 'Hello');
  engine.ingest(event('gesture', 1201, null, { status: 'idle' }), 1201);
  assert.equal(engine.snapshot(1201).summary.activeGesture, null);
  assert.equal(engine.snapshot(1201).signals.gesture.status, 'idle');
});

test('duplicate and out-of-order samples cannot confirm or overwrite a state', () => {
  const engine = new FusionEngine();
  engine.ingest(event('gaze', 100, gaze), 100);
  assert.deepEqual(engine.ingest(event('gaze', 100, gaze), 150), { accepted: false, reason: 'out_of_order' });
  assert.deepEqual(engine.ingest(event('gaze', 90, { direction: 'right', targetId: null }), 200), { accepted: false, reason: 'out_of_order' });
  assert.equal(engine.snapshot(400).summary.gazeTarget, null);
});

test('rejects future/expired timestamps and backwards session clocks', () => {
  const engine = new FusionEngine();
  assert.equal(engine.ingest(event('expression', 5000, 'neutral'), 0).reason, 'future_event');
  assert.equal(engine.ingest(event('expression', 0, 'neutral'), 3000).reason, 'outside_window');
  assert.throws(() => engine.snapshot(2000), /clock/i);
});

test('history stays bounded while continuous observed duration exceeds the window', () => {
  const engine = new FusionEngine();
  for (let t = 0; t <= 5000; t += 5) engine.ingest(event('gaze', t, gaze), t);
  const context = engine.snapshot(5000);
  assert.equal(context.summary.gazeDurationMs, 5000);
  assert.ok(context.signals.gaze.sampleCount <= 256);
  assert.equal(context.windowMs, 2000);
});

test('input/output mutation cannot alter internal state and reset clears the lesson', () => {
  const engine = new FusionEngine();
  const input = event('gaze', 0, { ...gaze });
  engine.ingest(input, 0);
  input.value.targetId = 'wrong';
  feed(engine, 'gaze', gaze, [150, 300]);
  const context = engine.snapshot(300);
  context.signals.gaze.value.targetId = 'wrong';
  assert.equal(engine.snapshot(300).summary.gazeTarget, 'apple');
  engine.reset();
  assert.equal(engine.snapshot(0).quality.coverage, 0);
});

test('malformed input fails explicitly rather than introducing NaN or false confidence', () => {
  const engine = new FusionEngine();
  for (const bad of [
    event('other', 0, 'x'), event('gaze', NaN, gaze),
    event('expression', 0, 'neutral', { confidence: 2 }),
    event('head_pose', 0, { direction: 'left', yaw: Infinity, pitch: 0, roll: 0 }),
    event('gesture', 0, 'Open_Palm'),
    event('expression', 0, 'neutral', { confidence: null }),
  ]) assert.throws(() => engine.ingest(bad, 0), /event|confidence|signal|value|timestamp/i);
  assert.throws(() => new FusionEngine({ windowMs: -1 }), /option/i);
});
