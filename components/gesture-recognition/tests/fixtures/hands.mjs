// Synthetic hand coordinates in MediaPipe image axes (x right, y down, z away).
// Left/Right are raw model labels, not physical hand names for an unmirrored feed.
export function hand({open=true,facing='camera',x=.5,size=1,side='Left'}={}){
 let p=Array.from({length:21},()=>({x:0,y:0,z:0}));
 p[1]={x:.03,y:-.025,z:0};p[2]={x:.05,y:-.05,z:0};p[3]={x:.07,y:-.07,z:0};p[4]={x:.09,y:-.09,z:0};
 [5,9,13,17].forEach((b,i)=>{
  const px=.045-i*.03;p[b]={x:px,y:-.08,z:0};p[b+1]={x:px,y:-.12,z:0};
  p[b+2]={x:px,y:open?-.15:-.10,z:open?0:-.03};
  p[b+3]={x:px,y:open?-.18:-.075,z:open?0:-.035};
 });
 if(facing==='up')p=p.map(v=>({x:v.x,y:v.z,z:-v.y}));
 if(facing==='down')p=p.map(v=>({x:v.x,y:-v.z,z:v.y}));
 if(facing==='back')p=p.map(v=>({x:-v.x,y:v.y,z:-v.z}));
 if(side==='Right')p=p.map(v=>({...v,x:-v.x}));
 return {hand:side,worldLandmarks:p,landmarks:p.map(v=>({x:x+v.x*size,y:.6+v.y*size,z:v.z*size})),model:{gesture:'unknown'},baseline:{features:{fingers:Array(4).fill(open?'straight':'bent')}}};
}
