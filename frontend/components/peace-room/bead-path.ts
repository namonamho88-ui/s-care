export const BEAD_COUNT=28;
export const RX=92, RY=284, CX=180, CY=344;
const samples=1024;
const arc=[0];
for(let i=1;i<=samples;i++){const a=(i-1)*Math.PI*2/samples,b=i*Math.PI*2/samples;arc.push(arc[i-1]+Math.hypot(RX*(Math.sin(b)-Math.sin(a)),RY*(Math.cos(b)-Math.cos(a))));}
const length=arc[samples];
export function pathFraction(x:number,y:number){const a=(Math.atan2((x-CX)/RX,-(y-CY)/RY)+Math.PI*2)%(Math.PI*2),v=a/(Math.PI*2)*samples,i=Math.floor(v);return(arc[i]+(arc[i+1]-arc[i])*(v-i))/length;}
export function pathPoint(step:number){const d=((step/BEAD_COUNT)%1+1)%1*length;let lo=0,hi=samples;while(hi-lo>1){const mid=(lo+hi)>>1;if(arc[mid]<=d)lo=mid;else hi=mid;}const a=(lo+(d-arc[lo])/(arc[hi]-arc[lo]))/samples*Math.PI*2;return {x:CX+RX*Math.sin(a),y:CY-RY*Math.cos(a)};}
export function pathDelta(before:number,after:number){let d=after-before;if(d>.5)d-=1;if(d<-.5)d+=1;return d*BEAD_COUNT;}
export function crossedCount(position:number,count:number){const delta=position-count;return Math.max(0,count+(delta>=1?Math.floor(delta):delta<=-1?Math.ceil(delta):0));}
export function snapCount(position:number){return Math.max(0,Math.round(position));}
