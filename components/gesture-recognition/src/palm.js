const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const length=p=>Math.hypot(p.x,p.y,p.z);

// Model-space coordinates: x right, y down, z away from camera.
// Use RAW MediaPipe handedness (selfie convention); CSS mirroring is display-only.
export function palmDirection(hand) {
  if(!hand || !['Left','Right'].includes(hand.hand))return {direction:'unknown'};
  const p=hand.worldLandmarks;
  if(!Array.isArray(p)||p.length!==21||p.some(v=>!v||!['x','y','z'].every(k=>Number.isFinite(v[k]))))return {direction:'unknown'};
  const a=sub(p[5],p[0]),b=sub(p[17],p[0]);
  const cross={x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x};
  const norm=length(cross),spread=length(a)*length(b);
  if(spread<1e-10||norm/spread<.15)return {direction:'unknown'};
  const sign=hand.hand==='Left'?1:-1;
  const normal={x:sign*cross.x/norm,y:sign*cross.y/norm,z:sign*cross.z/norm};
  // Reject diagonal, downward, and back-facing palms instead of guessing the task.
  const direction=normal.y<-.7&&Math.abs(normal.y)>Math.abs(normal.z)+.15?'up':normal.z<-.7&&Math.abs(normal.z)>Math.abs(normal.y)+.15?'camera':'unknown';
  return {direction,normal};
}
