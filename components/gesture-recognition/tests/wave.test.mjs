import test from 'node:test';
import assert from 'node:assert/strict';
import { WaveDetector, contextualGesture } from '../src/wave.js';
import { classifyModel } from '../src/gestures.js';

function hand(x) {
  const points = Array.from({length:21}, () => ({x, y:.5, z:0}));
  points[9].y = .3; points[5].x = x - .1; points[17].x = x + .1;
  return points;
}
const wave = [.4,.46,.52,.58,.52,.46,.4,.46,.52,.58];
function feed(detector, xs, gesture = 'Open_Palm', start = 0) {
  return xs.map((x,i) => detector.update(gesture, hand(x), start + i*100, 'Left'));
}
test('pointing finger is a supported model class', () => assert.equal(classifyModel([{categoryName:'Pointing_Up',score:.9}]).gesture, 'Pointing_Up'));
test('an open palm moving back and forth becomes a wave', () => {
  const results = feed(new WaveDetector(), wave);
  assert.equal(results[0], false); assert.equal(results.at(-1), true);
});
test('stationary palm, jitter, one-way movement and fist movement are not waves', () => {
  for (const xs of [Array(20).fill(.5), Array.from({length:20},(_,i)=>.5+(i%2)*.005), Array.from({length:20},(_,i)=>.1+i*.03)]) assert.ok(feed(new WaveDetector(),xs).every(value => !value));
  assert.ok(feed(new WaveDetector(),wave,'Closed_Fist').every(value => !value));
});
test('missing hand, long frame gap and handedness change reset motion history', () => {
  const detector = new WaveDetector(); feed(detector,wave);
  assert.equal(detector.update('none',null,1000,'Left'),false);
  assert.equal(detector.update('Open_Palm',hand(.5),1100,'Left'),false);
  feed(detector,wave,'Open_Palm',1200);
  assert.equal(detector.update('Open_Palm',hand(.5),4000,'Left'),false);
  feed(detector,wave,'Open_Palm',4200);
  assert.equal(detector.update('Open_Palm',hand(.5),5200,'Right'),false);
});
test('wave confirmation expires and cannot be transferred between tasks', () => {
  const detector = new WaveDetector(); feed(detector,wave);
  assert.equal(detector.update('Open_Palm',hand(.58),1000,'Left'),true);
  for(let t=1100;t<=1900;t+=100) detector.update('Open_Palm',hand(.58),t,'Left');
  assert.equal(detector.update('Open_Palm',hand(.58),2000,'Left'),false);
  detector.reset(); assert.equal(detector.update('Open_Palm',hand(.58),2100,'Left'),false);
});
test('a wave is a greeting, never a farewell chosen by context', () => {
  assert.equal(contextualGesture('Wave','Hello'),'Hello');
  assert.equal(contextualGesture('Wave','Goodbye'),'Hello');
  assert.equal(contextualGesture('Wave',null),'Hello');
  assert.equal(contextualGesture('Wave','Open_Palm'),'Hello');
  assert.equal(contextualGesture('Open_Palm','Hello'),'Open_Palm');
});
test('waving fingers around a stationary wrist is recognized', () => {
  const d = new WaveDetector();
  const results = wave.map((x,i) => { const p=hand(.5); [8,12,16,20].forEach(j=>p[j].x=x); return d.update('Open_Palm',p,i*100,'Left'); });
  assert.equal(results.at(-1),true);
});
test('standing still before a wave does not consume the movement window',()=>{
 const d=new WaveDetector();for(let t=0;t<2400;t+=100)d.update('Open_Palm',hand(.4),t,'Left');
 assert.equal(feed(d,wave,'Open_Palm',2400).at(-1),true);
});
