'use client';
import {useEffect,useMemo,useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import {Html,Line} from '@react-three/drei';
import * as THREE from 'three';
import {NODE_FLOOR,nodePosition,type Snapshot} from './types';
import {LABELS,type Workflow} from './workflow';

function Cuboid({position,size,color}:{position:[number,number,number];size:[number,number,number];color:string}){return <mesh position={position} castShadow receiveShadow><boxGeometry args={size}/><meshStandardMaterial color={color} roughness={.7}/></mesh>;}
const ROLES=['운영','AI 분석','승인','복구','검증'];
const COATS=['#436483','#247d8b','#7955a2','#c17628','#307a60'];
function Operator({index,y,flow,reduced,paused,speed}:{index:number;y:number;flow:Workflow;reduced:boolean;paused:boolean;speed:number}){
 const body=useRef<THREE.Group>(null),legs=useRef<THREE.Group>(null),arm=useRef<THREE.Group>(null),caption=useRef<HTMLSpanElement>(null),clock=useRef(0);
 const rack=nodePosition(flow.target),home=useMemo(()=>new THREE.Vector3(-7+index*2.1,y,3.2),[index,y]);
 const path=useRef<THREE.Vector3[]>([]),phase=flow.stage;
 const active=index===0&&['NORMAL','FAULT','FAILED'].includes(phase)||index===1&&phase==='ANALYSIS'||index===2&&phase==='APPROVAL'||index===3&&phase==='RECOVERY'||index===4&&phase==='VERIFY';
 useEffect(()=>{
  clock.current=0;const destination=home.clone();
  if(active){if(index===1)destination.set(6.7,y,1);else if(index===2)destination.set(3.8,y,1);else if(index===4)destination.set(.9,y,1);else if(phase!=='NORMAL')destination.set(rack[0]+1.05,y,rack[2]);}
  const start=body.current?.position||home;
  // Walk around the rack bays via the perimeter, never through equipment.
  const side=destination.x<0?-8.3:8.3;
  const rackWork=active&&(index===3||index===0&&phase!=='NORMAL');
  path.current=rackWork?[new THREE.Vector3(side,y,start.z),new THREE.Vector3(side,y,-5.3),new THREE.Vector3(destination.x,y,-5.3),destination]:start.z<0?[new THREE.Vector3(start.x,y,-5.3),new THREE.Vector3(8.3,y,-5.3),new THREE.Vector3(8.3,y,3.2),destination]:[destination];
 },[phase,flow.target,flow.key,active,index,y,home]);
 useFrame((_,dt)=>{
  const b=body.current;if(!b||paused)return;dt*=speed;clock.current+=dt;let target=path.current[0];
  if(!target&&phase==='NORMAL'&&index===0){target=new THREE.Vector3(Math.sin(clock.current*.18)*5,y,3.2);}
  const moving=!!target&&b.position.distanceTo(target)>.05;
  if(target){const distance=b.position.distanceTo(target);if(reduced){b.position.copy(path.current.at(-1)||target);path.current=[];}else if(distance<.08){b.position.copy(target);path.current.shift();}else{const delta=target.clone().sub(b.position);b.rotation.y=Math.atan2(delta.x,delta.z);b.position.addScaledVector(delta,Math.min(1,dt*4.5/distance));}}
  if(legs.current)legs.current.rotation.x=moving&&!reduced?Math.sin(clock.current*11)*.3:0;
  if(arm.current)arm.current.rotation.x=active&&!moving?-1+(!reduced?Math.sin(clock.current*5)*.2:0):0;
  if(caption.current){caption.current.dataset.position=`${b.position.x.toFixed(2)},${b.position.z.toFixed(2)}`;caption.current.dataset.moving=String(moving);}
 });
 return <group ref={body} position={home}>
  <group ref={legs}><Cuboid position={[-.16,.32,0]} size={[.22,.62,.24]} color="#253849"/><Cuboid position={[.16,.32,0]} size={[.22,.62,.24]} color="#253849"/></group>
  <Cuboid position={[0,.94,0]} size={[.65,.7,.4]} color={COATS[index]}/><Cuboid position={[.14,1.03,.22]} size={[.13,.2,.03]} color="#f6f8fb"/>
  <mesh position={[0,1.55,0]} castShadow><sphereGeometry args={[.28,12,10]}/><meshStandardMaterial color="#dab18d"/></mesh>
  <Cuboid position={[0,1.78,0]} size={[.55,.12,.46]} color="#27384b"/>
  <group ref={arm} position={[.4,1.15,0]}><Cuboid position={[0,-.25,0]} size={[.17,.55,.19]} color={COATS[index]}/>{index===3&&<Cuboid position={[0,-.55,.12]} size={[.12,.12,.42]} color="#b4bec9"/>}</group>
  <Html position={[0,2.15,0]} center distanceFactor={12} style={{pointerEvents:'none'}}><span ref={caption} className="wr-npc-label" data-npc={index}>NPC · {ROLES[index]}{active?' ●':''}</span></Html>
 </group>;
}
function Packet({a,b,broken,recovering,index,flow,reduced,paused,speed}:{a:THREE.Vector3;b:THREE.Vector3;broken:boolean;recovering:boolean;index:number;flow:Workflow;reduced:boolean;paused:boolean;speed:number}){
 const ref=useRef<THREE.Mesh>(null),t=useRef(0);const color=broken?'#dc4c4c':recovering?'#c18b20':'#16866b';
 useEffect(()=>{t.current=0;},[flow.key]);
 useFrame((_,dt)=>{if(paused||!ref.current)return;t.current+=dt*speed;const fraction=(t.current*.4+index*.17)%1;ref.current.position.lerpVectors(a,b,broken?Math.min(fraction,.42):fraction);ref.current.visible=!reduced&&(!broken||fraction<.48);});
 const middle=a.clone().lerp(b,.45),resume=a.clone().lerp(b,.58);
 return <group>{broken?<><Line points={[a,middle]} color={color} lineWidth={1.6}/><Line points={[resume,b]} color={color} lineWidth={1.6} dashed dashSize={.12} gapSize={.12}/></>:<Line points={[a,b]} color={color} lineWidth={1.2}/>}
  <mesh ref={ref} position={a}><sphereGeometry args={[.075,8,6]}/><meshBasicMaterial color={color}/></mesh>
 </group>;
}
function FaultDetail({flow,paused,reduced,speed}:{flow:Workflow;paused:boolean;reduced:boolean;speed:number}){
 const rotating=useRef<THREE.Group>(null),parcel=useRef<THREE.Mesh>(null),time=useRef(0),p=nodePosition(flow.target);
 const recovery=flow.stage==='RECOVERY'||flow.stage==='VERIFY';
 useFrame((_,dt)=>{if(paused||reduced)return;time.current+=dt*speed;if(rotating.current&&recovery)rotating.current.rotation.z+=dt*speed*3;if(parcel.current)parcel.current.position.x=recovery?Math.sin(time.current*2)*.45:0;});
 return <group position={[p[0],p[1],p[2]+.7]}>
  {flow.fault==='BATCH'&&<><Cuboid position={[0,0,0]} size={[1.1,.09,.3]} color="#bac9d5"/><mesh ref={parcel} position={[0,.2,0]}><boxGeometry args={[.22,.25,.22]}/><meshStandardMaterial color={recovery?'#d4aa40':'#d35b4d'}/></mesh></>}
  {flow.fault==='DATABASE'&&<group ref={rotating}>{[-.25,0,.25].map(y=><mesh key={y} position={[0,y,0]} rotation={[Math.PI/2,0,0]}><torusGeometry args={[.28,.035,6,24]}/><meshBasicMaterial color={recovery?'#c7a540':'#db6455'}/></mesh>)}</group>}
  {flow.fault==='SERVER'&&<group ref={rotating}><Cuboid position={[0,0,0]} size={[.65,.08,.05]} color="#a2b7ca"/><Cuboid position={[0,0,0]} size={[.08,.65,.05]} color="#a2b7ca"/></group>}
  {flow.fault==='NETWORK'&&<><Cuboid position={[-.3,0,0]} size={[.38,.1,.1]} color="#db6455"/><Cuboid position={[.3,0,0]} size={[.38,.1,.1]} color={recovery?'#cca743':'#db6455'}/></>}
 </group>;
}
export function Operations({snapshot,flow,floor,overview,reduced,paused,speed}:{snapshot:Snapshot;flow:Workflow;floor:number;overview:boolean;reduced:boolean;paused:boolean;speed:number}){
 const targetFloor=NODE_FLOOR(flow.target),y=(targetFloor-1)*5.5+.08,warning=useRef<THREE.Mesh>(null),time=useRef(0);
 const faulty=!['NORMAL','COMPLETE','STOPPED'].includes(flow.stage),recovering=['RECOVERY','VERIFY'].includes(flow.stage),rack=nodePosition(flow.target);
 useEffect(()=>{time.current=0;},[flow.key]);
 useFrame((_,dt)=>{if(paused)return;time.current+=dt*speed;if(warning.current){warning.current.scale.setScalar(reduced?1:1+Math.sin(time.current*3)*.08);warning.current.rotation.z=reduced?0:time.current*.2;}});
 const edges=snapshot.edges.filter(e=>overview||NODE_FLOOR(e.source)===floor&&NODE_FLOOR(e.target)===floor);
 return <group>
  {edges.map((edge,i)=>{const p=nodePosition(edge.source),q=nodePosition(edge.target),affected=edge.source===flow.target||edge.target===flow.target;const restored=flow.progress!==null&&flow.progress>(i%3+1)/4;return <Packet key={`${edge.source}-${edge.target}`} a={new THREE.Vector3(p[0],p[1]+1.3,p[2])} b={new THREE.Vector3(q[0],q[1]+1.3,q[2])} broken={faulty&&affected&&!(recovering&&restored)} recovering={recovering} index={i} flow={flow} reduced={reduced} paused={paused} speed={speed}/>;})}
  {(overview||floor===targetFloor)&&<>
   {ROLES.map((_,index)=><Operator key={`${targetFloor}-${index}`} index={index} y={y} flow={flow} reduced={reduced} paused={paused} speed={speed}/>)}
   {[.9,3.8,6.7].map((x,i)=><group key={x}><Cuboid position={[x,y+.65,.15]} size={[2.3,1.3,.85]} color="#394d60"/><Cuboid position={[x,y+1.7,0]} size={[1.8,.8,.08]} color={i===1&&flow.stage==='APPROVAL'?'#9b741f':'#163f54'}/><Cuboid position={[x,y+1.35,.4]} size={[1.8,.05,.3]} color="#9caebb"/></group>)}
   <Html position={[0,y+3.35,-6.6]} center distanceFactor={17} style={{pointerEvents:'none'}}><div className="wr-operations-monitor" data-stage={flow.stage}><small>S-CARE / OPERATIONS</small><strong>{LABELS[flow.stage]}</strong><span>{flow.source}</span></div></Html>
   {faulty&&<mesh ref={warning} position={[rack[0],y+.06,rack[2]]} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[.88,1,32]}/><meshBasicMaterial color={recovering?'#c79223':'#d64545'}/></mesh>}
   {faulty&&<FaultDetail flow={flow} paused={paused} reduced={reduced} speed={speed}/>}
   {['RECOVERY','VERIFY','COMPLETE'].includes(flow.stage)&&<Html position={[3.8,y+2.3,0]} center style={{pointerEvents:'none'}}><span className="wr-npc-label">✓ {flow.synthetic?'가상 승인 단계':'서버 승인 확인'}</span></Html>}
   {faulty&&<Html position={[rack[0],rack[1]+2,rack[2]]} center style={{pointerEvents:'none'}}><span className="wr-fault-tag" data-fault={flow.fault}>{({DATABASE:'DB · 의존 연결 경고',BATCH:'배치 · 작업 흐름 정지',SERVER:'서버 · 전원 / 응답 없음',NETWORK:'네트워크 · 통신 단절'})[flow.fault]}</span></Html>}
   {flow.stage==='ANALYSIS'&&<Line points={[[6.7,y+1.7,0],[rack[0],rack[1]+1.3,rack[2]]]} color="#3375b3" lineWidth={2} dashed dashSize={.2} gapSize={.15}/>}
  </>}
 </group>;
}
