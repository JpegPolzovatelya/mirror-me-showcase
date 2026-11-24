import { PLAYABLE_EMOTIONS } from "./emotions.js";

export const OBSERVATION_STATUS = {
  OK: "ok",
  NO_FACE: "no_face",
  UNCERTAIN: "uncertain",
  MODEL_UNAVAILABLE: "model_unavailable",
  CAMERA_UNAVAILABLE: "camera_unavailable",
};

export const SESSION_PHASE = {
  IDLE: "idle",
  RUNNING: "running",
  FEEDBACK: "feedback",
  COMPLETE: "complete",
  STOPPED: "stopped",
};

const DEFAULTS = {
  taskCount: 3,
  taskDurationMs: 30_000,
  confirmDurationMs: 1_000,
  confidenceThreshold: 0.55,
  feedbackDurationMs: 1_200,
};

export class EmotionSession {
  constructor(options = {}) {
    this.options = { ...DEFAULTS, ...options };
    this.rng = options.rng ?? Math.random;
    this.reset();
  }

  reset() {
    this.phase = SESSION_PHASE.IDLE;
    this.tasks = [];
    this.currentIndex = 0;
    this.score = 0;
    this.currentStartedAt = 0;
    this.feedbackUntil = 0;
    this.stableStartedAt = null;
    this.stableProgressMs = 0;
    this.lastObservation = null;
    this.lastOutcome = null;
  }

  start(nowMs = performanceNow()) {
    this.tasks = selectSessionTasks(
      PLAYABLE_EMOTIONS,
      this.options.taskCount,
      this.rng,
    );
    this.currentIndex = 0;
    this.score = 0;
    this.phase = SESSION_PHASE.RUNNING;
    this.currentStartedAt = nowMs;
    this.feedbackUntil = 0;
    this.stableStartedAt = null;
    this.stableProgressMs = 0;
    this.lastObservation = null;
    this.lastOutcome = null;
    return this.snapshot(nowMs);
  }

  stop(nowMs = performanceNow()) {
    this.phase = SESSION_PHASE.STOPPED;
    this.feedbackUntil = 0;
    this.stableStartedAt = null;
    this.stableProgressMs = 0;
    this.lastOutcome = {
      success: false,
      reason: "stopped",
      at: nowMs,
    };
    return this.snapshot(nowMs);
  }

  tick(nowMs = performanceNow()) {
    if (this.phase === SESSION_PHASE.FEEDBACK && nowMs >= this.feedbackUntil) {
      this.advanceAfterFeedback(nowMs);
    }

    if (this.phase === SESSION_PHASE.RUNNING && this.remainingMs(nowMs) <= 0) {
      this.finishTask(false, "timeout", nowMs);
    }

    return this.snapshot(nowMs);
  }

  observe(observation, nowMs = performanceNow()) {
    this.tick(nowMs);
    if (this.phase !== SESSION_PHASE.RUNNING) {
      return this.snapshot(nowMs);
    }

    const normalized = normalizeObservation(observation);
    this.lastObservation = normalized;

    if (!this.isConfirmingObservation(normalized)) {
      this.stableStartedAt = null;
      this.stableProgressMs = 0;
      return this.snapshot(nowMs);
    }

    if (this.stableStartedAt === null) {
      this.stableStartedAt = nowMs;
      this.stableProgressMs = 0;
      return this.snapshot(nowMs);
    }

    this.stableProgressMs = Math.max(0, nowMs - this.stableStartedAt);
    if (this.stableProgressMs >= this.options.confirmDurationMs) {
      this.finishTask(true, "confirmed", nowMs);
    }

    return this.snapshot(nowMs);
  }

  isConfirmingObservation(observation) {
    return (
      observation.status === OBSERVATION_STATUS.OK &&
      observation.label === this.currentTask() &&
      observation.confidence >= this.options.confidenceThreshold
    );
  }

  finishTask(success, reason, nowMs) {
    if (success) {
      this.score += 1;
    }
    this.phase = SESSION_PHASE.FEEDBACK;
    this.feedbackUntil = nowMs + this.options.feedbackDurationMs;
    this.lastOutcome = {
      success,
      reason,
      target: this.currentTask(),
      at: nowMs,
    };
    this.stableStartedAt = null;
    this.stableProgressMs = 0;
  }

  advanceAfterFeedback(nowMs) {
    this.currentIndex += 1;
    if (this.currentIndex >= this.tasks.length) {
      this.phase = SESSION_PHASE.COMPLETE;
      return;
    }
    this.phase = SESSION_PHASE.RUNNING;
    this.currentStartedAt = nowMs;
    this.feedbackUntil = 0;
    this.stableStartedAt = null;
    this.stableProgressMs = 0;
    this.lastObservation = null;
  }

  currentTask() {
    return this.tasks[this.currentIndex] ?? null;
  }

  elapsedMs(nowMs = performanceNow()) {
    return Math.max(0, nowMs - this.currentStartedAt);
  }

  remainingMs(nowMs = performanceNow()) {
    if (this.phase !== SESSION_PHASE.RUNNING) return 0;
    return Math.max(0, this.options.taskDurationMs - this.elapsedMs(nowMs));
  }

  snapshot(nowMs = performanceNow()) {
    const task = this.currentTask();
    const progressRatio = clamp01(
      this.stableProgressMs / this.options.confirmDurationMs,
    );
    return {
      phase: this.phase,
      tasks: [...this.tasks],
      currentIndex: this.currentIndex,
      task,
      score: this.score,
      taskCount: this.tasks.length || this.options.taskCount,
      remainingMs: this.remainingMs(nowMs),
      stableProgressMs: this.stableProgressMs,
      progressRatio,
      lastObservation: this.lastObservation,
      lastOutcome: this.lastOutcome,
      confidenceThreshold: this.options.confidenceThreshold,
    };
  }
}

export function selectSessionTasks(pool, count, rng = Math.random) {
  if (!Array.isArray(pool) || pool.length === 0) {
    throw new Error("emotion pool is required");
  }
  if (count < 1 || count > pool.length) {
    throw new Error("task count must fit the emotion pool");
  }
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

export function normalizeObservation(value = {}) {
  const status = value.status ?? OBSERVATION_STATUS.UNCERTAIN;
  const confidence = Number.isFinite(value.confidence) ? value.confidence : 0;
  return {
    status,
    label: value.label ?? null,
    confidence: clamp01(confidence),
    latencyMs: Number.isFinite(value.latencyMs) ? Math.max(0, value.latencyMs) : null,
    source: value.source ?? "unknown",
  };
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function performanceNow() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
