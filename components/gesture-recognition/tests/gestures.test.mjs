import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyModel, classifyGeometry, normalizeLandmarks, interpretResult, StableGesture, computeMetrics } from '../src/gestures.js';

test('unsupported and uncertain gestures remain unknown', () => {
  assert.equal(classifyModel([{ categoryName: 'Thumb_Up', score: .9 }, { categoryName: 'Closed_Fist', score: .7 }]).gesture, 'unknown');
  assert.equal(classifyModel([{ categoryName: 'Open_Palm', score: .6 }]).gesture, 'unknown');
  for (const categoryName of ['Open_Palm', 'Closed_Fist', 'Victory']) assert.equal(classifyModel([{ categoryName, score: .9 }]).gesture, categoryName);
});
test('empty detections produce none, not the last known gesture', () => {
  assert.deepEqual(interpretResult({}, { timestamp: 123 }), { timestamp: 123, status: 'none', hands: [] });
  const state = new StableGesture(450);
  assert.equal(state.update('Victory', 0), 'unknown'); assert.equal(state.update('Victory', 500), 'Victory');
  assert.equal(state.update('none', 510), 'none'); assert.equal(state.update('Victory', 520), 'unknown');
  assert.equal(state.update('Closed_Fist', 1000), 'unknown'); assert.equal(state.update('Closed_Fist', 1450), 'Closed_Fist');
});
function fixture(fingers, thumbOpen = false) {
  const p = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  p[1] = { x: -.2, y: .3, z: 0 }; p[2] = { x: -.45, y: .55, z: 0 }; p[3] = { x: -.65, y: .75, z: 0 }; p[4] = thumbOpen ? { x: -.9, y: 1, z: 0 } : { x: -.25, y: .9, z: 0 };
  [5,9,13,17].forEach((b, i) => {
    const x = (i - 1) * .25; p[b] = { x, y: 1, z: 0 }; p[b + 1] = { x, y: 1.5, z: 0 };
    p[b + 2] = { x, y: fingers[i] ? 1.8 : 1.2, z: fingers[i] ? 0 : .1 }; p[b + 3] = { x, y: fingers[i] ? 2.1 : 1.05, z: fingers[i] ? 0 : .1 };
  }); return p;
}
test('geometry separates three ideal synthetic poses under rotation, reflection, translation and scale', () => {
  for (const [pose, expected] of [[fixture([1,1,1,1], true), 'Open_Palm'], [fixture([0,0,0,0]), 'Closed_Fist'], [fixture([1,1,0,0]), 'Victory'], [fixture([1,0,0,0]), 'Pointing_Up']]) {
    for (const transformed of [pose, pose.map(p => ({ x: 8 - 3 * p.y, y: 2 + 3 * p.x, z: 3 * p.z })), pose.map(p => ({ ...p, x: -p.x }))]) {
      const result = classifyGeometry(transformed); assert.equal(result.gesture, expected); assert.equal(result.confidence, null);
    }
  }
});
test('geometry exposes the measured finger and thumb values used by its gates', () => {
  const result = classifyGeometry(fixture([1,1,1,1], true));
  assert.equal(result.features.fingerMetrics.length, 4);
  for (const metric of result.features.fingerMetrics) {
    assert.ok(Number.isFinite(metric.bend));
    assert.ok(Number.isFinite(metric.reach));
    assert.ok(metric.bend > 155);
    assert.ok(metric.reach > 1.15);
  }
  assert.ok(Number.isFinite(result.features.thumbBend));
  assert.ok(Number.isFinite(result.features.thumbTipDistance));
});
test('bad landmarks and other finger patterns are unknown', () => {
  assert.equal(normalizeLandmarks([]), null);
  assert.equal(classifyGeometry(Array(21).fill({ x: 0, y: 0, z: 0 })).gesture, 'unknown');
  assert.equal(classifyGeometry(fixture([0,1,0,0])).gesture, 'unknown');
  const bad = fixture([1,1,1,1], true); bad[2].z = NaN; assert.equal(classifyGeometry(bad).gesture, 'unknown');
});
test('metrics count rejected and absent hands as errors for labeled gestures', () => {
  const samples = [{ expected: 'Open_Palm', model: 'Open_Palm' }, { expected: 'Open_Palm', model: 'unknown' }, { expected: 'Closed_Fist', model: 'none' }, { expected: 'Closed_Fist', model: 'Closed_Fist' }];
  const result = computeMetrics(samples, 'model'); assert.equal(result.accuracy, .5); assert.equal(result.macroF1, 2 / 3); assert.equal(result.count, 4); assert.equal(result.completeCoverage, false);
  assert.equal(computeMetrics([], 'model').accuracy, null);
});
