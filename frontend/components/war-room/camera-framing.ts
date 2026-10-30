import {MathUtils,Vector3} from 'three';

// Fit the complete response floor, including the perimeter NPC paths and consoles.
// Horizontal FOV matters on phones; a fixed camera distance crops the room there.
export function responseFraming(floor:number,aspect:number,fov:number){
 const base=(floor-1)*5.5,target=new Vector3(0,base+1.6,0);
 const direction=new Vector3(0,.95,1).normalize(),right=new Vector3(1,0,0),up=new Vector3().crossVectors(direction,right);
 const tanV=Math.tan(MathUtils.degToRad(fov)/2),tanH=tanV*Math.max(.1,aspect);
 let distance=0;
 for(const x of [-10.3,10.3])for(const y of [base-.4,base+4.7])for(const z of [-7.3,7.3]){
  const relative=new Vector3(x,y,z).sub(target),depth=relative.dot(direction);
  distance=Math.max(distance,Math.abs(relative.dot(right))*1.13/tanH+depth,Math.abs(relative.dot(up))*1.13/tanV+depth);
 }
 return {target,position:target.clone().addScaledVector(direction,distance),distance};
}
