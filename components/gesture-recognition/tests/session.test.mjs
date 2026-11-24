import test from 'node:test';
import assert from 'node:assert/strict';
import {GestureSession} from '../src/session.js';
test('only four approved gestures can appear; three distinct per session',()=>{
 const seen=new Set();
 for(let seed=1;seed<=50;seed++){let n=seed*100003;const s=new GestureSession({rng:()=>((n=n*16807%2147483647)/2147483647)});s.start(0);assert.equal(s.tasks.length,3);assert.equal(new Set(s.tasks).size,3);s.tasks.forEach(t=>seen.add(t));}
 assert.deepEqual([...seen].sort(),['Give','Goodbye','Hello','Take'].sort());
});
test('preparation then selected duration, timeouts advance all three without hands',()=>{
 const s=new GestureSession();assert.equal(s.durationMs,30000);assert.equal(typeof s.setDuration,'function');s.setDuration(45000);
 s.start(0);s.tick(10000);assert.equal(s.remaining(10000),45000);s.tick(54999);assert.equal(s.phase,'running');s.tick(55000);assert.equal(s.success,false);
 s.tick(58000);assert.equal(s.index,1);s.tick(68000);s.tick(113000);s.tick(116000);s.tick(126000);s.tick(171000);s.tick(174000);assert.equal(s.phase,'complete');
});
test('time controls clamp, step and cannot change an active session',()=>{
 const s=new GestureSession();assert.equal(typeof s.setDuration,'function');
 s.setDuration(33000);assert.equal(s.durationMs,35000);s.setDuration(0);assert.equal(s.durationMs,10000);
 s.setDuration(999999);assert.equal(s.durationMs,120000);s.setDuration(NaN);assert.equal(s.durationMs,30000);
 s.start(0);s.setDuration(10000);assert.equal(s.durationMs,30000);
 s.reset();assert.equal(s.durationMs,30000);
});
test('all four complete motion events count immediately, wrong events never do',()=>{
 for(const target of ['Give','Take','Hello','Goodbye']){
 const s=new GestureSession();s.start(0);s.tasks=[target,'Hello','Goodbye'];s.tick(10000);
 s.observe('Open_Palm',10100);s.observe('Victory',11500);assert.equal(s.phase,'running');
 s.observe(target,11600);assert.equal(s.success,true);s.tick(13600);assert.equal(s.phase,'countdown');
 }
});
test('pause preserves time; preparation and late detection cannot count',()=>{
 const s=new GestureSession();s.start(0);s.observe(s.task,500);assert.equal(s.phase,'countdown');
 s.tick(10000);s.pause(10500);assert.equal(s.remaining(90000),29500);s.resume(90000);assert.equal(s.remaining(90000),29500);
 s.observe(s.task,119500);assert.equal(s.success,false);s.pause(120000);s.resume(150000);s.tick(152500);assert.equal(s.phase,'countdown');
});
test('result counts each successful task once and resets for a new lesson',()=>{
 const s=new GestureSession();s.start(0);assert.equal(s.correctCount,0);
 s.observe(s.task,500);assert.equal(s.correctCount,0);
 s.tick(10000);s.observe(s.task,10100);s.observe(s.task,10200);
 assert.equal(s.correctCount,1);
 s.pause(10300);s.resume(11000);assert.equal(s.correctCount,1);
 s.tick(12800);s.tick(22800);s.tick(52800);assert.equal(s.correctCount,1);
 s.tick(55800);s.tick(65800);s.observe(s.task,65900);s.tick(67900);
 assert.equal(s.phase,'complete');assert.equal(s.correctCount,2);
 s.start(68000);assert.equal(s.correctCount,0);
});
