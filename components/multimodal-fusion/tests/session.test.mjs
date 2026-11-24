import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionResults } from '../src/sessionResults.js';

const stage = (name, start, end, extra = {}) => ({
  stage: name, startedAtMs: start, endedAtMs: end, status: 'completed',
  taskCount: 3, successCount: 2, source: `test.${name}`, evidenceLevel: 'synthetic_test', ...extra,
});

test('stores ordered head, gaze, gesture, expression stages without treating them as simultaneous', () => {
  const session = new SessionResults('lesson-1');
  ['head_pose', 'gaze', 'gesture', 'expression'].forEach((name, i) => session.recordStage(stage(name, i * 1000, (i + 1) * 1000)));
  const result = session.snapshot();
  assert.equal(result.status, 'finished');
  assert.deepEqual(result.stages.map(row => row.stage), ['head_pose', 'gaze', 'gesture', 'expression']);
  assert.deepEqual(result.totals, { knownTaskCount: 12, knownSuccessCount: 8, hasUnmeasuredStages: false });
  assert.equal(result.durationMs, 4000);
  assert.equal(result.stages[0].evidenceLevel, 'synthetic_test');
});

test('partial session remains partial and unavailable stages do not become failures or success', () => {
  const session = new SessionResults('lesson-2');
  session.recordStage(stage('head_pose', 0, 1000));
  session.recordStage(stage('gaze', 1000, 1500, { status: 'unavailable', taskCount: null, successCount: null, evidenceLevel: 'not_measured' }));
  const result = session.snapshot();
  assert.equal(result.status, 'in_progress');
  assert.equal(result.nextStage, 'gesture');
  assert.equal(result.stages[1].successCount, null);
  assert.equal(result.totals.hasUnmeasuredStages, true);
});

test('rejects stage reordering, duplicates and overlapping time intervals', () => {
  const session = new SessionResults('lesson-3');
  assert.throws(() => session.recordStage(stage('gesture', 0, 1000)), /order/i);
  session.recordStage(stage('head_pose', 0, 1000));
  assert.throws(() => session.recordStage(stage('head_pose', 0, 1000)), /order/i);
  assert.throws(() => session.recordStage(stage('gaze', 900, 2000)), /time/i);
  assert.equal(session.snapshot().stages.length, 1);
});

test('validates counts and evidence; missing measurements remain null', () => {
  const session = new SessionResults('lesson-4');
  for (const extra of [
    { taskCount: 1, successCount: 2 }, { successCount: NaN },
    { evidenceLevel: 'real_accuracy' }, { source: '' },
    { taskCount: null, successCount: 1 }, { status: 'unavailable' },
    { endedAtMs: -1 },
  ]) assert.throws(() => session.recordStage(stage('head_pose', 0, 1000, extra)));
  session.recordStage(stage('head_pose', 0, 1000, { successCount: null, evidenceLevel: 'not_measured' }));
  assert.equal(session.snapshot().stages[0].successCount, null);
  assert.equal(session.snapshot().totals.knownSuccessCount, 0);
});

test('snapshots are JSON-safe independent copies with no unrecognized input fields', () => {
  const session = new SessionResults('lesson-5');
  const input = stage('head_pose', 0, 1000, { cameraFrame: 'must-not-be-retained' });
  session.recordStage(input);
  input.successCount = 0;
  const output = session.snapshot();
  output.stages[0].successCount = 0;
  assert.equal(session.snapshot().stages[0].successCount, 2);
  assert.equal(JSON.stringify(session.snapshot()).includes('cameraFrame'), false);
});

test('a finished session rejects even a malformed fifth stage without altering its totals', () => {
  const session = new SessionResults('lesson-finished');
  ['head_pose', 'gaze', 'gesture', 'expression'].forEach((name, i) => session.recordStage(stage(name, i * 1000, (i + 1) * 1000)));
  const before = session.snapshot();
  const fifth = stage(undefined, 4000, 5000);
  delete fifth.stage;
  assert.throws(() => session.recordStage(fifth), /stage/i);
  assert.deepEqual(session.snapshot(), before);
});

test('not_measured evidence cannot supply numeric successful outcomes', () => {
  const session = new SessionResults('lesson-unmeasured');
  assert.throws(() => session.recordStage(stage('head_pose', 0, 1000, { evidenceLevel: 'not_measured' })), /evidence|measured/i);
  assert.equal(session.snapshot().stages.length, 0);
});
