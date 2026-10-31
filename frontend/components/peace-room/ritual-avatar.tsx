'use client';
import {useRef,type RefObject} from 'react';
import {useFrame} from '@react-three/fiber';
import {Html,RoundedBox} from '@react-three/drei';
import * as THREE from 'three';
import {EMPTY_RITUAL,RITUAL_LABELS,type PeacePlayer} from './types';
import {gardenFloorY} from './hanok-garden';
import {ritualPose,type RitualPoint} from './ritual-pose';
type Vec=[number,number,number];
function Ball({at,scale,color}:{at:Vec;scale:Vec;color:string}){return <mesh position={at} scale={scale} castShadow><sphereGeometry args={[1,14,10]}/><meshStandardMaterial color={color} roughness={.85}/></mesh>;}
const Y=new THREE.Vector3(0,1,0);
function segment(mesh:THREE.Mesh|null,a:THREE.Vector3,b:THREE.Vector3){if(!mesh)return;mesh.position.copy(a).add(b).multiplyScalar(.5);const delta=b.clone().sub(a);mesh.scale.y=delta.length();mesh.quaternion.setFromUnitVectors(Y,delta.normalize());}
/** Separate original avatar; the incident-response character remains unchanged. */
export default function RitualAvatar({player,self,reduced,speech,portal,now}:{player:PeacePlayer;self:boolean;reduced:boolean;speech?:string;portal?:RefObject<HTMLElement>;now:number}){
 const root=useRef<THREE.Group>(null),upper=useRef<THREE.Group>(null),head=useRef<THREE.Group>(null),legs=useRef<(THREE.Group|null)[]>([]),sleeves=useRef<(THREE.Mesh|null)[]>([]),forearms=useRef<(THREE.Mesh|null)[]>([]),elbows=useRef<(THREE.Mesh|null)[]>([]),hands=useRef<(THREE.Group|null)[]>([]),caption=useRef<HTMLSpanElement>(null),beads=useRef<THREE.Group>(null),falling=useRef<THREE.Mesh>(null),stack=useRef<(THREE.Mesh|null)[]>([]);
 const last=useRef(new THREE.Vector3(player.x,0,player.z)),moving=useRef(0),base=useRef({now,at:0});base.current={now,at:typeof performance==='undefined'?0:performance.now()};
 let hash=0;for(const c of player.id)hash=(hash*31+c.charCodeAt(0))>>>0;
 const style=player.appearance??hash,shirt=['#d9cdbb','#91a8bb','#35465b','#b99b94'][style%4],pants=['#67564b','#50585a','#b7a58b','#b6aa9c'][style%4],skin=['#ebbc97','#d8a783','#b87f5c'][hash%3],hair=['#372f2b','#654533','#373e43'][style%3],ritual=player.ritual??EMPTY_RITUAL,isBeads=ritual.kind==='rosary'||ritual.kind==='beads',stones=Math.min(7,Math.max(0,ritual.stones));
 useFrame((state,dt)=>{
  if(!root.current)return;
  const target=new THREE.Vector3(player.x,.06+gardenFloorY(player.x,player.z),player.z);root.current.position.lerp(target,1-Math.exp(-dt*15));
  const angle=THREE.MathUtils.euclideanModulo(player.direction-root.current.rotation.y+Math.PI,Math.PI*2)-Math.PI;root.current.rotation.y+=angle*(1-Math.exp(-dt*12));
  if(last.current.distanceTo(target)>.008)moving.current=.2;else moving.current=Math.max(0,moving.current-dt);last.current.copy(target);
  const elapsed=base.current.now+performance.now()-base.current.at-ritual.at,walk=moving.current>0,stride=!reduced&&walk?Math.sin(state.clock.elapsedTime*9)*.35:0,pose=ritualPose(walk||(ritual.kind==='stone'&&['cleared','complete'].includes(ritual.result))?'rest':ritual.kind,elapsed,reduced,ritual.step);
  legs.current.forEach((leg,i)=>{if(leg)leg.rotation.x=stride*(i?-1:1);});
  if(upper.current)upper.current.rotation.x=pose.bow;if(head.current)head.current.rotation.x=pose.head;
  [pose.right,pose.left].forEach((point:RitualPoint,i)=>{
   const side=i?1:-1,a=new THREE.Vector3(side*.48,1.35,0),b=new THREE.Vector3(...point);if(walk)b.z+=stride*(i?-.5:.5);
   const elbow=a.clone().lerp(b,.5).add(new THREE.Vector3(side*.12,-.15,.13));segment(sleeves.current[i],a,elbow);segment(forearms.current[i],elbow,b);elbows.current[i]?.position.copy(elbow);
   const joined=ritual.kind==='bow'||ritual.kind==='prayer'||(ritual.kind==='cross'&&(elapsed>=3700||reduced));const hand=hands.current[i];if(hand){hand.position.copy(b);hand.rotation.set(pose.palmUp?-Math.PI/2:0,joined?(i===0?Math.PI/2:-Math.PI/2):pose.palmUp?0:point[0]*1.2,side*.08);}
  });
  if(beads.current){beads.current.visible=isBeads&&!walk;beads.current.position.set(.02,1.02,.49);beads.current.rotation.z=reduced?0:Math.sin(Math.min(1,Math.max(0,elapsed)/600)*Math.PI)*.12;}
  stack.current.forEach((stone,i)=>{if(stone)stone.visible=reduced||ritual.kind!=='stone'||ritual.result!=='placed'||i<stones-1||elapsed>=650;});
  if(falling.current){const t=(elapsed-650)/1000;falling.current.visible=ritual.result==='fallen'&&t>=0&&t<1.15&&!reduced;if(falling.current.visible){const h=.3+stones*.16;falling.current.position.set(-.9-t*.7,Math.max(.13,h-(h-.13)*Math.pow(t/.2,2)),.65+t*.32);falling.current.rotation.set(t*3,t*2,t*4);}}
  if(caption.current){caption.current.dataset.position=`${root.current.position.x.toFixed(2)},${root.current.position.z.toFixed(2)}`;caption.current.dataset.direction=root.current.rotation.y.toFixed(2);caption.current.dataset.ritualStep=pose.step;caption.current.dataset.rightHand=pose.right.map(n=>n.toFixed(2)).join(',');const screen=root.current.localToWorld(new THREE.Vector3(...pose.right)).project(state.camera);caption.current.dataset.handScreen=`${((screen.x+1)*state.size.width/2).toFixed(1)},${((1-screen.y)*state.size.height/2).toFixed(1)}`;}
 });
 return <><group ref={root} position={[player.x,.06+gardenFloorY(player.x,player.z),player.z]}>
  {[-1,1].map((side,i)=><group key={side} ref={v=>{legs.current[i]=v;}} position={[side*.19,.68,0]}><RoundedBox position={[0,-.26,0]} args={[.3,.64,.34]} radius={.1} smoothness={2} castShadow><meshStandardMaterial color={pants}/></RoundedBox><Ball at={[0,-.57,.1]} scale={[.19,.12,.3]} color="#e0d4bc"/></group>)}
  <group ref={upper} position={[0,.75,0]}><group position={[0,-.75,0]}>
   <RoundedBox position={[0,1.1,0]} args={[.85,.88,.51]} radius={.2} smoothness={3} castShadow><meshStandardMaterial color={shirt} roughness={.9}/></RoundedBox>
   <mesh position={[0,1.67,0]}><cylinderGeometry args={[.13,.14,.24,12]}/><meshStandardMaterial color={skin}/></mesh>
   {[-1,1].map((side,i)=><group key={side}>
    <mesh ref={v=>{sleeves.current[i]=v;}} castShadow><cylinderGeometry args={[.12,.11,1,10]}/><meshStandardMaterial color={shirt}/></mesh>
    <mesh ref={v=>{forearms.current[i]=v;}} castShadow><cylinderGeometry args={[.08,.075,1,10]}/><meshStandardMaterial color={skin}/></mesh>
    <mesh ref={v=>{elbows.current[i]=v;}} castShadow><sphereGeometry args={[.105,12,8]}/><meshStandardMaterial color={shirt}/></mesh>
    <group ref={v=>{hands.current[i]=v;}} scale={.86}><Ball at={[0,0,0]} scale={[.115,.16,.075]} color={skin}/>{[-.06,0,.06].map(x=><Ball key={x} at={[x,.12,0]} scale={[.027,.09,.033]} color={skin}/>)}<Ball at={[-side*.11,-.01,.035]} scale={[.045,.085,.045]} color={skin}/></group>
   </group>)}
   <group ref={head} position={[0,1.62,0]}><group position={[0,-.8316,0]} scale={.64}>
    <Ball at={[0,1.94,0]} scale={[.48,.53,.43]} color={skin}/>{[-1,1].map(side=><Ball key={side} at={[side*.46,1.93,0]} scale={[.09,.15,.08]} color={skin}/>)}
    {style%3===1&&<Ball at={[0,1.88,-.19]} scale={[.51,.62,.32]} color={hair}/>}
    <mesh position={[0,2.12,-.05]} castShadow><sphereGeometry args={[.49,20,14,0,Math.PI*2,0,Math.PI*.53]}/><meshStandardMaterial color={hair} roughness={.9}/></mesh>
    {[-.3,-.13,.05,.23].map((x,i)=><mesh key={x} position={[x,2.28-i*.035,.26]} rotation={[0,0,-.45]} scale={[.23,.13,.15]} castShadow><sphereGeometry args={[1,10,8]}/><meshStandardMaterial color={hair}/></mesh>)}
    {[-1,1].map(side=><group key={side}><Ball at={[side*.16,1.96,.386]} scale={[.077,.092,.035]} color="#fffaf3"/><Ball at={[side*.16,1.96,.416]} scale={[.041,.054,.021]} color="#303a35"/><Ball at={[side*.147,1.983,.433]} scale={[.012,.017,.007]} color="#ffffff"/><Ball at={[side*.29,1.81,.34]} scale={[.07,.035,.018]} color="#dc9c85"/></group>)}
    <Ball at={[0,1.86,.43]} scale={[.065,.073,.072]} color={skin}/><mesh position={[0,1.74,.403]} rotation={[0,0,Math.PI]}><torusGeometry args={[.055,.01,6,16,Math.PI]}/><meshStandardMaterial color="#8c5044"/></mesh>
   </group></group>
   <group ref={beads} visible={isBeads} position={[.02,1.02,.49]}>
    {Array.from({length:16},(_,i)=>{const t=i/16*Math.PI*2;return <Ball key={i} at={[Math.sin(t)*.21,Math.cos(t)*.24,0]} scale={[.036,.036,.036]} color={ritual.kind==='rosary'?'#6b7186':'#8c643f'}/>;})}
    {ritual.kind==='rosary'&&<group position={[0,-.34,0]}><mesh><boxGeometry args={[.035,.2,.035]}/><meshStandardMaterial color="#c4ad78"/></mesh><mesh position={[0,.035,0]}><boxGeometry args={[.13,.03,.035]}/><meshStandardMaterial color="#c4ad78"/></mesh></group>}
   </group>
  </group></group>
  <mesh rotation={[-Math.PI/2,0,0]} position={[0,.012,0]}><ringGeometry args={[.47,.52,32]}/><meshBasicMaterial color={self?'#4f795a':'#a8b69a'}/></mesh>
  <Html portal={portal} position={[0,2.78,0]} center style={{pointerEvents:'none',transform:'translate(-50%, -100%)'}}><div className="wr-avatar-caption">{speech&&<span className="peace-speech">{speech}</span>}<span ref={caption} className={`wr-name ${self?'self':''}`} data-peace-player={player.id} data-kind={ritual.kind} data-step={ritual.step} data-stones={ritual.stones} data-result={ritual.result} data-sequence={ritual.sequence} data-player-id={player.id} data-appearance={style} data-ritual-kind={ritual.kind} data-ritual-sequence={ritual.sequence}>{self?'나 · ':''}{player.name}<small>{RITUAL_LABELS[ritual.kind]}</small></span></div></Html>
 </group><group position={[ritual.stoneX??player.x,.06+gardenFloorY(ritual.stoneX??player.x,ritual.stoneZ??player.z),ritual.stoneZ??player.z]} rotation={[0,ritual.stoneDirection??0,0]}>  {Array.from({length:stones},(_,i)=><mesh key={i} ref={v=>{stack.current[i]=v;}} position={[-.9+Math.sin(i*2)*.035,.12+i*.16,.65]} scale={[.32-i*.018,.12,.25-i*.012]} castShadow><icosahedronGeometry args={[1,1]}/><meshStandardMaterial color={['#8e9588','#a8a99a','#b9b5a3'][i%3]} roughness={1}/></mesh>)}
  <mesh ref={falling} visible={false} scale={[.25,.13,.2]} castShadow><icosahedronGeometry args={[1,1]}/><meshStandardMaterial color="#a6a893" roughness={1}/></mesh>
 </group></>;
}
