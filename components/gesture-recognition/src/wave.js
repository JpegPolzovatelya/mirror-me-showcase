// Temporal heuristic on tracked open palms. It detects motion, not social intent.
export class WaveDetector {
  reset() {
    this.previous = null; this.position = 0; this.extreme = 0;
    this.direction = 0; this.swings = 0; this.started = null; this.confirmedUntil = -Infinity;
  }
  constructor() { this.reset(); }
  update(gesture, points, time, handedness = 'Unknown') {
    if (gesture !== 'Open_Palm' || !Number.isFinite(time) || !points || points.length !== 21 || [0,5,9,17,8,12,16,20].some(i => !points[i] || !Number.isFinite(points[i].x) || !Number.isFinite(points[i].y))) { this.reset(); return false; }
    const span = (a,b) => Math.hypot(points[a].x-points[b].x, points[a].y-points[b].y);
    const scale = Math.max(span(5,17), span(0,9));
    if (scale < .02) { this.reset(); return false; }
    if (this.previous && (time <= this.previous.time || time-this.previous.time > 350 || handedness !== this.previous.handedness || (this.started !== null && time-this.started > 2800))) this.reset();
    // Finger tips move during a wrist-pivot wave even when the wrist stays still.
    const current = {x:[8,12,16,20].reduce((sum,i)=>sum+points[i].x,0)/4, scale, time, handedness};
    if (!this.previous) { this.previous = current; return false; }
    const delta = (current.x-this.previous.x)/((scale+this.previous.scale)/2);
    this.previous = current;
    if (Math.abs(delta) > 2) { this.reset(); return false; }
    this.position += delta;
    const excursion = this.position-this.extreme;
    if (this.started === null && Math.abs(excursion) >= .15) this.started = time;
    let crossed = false;
    if (this.direction === 0 && Math.abs(excursion) >= .5) {
      this.direction = Math.sign(excursion); this.swings = 1; this.extreme = this.position;
    } else if (this.direction * excursion > 0) {
      this.extreme = this.position;
    } else if (this.direction !== 0 && this.direction * excursion <= -.5) {
      this.direction *= -1; this.extreme = this.position; this.swings++; crossed = true;
    }
    if (crossed && this.swings >= 3 && this.started !== null && time-this.started >= 600) this.confirmedUntil = time+700;
    return time <= this.confirmedUntil;
  }
}

export function contextualGesture(observed) {
  return observed === 'Wave' ? 'Hello' : observed;
}
