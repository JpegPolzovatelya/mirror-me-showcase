import { WaveDetector } from './wave.js?v=approved-four-4';
import { palmDirection } from './palm.js?v=approved-four-4';

// Agreed training movements. Orientation is observed, never inferred from the task.
export class GestureMotion {
 constructor(){this.wave=new WaveDetector();this.reset();}
 reset(){
  this.wave.reset();this.last=null;this.orientation=null;this.started=null;
  this.candidate=null;this.since=0;this.pose=null;this.armed=false;this.curled=false;this.cycles=0;this.offer=null;
 }
 update(hand,time){
  const facing=palmDirection(hand);
  if(!hand||!Number.isFinite(time)||hand.landmarks?.length!==21||facing.direction==='unknown'){this.reset();return null;}
  if(this.last&&(time<=this.last.time||time-this.last.time>450||hand.hand!==this.last.hand||facing.direction!==this.orientation||(this.started!==null&&time-this.started>4500)))this.reset();
  this.orientation=facing.direction;this.last={time,hand:hand.hand};
  const fingers=hand.baseline?.features?.fingers??[];
  const open=fingers.length===4&&fingers.every(f=>f==='straight');
  const closed=fingers.length===4&&fingers.every(f=>f==='bent');
  const pose=open?'open':closed?'closed':null;
  if(pose!==this.candidate){this.candidate=pose;this.since=time;}
  if(pose&&time-this.since>=100&&pose!==this.pose){
   this.pose=pose;
   if(pose==='open'){
    if(this.armed&&this.curled)this.cycles++;
    this.armed=true;this.curled=false;
    if(this.cycles>=2){const result=this.orientation==='up'?'Give':'Goodbye';this.reset();return result;}
   }else if(this.armed){this.curled=true;this.started??=time;}
  }
  if(this.orientation==='camera'){
   this.offer=null;
   if(this.wave.update(open?'Open_Palm':'unknown',hand.landmarks,time,hand.hand))return 'Hello';
  }else{
   this.wave.reset();
   // World landmarks are centered on the hand, so their z cannot measure approach.
   // Growth of projected palm width with an unchanged plane is a monocular proxy.
   const a=hand.landmarks[5],b=hand.landmarks[17],aspect=hand.imageAspect??1;
   const projected=Math.hypot((a.x-b.x)*aspect,a.y-b.y);
   const wa=hand.worldLandmarks[5],wb=hand.worldLandmarks[17];
   const worldProjected=Math.hypot(wa.x-wb.x,wa.y-wb.y);
   const span=projected/worldProjected;
   if(!open||this.curled||this.cycles||!Number.isFinite(span)||projected<.02||worldProjected<.005){this.offer=null;return null;}
   if(!this.offer)this.offer={span,time,normal:facing.normal,frames:0};
   const dot=['x','y','z'].reduce((v,k)=>v+this.offer.normal[k]*facing.normal[k],0);
   if(dot<.97||time-this.offer.time>3000||span<this.offer.span*.9){this.offer={span,time,normal:facing.normal,frames:0};return null;}
   this.offer.frames++;
   if(this.offer.frames>=4&&time-this.offer.time>=350&&span/this.offer.span>=1.3){this.reset();return 'Take';}
  }
  return null;
 }
}
