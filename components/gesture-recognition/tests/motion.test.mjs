import test from 'node:test';
import assert from 'node:assert/strict';
import {GestureMotion} from '../src/motion.js';
import {hand} from './fixtures/hands.mjs';
import {classifyGeometry} from '../src/gestures.js';
function curl(d,facing,start=0,side='Left'){let labels=[];[true,false,true,false,true].forEach((open,i)=>{const h=hand({open,facing,side});labels.push(d.update(h,start+i*300));labels.push(d.update(h,start+i*300+120));});return labels;}
test('curling distinguishes Give palm-up from Goodbye palm-camera on either hand',()=>{
 for(const side of ['Left','Right'])for(const [facing,want]of [['up','Give'],['camera','Goodbye']]){
 const labels=curl(new GestureMotion(),facing,0,side);assert.equal(labels.at(-1),want);assert.ok(!labels.includes(want==='Give'?'Goodbye':'Give'));
 }
});
test('downward and back-facing palms cannot satisfy these exercises',()=>{
 for(const facing of ['down','back'])assert.ok(curl(new GestureMotion(),facing).every(v=>v===null));
});
test('orientation changes or missing hand discard partial curls',()=>{
 for(const mode of ['orientation','missing']){const d=new GestureMotion();
 [true,false,true].forEach((open,i)=>{d.update(hand({open,facing:'up'}),i*300);d.update(hand({open,facing:'up'}),i*300+120);});
 if(mode==='missing')d.update(null,800);
 for(const [t,open]of [[900,false],[1020,false],[1200,true],[1320,true]])assert.equal(d.update(hand({open,facing:mode==='orientation'?'camera':'up'}),t),null);
 }
});
test('stationary palm, one curl, and pointing/open alternation never complete Give',()=>{
 const d=new GestureMotion();for(let t=0;t<2000;t+=100)assert.equal(d.update(hand({facing:'up'}),t),null);
 for(const [t,open]of [[2000,false],[2120,false],[2300,true],[2420,true]])assert.equal(d.update(hand({open,facing:'up'}),t),null);
 const other=new GestureMotion();for(let i=0;i<5;i++){const h=hand({open:i%2===0,facing:'up'});if(i%2)h.baseline.features.fingers[0]='straight';assert.equal(other.update(h,i*300),null);assert.equal(other.update(h,i*300+120),null);}
});
test('waiting before curl does not consume motion window',()=>{
 const d=new GestureMotion();for(let t=0;t<4000;t+=100)d.update(hand({facing:'up'}),t);
 assert.equal(curl(d,'up',4000).at(-1),'Give');
});
test('lateral wave is Hello only facing camera',()=>{
 for(const facing of ['camera','up']){const d=new GestureMotion();const labels=[.4,.46,.52,.58,.52,.46,.4,.46,.52,.58].map((x,i)=>d.update(hand({x,facing}),i*100));
 assert.equal(labels.includes('Hello'),facing==='camera');assert.ok(!labels.includes('Take'));}
});
test('open palm moving toward camera yields Take; stationary or retreating does not',()=>{
 for(const growth of [0,.04,-.02]){const d=new GestureMotion();let labels=[];
 for(let i=0;i<15;i++)labels.push(d.update(hand({facing:'up',size:1+i*growth}),i*100));
 assert.equal(labels.includes('Take'),growth>0);
 assert.ok(!labels.includes('Give'));
 }
});
test('camera-facing growth and curled fingers are not Take',()=>{
 for(const args of [{facing:'camera',open:true},{facing:'up',open:false}]){const d=new GestureMotion();for(let i=0;i<12;i++)assert.notEqual(d.update(hand({...args,size:1+i*.04}),i*100),'Take');}
});
test('rotating palm in its own plane without approaching is not Take',()=>{
 const d=new GestureMotion();
 for(let i=0;i<5;i++){
  const h=hand({facing:'up'}),a=(60-i*3)*Math.PI/180;
  h.worldLandmarks=h.worldLandmarks.map(p=>({x:p.x*Math.cos(a)+p.z*Math.sin(a),y:p.y,z:-p.x*Math.sin(a)+p.z*Math.cos(a)}));
  h.landmarks=h.worldLandmarks.map(p=>({x:.5+p.x,y:.6+p.y,z:p.z}));h.baseline=classifyGeometry(h.worldLandmarks);
  assert.notEqual(d.update(h,i*100),'Take');
 }
});
