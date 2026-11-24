import { finiteTime, nonempty } from './events.js';

export const STAGE_ORDER = Object.freeze(['head_pose', 'gaze', 'gesture', 'expression']);
const EVIDENCE_LEVELS = ['measured_live', 'measured_fixture', 'synthetic_test', 'automated_test', 'not_measured'];
const validCount = value => value === null || (Number.isSafeInteger(value) && value >= 0);

export class SessionResults {
  #sessionId;
  #stages = [];

  constructor(sessionId) {
    if (!nonempty(sessionId)) throw new TypeError('A session ID is required');
    this.#sessionId = sessionId;
  }

  recordStage(result) {
    if (!result || this.#stages.length >= STAGE_ORDER.length ||
        !STAGE_ORDER.includes(result.stage) || result.stage !== STAGE_ORDER[this.#stages.length]) {
      throw new Error('Unexpected stage order or duplicate stage');
    }
    const { stage, startedAtMs, endedAtMs, status, taskCount, successCount, source, evidenceLevel } = result;
    if (!finiteTime(startedAtMs) || !finiteTime(endedAtMs) || endedAtMs < startedAtMs ||
        (this.#stages.length && startedAtMs < this.#stages.at(-1).endedAtMs)) throw new TypeError('Invalid stage time interval');
    if (!['completed', 'skipped', 'unavailable'].includes(status)) throw new TypeError('Invalid stage status');
    if (!validCount(taskCount) || !validCount(successCount) ||
        (successCount !== null && (taskCount === null || successCount > taskCount)) ||
        (status !== 'completed' && (taskCount !== null || successCount !== null))) throw new TypeError('Invalid stage counts');
    if (!nonempty(source) || !EVIDENCE_LEVELS.includes(evidenceLevel)) throw new TypeError('Invalid source or evidence level');
    if (evidenceLevel === 'not_measured' && successCount !== null) throw new TypeError('Unmeasured evidence requires a null successCount');
    this.#stages.push({ stage, startedAtMs, endedAtMs, status, taskCount, successCount, source, evidenceLevel });
  }

  snapshot() {
    const stages = structuredClone(this.#stages);
    return {
      schemaVersion: 1, kind: 'lesson_summary', sessionId: this.#sessionId,
      status: stages.length === STAGE_ORDER.length ? 'finished' : 'in_progress',
      nextStage: STAGE_ORDER[stages.length] ?? null,
      durationMs: stages.length ? stages.at(-1).endedAtMs - stages[0].startedAtMs : 0,
      stages,
      totals: {
        knownTaskCount: stages.reduce((sum, row) => sum + (row.taskCount ?? 0), 0),
        knownSuccessCount: stages.reduce((sum, row) => sum + (row.successCount ?? 0), 0),
        hasUnmeasuredStages: stages.length < STAGE_ORDER.length || stages.some(row => row.evidenceLevel === 'not_measured' || row.taskCount === null || row.successCount === null),
      },
    };
  }
}
