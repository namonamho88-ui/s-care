'use client';
import {useRef,type RefObject} from 'react';
import {useFrame} from '@react-three/fiber';
import {Html,RoundedBox} from '@react-three/drei';
import * as THREE from 'three';
import type {Player} from './types';
function Ball({at,scale,color}:{at:[number,number,number];scale:[number,number,number];color:string}){return <mesh position={at} scale={scale} castShadow><sphereGeometry args={[1,16,12]}/><meshStandardMaterial color={color} roughness={.8}/></mesh>;}
// Original procedural character: expressive face, sculpted hair, office clothes.
export default function OperatorAvatar({player,self,reduced,role,speech,portal}:{player:Player;self:boolean;reduced:boolean;role:string;speech?:string;portal?:RefObject<HTMLElement>}){
 const root=useRef<THREE.Group>(null),legs=useRef<(THREE.Group|null)[]>([]),arms=useRef<(THREE.Group|null)[]>([]),caption=useRef<HTMLSpanElement>(null),last=useRef(new THREE.Vector3(player.x,0,player.z)),moving=useRef(0);
 let hash=0;for(const c of player.id)hash=(hash*31+c.charCodeAt(0))>>>0;
 const style=player.appearance??hash;
 const shirt=new THREE.Color(['#4a83bb','#799679','#d18a65','#8882ad'][style%4]).offsetHSL(Math.floor((style%20)/4)*.045,0,0).getStyle(),skin=['#ebbc97','#d8a783','#c79070'][hash%3],hair=['#302a2a','#4a3126','#292e37'][style%3],longHair=style%3===1;
 useFrame((state,dt)=>{if(!root.current)return;const target=new THREE.Vector3(player.x,.06,player.z);root.current.position.lerp(target,1-Math.exp(-dt*15));const angle=THREE.MathUtils.euclideanModulo(player.direction-root.current.rotation.y+Math.PI,Math.PI*2)-Math.PI;root.current.rotation.y+=angle*(1-Math.exp(-dt*12));if(last.current.distanceTo(target)>.008)moving.current=.18;else moving.current=Math.max(0,moving.current-dt);last.current.copy(target);const stride=!reduced&&moving.current>0?Math.sin(state.clock.elapsedTime*10)*.4:0;legs.current.forEach((l,i)=>{if(l)l.rotation.x=stride*(i?-1:1);});arms.current.forEach((a,i)=>{if(a){a.rotation.x=-stride*(i?-1:1);a.rotation.z=(i?1:-1)*(speech&&!reduced?.35+Math.sin(state.clock.elapsedTime*4)*.12:.09);}});if(caption.current){caption.current.dataset.position=`${root.current.position.x.toFixed(2)},${root.current.position.z.toFixed(2)}`;caption.current.dataset.direction=root.current.rotation.y.toFixed(2);}});
 return <group ref={root} position={[player.x,.06,player.z]}>
  {[-1,1].map((side,i)=><group key={side} ref={v=>{legs.current[i]=v;}} position={[side*.19,.68,0]}><RoundedBox position={[0,-.26,0]} args={[.3,.64,.34]} radius={.11} smoothness={3} castShadow><meshStandardMaterial color="#34435a"/></RoundedBox><Ball at={[0,-.57,.1]} scale={[.19,.12,.3]} color="#283448"/><RoundedBox position={[0,-.66,.1]} args={[.35,.055,.5]} radius={.02} smoothness={2}><meshStandardMaterial color="#ded9d0"/></RoundedBox></group>)}
  <RoundedBox position={[0,1.1,0]} args={[.85,.88,.51]} radius={.2} smoothness={4} castShadow><meshStandardMaterial color={shirt}/></RoundedBox>
  <mesh position={[0,1.5,0]}><cylinderGeometry args={[.14,.15,.22,12]}/><meshStandardMaterial color={skin}/></mesh>
  {[-1,1].map((side,i)=><group key={side} ref={v=>{arms.current[i]=v;}} position={[side*.5,1.32,0]}><mesh position={[0,-.23,0]} castShadow><capsuleGeometry args={[.14,.35,5,12]}/><meshStandardMaterial color={shirt}/></mesh><Ball at={[0,-.53,.01]} scale={[.14,.17,.14]} color={skin}/></group>)}
  <Ball at={[0,1.94,0]} scale={[.48,.53,.43]} color={skin}/>
  {[-1,1].map(side=><Ball key={side} at={[side*.46,1.93,0]} scale={[.09,.15,.08]} color={skin}/>)}
  {longHair&&<Ball at={[0,1.88,-.19]} scale={[.51,.62,.32]} color={hair}/>}
  <mesh position={[0,2.12,-.05]} scale={[1,1.02,1]} castShadow><sphereGeometry args={[.49,24,16,0,Math.PI*2,0,Math.PI*.53]}/><meshStandardMaterial color={hair} roughness={.8}/></mesh>
  {[-.3,-.13,.05,.23].map((x,i)=><mesh key={x} position={[x,2.28-i*.035,.26]} rotation={[0,0,-.45]} scale={[.23,.13,.15]} castShadow><sphereGeometry args={[1,12,10]}/><meshStandardMaterial color={hair}/></mesh>)}
  {[-1,1].map(side=><group key={side}><Ball at={[side*.16,1.96,.386]} scale={[.077,.092,.035]} color="#fffaf3"/><Ball at={[side*.16,1.96,.416]} scale={[.041,.054,.021]} color="#30323a"/><Ball at={[side*.147,1.983,.433]} scale={[.012,.017,.007]} color="#ffffff"/><mesh position={[side*.16,2.1,.39]} rotation={[0,0,Math.PI/2+side*-.08]}><capsuleGeometry args={[.018,.095,3,8]}/><meshStandardMaterial color={hair}/></mesh><Ball at={[side*.29,1.81,.34]} scale={[.07,.035,.018]} color="#dc9c85"/></group>)}
  <Ball at={[0,1.86,.43]} scale={[.065,.073,.072]} color={skin}/><mesh position={[0,1.74,.403]} rotation={[0,0,Math.PI]}><torusGeometry args={[.083,.014,6,16,Math.PI]}/><meshStandardMaterial color="#8c5044"/></mesh>
  {[-1,1].map(side=><mesh key={side} position={[side*.1,1.45,.27]} rotation={[0,0,side*.6]}><boxGeometry args={[.13,.17,.035]}/><meshStandardMaterial color="#ecf0ec"/></mesh>)}
  <mesh position={[.18,1.02,.276]}><boxGeometry args={[.14,.2,.028]}/><meshStandardMaterial color="#f5f4e9"/></mesh><mesh position={[.18,1.05,.297]}><boxGeometry args={[.08,.045,.01]}/><meshBasicMaterial color="#317bc3"/></mesh>
  <mesh rotation={[-Math.PI/2,0,0]} position={[0,.01,0]}><ringGeometry args={[.48,.53,32]}/><meshBasicMaterial color={self?'#256bd1':'#869aaf'}/></mesh>
  <Html portal={portal} position={[0,2.75,0]} center style={{pointerEvents:'none',transform:'translate(-50%, -100%)'}}><div className="wr-avatar-caption">{speech&&<span className="mc-speech">{speech}</span>}<span ref={caption} data-player-id={player.id} data-appearance={style} className={`wr-name ${self?'self':''}`}>{self?'나 · ':''}{player.name}<small className="city-avatar-role">{role}</small></span></div></Html>
 </group>;
}
