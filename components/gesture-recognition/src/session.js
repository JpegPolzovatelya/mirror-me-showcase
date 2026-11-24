import { TASKS } from './gestures.js?v=approved-four-4';

export class GestureSession {
  constructor({rng = Math.random} = {}) { this.rng = rng; this.durationMs=30000; this.reset(); }
  setDuration(ms) {
    if(this.phase==='idle')this.durationMs=Number.isFinite(ms)?Math.min(120000,Math.max(10000,Math.round(ms/5000)*5000)):30000;
  }
  reset() {
    this.phase = 'idle'; this.tasks = []; this.index = 0;
    this.correctCount = 0;
    this.deadline = 0; this.success = null; this.clearHold();
  }
  clearHold() { this.since = null; this.last = null; this.progress = 0; }
  get task() { return this.tasks[this.index]; }
  start(time) {
    if (['countdown','running','feedback','paused'].includes(this.phase)) return;
    this.reset(); const pool = Object.keys(TASKS);
    for (let i=pool.length-1;i>0;i--) { const j=Math.floor(this.rng()*(i+1)); [pool[i],pool[j]]=[pool[j],pool[i]]; }
    this.tasks=pool.slice(0,3); this.countdown(time);
  }
  countdown(time) { this.phase='countdown'; this.deadline=time+10000; this.success=null; this.clearHold(); }
  tick(time) {
    if (this.phase==='feedback' && time>=this.deadline) {
      this.index++;
      if(this.index===this.tasks.length) this.phase='complete'; else this.countdown(time);
    }
    if (this.phase==='countdown' && time>=this.deadline) { this.phase='running'; this.deadline=time+this.durationMs; }
    if (this.phase==='running' && time>=this.deadline) this.finish(false,time);
  }
  observe(label,time) {
    this.tick(time); if(this.phase!=='running')return;
    if(label!==this.task) { this.clearHold(); return; }
    if(Object.hasOwn(TASKS,label)) { this.finish(true,time); return; }
    if(this.last===null || time-this.last>500 || time<this.last) this.since=time;
    this.last=time; this.progress=Math.min(1,(time-this.since)/1000);
    if(this.progress===1)this.finish(true,time);
  }
  finish(success,time) {
    if(this.phase!=='running')return;
    if(success)this.correctCount++;
    this.phase='feedback';this.success=success;this.deadline=time+(success?2000:3000);this.clearHold();
  }
  remaining(time) { return this.phase==='paused' ? this.savedRemaining : Math.max(0,this.deadline-time); }
  pause(time) {
    if(!['countdown','running','feedback'].includes(this.phase))return;
    this.savedRemaining=this.remaining(time);this.savedPhase=this.phase;this.phase='paused';this.clearHold();
  }
  resume(time) { if(this.phase==='paused'){this.phase=this.savedPhase;this.deadline=time+this.savedRemaining;} }
}
