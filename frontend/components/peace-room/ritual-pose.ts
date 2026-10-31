export type RitualPoint=[number,number,number];
export type RitualPose={right:RitualPoint;left:RitualPoint;bow:number;head:number;palmUp:boolean;step:string};
const RIGHT:RitualPoint=[-.57,.82,.08],LEFT:RitualPoint=[.57,.82,.08];
const smooth=(t:number)=>{const n=Math.max(0,Math.min(1,t));return n*n*(3-2*n);};
const mix=(a:RitualPoint,b:RitualPoint,t:number):RitualPoint=>a.map((n,i)=>n+(b[i]-n)*smooth(t)) as RitualPoint;
export const CROSS_POINTS:readonly RitualPoint[]=[RIGHT,[0,2.15,.34],[0,1.24,.42],[.43,1.4,.22],[-.43,1.4,.22],[-.085,1.24,.46]];
const STEPS=['forehead','chest','left-shoulder','right-shoulder','rest'];
/** Actor-local coordinates: the right arm is negative X, the left shoulder positive X. */
export function ritualPose(kind:string,elapsedMs:number,reduced=false,beadStep=0):RitualPose{
 const elapsed=Math.max(0,elapsedMs);
 const pose:RitualPose={right:[...RIGHT],left:[...LEFT],bow:0,head:0,palmUp:false,step:'rest'};
 if(kind==='cross'){
  if(reduced||elapsed>=4000)return {...pose,right:[-.085,1.24,.46],left:[.085,1.24,.46],head:.08};
  const segment=Math.min(4,Math.floor(elapsed/800)),t=(elapsed%800)/500;
  return {...pose,right:mix(CROSS_POINTS[segment],CROSS_POINTS[segment+1],t),left:segment===4?mix(LEFT,[.085,1.24,.46],t):LEFT,head:.035,step:STEPS[segment]};
 }
 if(kind==='rosary'||kind==='beads'){
  const move=reduced?0:Math.sin(Math.min(1,elapsed/600)*Math.PI)*.065;
  return {...pose,right:[-.13,1.14+move,.46],left:[.16,1.11,.47],head:.09,step:`bead-${beadStep}`};
 }
 if(kind==='bow'){
  const bend=reduced?.18:elapsed<2500?Math.sin(Math.min(1,elapsed/2500)*Math.PI)*.37:0;
  return {...pose,right:[-.08,1.32,.49],left:[.08,1.32,.49],bow:bend,head:.13,step:'bow'};
 }
 if(kind==='prayer')return {...pose,right:[-.085,1.24,.46],left:[.085,1.24,.46],head:.16,step:'prayer'};
 if(kind==='dua')return {...pose,right:[-.23,1.28,.54],left:[.23,1.28,.54],head:.08,palmUp:true,step:'dua'};
 if(kind==='stone'){
  const t=reduced?.5:Math.min(1,elapsed/1300),reach=Math.sin(t*Math.PI);
  return {...pose,right:mix(RIGHT,[-.65,.61,.7],reach),bow:reach*.13,step:elapsed<1300?'placing':'rest'};
 }
 return pose;
}
