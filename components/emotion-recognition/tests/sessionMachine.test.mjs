import test from "node:test";
import assert from "node:assert/strict";
import {
  EmotionSession,
  OBSERVATION_STATUS,
  SESSION_PHASE,
  selectSessionTasks,
} from "../src/domain/sessionMachine.js";
import { PLAYABLE_EMOTIONS } from "../src/domain/emotions.js";

test("selects three tasks from the existing five expression classes", () => {
  const tasks = selectSessionTasks(PLAYABLE_EMOTIONS, 3, () => 0.1);
  assert.equal(tasks.length, 3);
  assert.equal(new Set(tasks).size, 3);
  assert.ok(tasks.every((task) => PLAYABLE_EMOTIONS.includes(task)));
});

test("requires continuous target confirmation before success", () => {
  const session = new EmotionSession({
    rng: () => 0,
    confirmDurationMs: 1_000,
    taskDurationMs: 30_000,
  });
  const first = session.start(0).task;

  let snapshot = session.observe(
    { status: OBSERVATION_STATUS.OK, label: first, confidence: 0.9 },
    100,
  );
  assert.equal(snapshot.phase, SESSION_PHASE.RUNNING);
  assert.equal(snapshot.score, 0);
  assert.equal(snapshot.progressRatio, 0);

  snapshot = session.observe(
    { status: OBSERVATION_STATUS.OK, label: first, confidence: 0.9 },
    1_099,
  );
  assert.equal(snapshot.phase, SESSION_PHASE.RUNNING);
  assert.equal(snapshot.score, 0);

  snapshot = session.observe(
    { status: OBSERVATION_STATUS.OK, label: first, confidence: 0.9 },
    1_100,
  );
  assert.equal(snapshot.phase, SESSION_PHASE.FEEDBACK);
  assert.equal(snapshot.score, 1);
  assert.equal(snapshot.lastOutcome.reason, "confirmed");
});

test("does not count no-face, uncertainty, or a different expression", () => {
  const session = new EmotionSession({
    rng: () => 0,
    confirmDurationMs: 500,
    taskDurationMs: 30_000,
  });
  const first = session.start(0).task;
  const different = PLAYABLE_EMOTIONS.find((emotion) => emotion !== first);

  session.observe(
    { status: OBSERVATION_STATUS.OK, label: first, confidence: 0.95 },
    100,
  );
  session.observe(
    { status: OBSERVATION_STATUS.NO_FACE, label: null, confidence: 0 },
    400,
  );
  assert.equal(session.snapshot(400).progressRatio, 0);

  session.observe(
    { status: OBSERVATION_STATUS.OK, label: first, confidence: 0.95 },
    500,
  );
  session.observe(
    { status: OBSERVATION_STATUS.UNCERTAIN, label: first, confidence: 0.2 },
    800,
  );
  assert.equal(session.snapshot(800).score, 0);
  assert.equal(session.snapshot(800).progressRatio, 0);

  session.observe(
    { status: OBSERVATION_STATUS.OK, label: different, confidence: 0.95 },
    1_000,
  );
  session.observe(
    { status: OBSERVATION_STATUS.OK, label: different, confidence: 0.95 },
    1_800,
  );
  assert.equal(session.snapshot(1_800).phase, SESSION_PHASE.RUNNING);
  assert.equal(session.snapshot(1_800).score, 0);
});

test("times out without awarding a task", () => {
  const session = new EmotionSession({
    rng: () => 0,
    taskDurationMs: 1_000,
    feedbackDurationMs: 250,
  });
  session.start(0);
  const snapshot = session.tick(1_001);
  assert.equal(snapshot.phase, SESSION_PHASE.FEEDBACK);
  assert.equal(snapshot.score, 0);
  assert.equal(snapshot.lastOutcome.reason, "timeout");
});

test("advances through three tasks and completes", () => {
  const session = new EmotionSession({
    rng: () => 0,
    confirmDurationMs: 10,
    feedbackDurationMs: 5,
  });
  let snapshot = session.start(0);

  for (let index = 0; index < 3; index += 1) {
    const task = snapshot.task;
    session.observe(
      { status: OBSERVATION_STATUS.OK, label: task, confidence: 0.9 },
      index * 100 + 1,
    );
    snapshot = session.observe(
      { status: OBSERVATION_STATUS.OK, label: task, confidence: 0.9 },
      index * 100 + 11,
    );
    assert.equal(snapshot.phase, SESSION_PHASE.FEEDBACK);
    snapshot = session.tick(index * 100 + 20);
  }

  assert.equal(snapshot.phase, SESSION_PHASE.COMPLETE);
  assert.equal(snapshot.score, 3);
});
