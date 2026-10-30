'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {Canvas,useFrame,useThree} from '@react-three/fiber';
import {Html,Line,OrbitControls,RoundedBox} from '@react-three/drei';
import type {OrbitControls as OrbitControlsImpl} from 'three-stdlib';
import * as THREE from 'three';
import {opaqueRenderer} from './scene';
import OperatorAvatar from './operator-avatar';
import {ZONES,STAGE_NAMES,displayedMetrics,type Training} from './city-types';
import type {Player,RoomState} from './types';
type Vec=[number,number,number];
function Block({at,size,color='#e6e6df'}:{at:Vec;size:Vec;color?:string}){return <mesh position={at} castShadow receiveShadow><boxGeometry args={size}/><meshStandardMaterial color={color} roughness={.72}/></mesh>;}
function Round({at,size,color,radius=.12}:{at:Vec;size:Vec;color:string;radius?:number}){return <RoundedBox position={at} args={size} radius={radius} smoothness={3} castShadow receiveShadow><meshStandardMaterial color={color} roughness={.65}/></RoundedBox>;}
function Camera({focus,reset,reduced}:{focus:string;reset:number;reduced:boolean}){
 const {camera,size}=useThree(),controls=useRef<OrbitControlsImpl>(null),moving=useRef(true);
 const framing=useMemo(()=>{
  const target=new THREE.Vector3(0,1.5,-.3),direction=new THREE.Vector3(0,.7,1).normalize(),up=new THREE.Vector3().crossVectors(direction,new THREE.Vector3(1,0,0)),tanV=Math.tan(THREE.MathUtils.degToRad(44)/2),tanH=tanV*size.width/Math.max(1,size.height);
  let distance=0;
  // Fit actual cutaway geometry, not a tall bounding box over the empty foreground.
  for(const x of [-10.1,10.1])for(const [y,z] of [[-.3,-7.1],[-.3,7.1],[5.7,-7.1],[3.5,3]]){const relative=new THREE.Vector3(x,y,z).sub(target),depth=relative.dot(direction);distance=Math.max(distance,Math.abs(relative.x)*1.06/tanH+depth,Math.abs(relative.dot(up))*1.06/tanV+depth);}
  return {target,position:target.clone().addScaledVector(direction,distance),distance};
 },[size.width,size.height]);
 useEffect(()=>{moving.current=true;},[focus,reset,size.width,size.height]);
 useFrame((_,dt)=>{if(!controls.current||!moving.current)return;const zone=ZONES.find(z=>z.id===focus),portrait=size.width<size.height,target=zone?new THREE.Vector3(zone.x*.5,1.3,zone.z*.45):framing.target;const position=zone?target.clone().add(new THREE.Vector3(0,portrait?22:13,portrait?26:17)):framing.position;const blend=reduced?1:1-Math.exp(-dt*5);camera.position.lerp(position,blend);controls.current.target.lerp(target,blend);controls.current.update();if(camera.position.distanceTo(position)<.02)moving.current=false;});
 return <OrbitControls ref={controls} makeDefault enablePan={false} onStart={()=>moving.current=false} minDistance={15} maxDistance={framing.distance*1.3} minPolarAngle={.3} maxPolarAngle={Math.PI/3.1} minAzimuthAngle={-.38} maxAzimuthAngle={.38}/>;
}
function Cadence({low}:{low:boolean}){const invalidate=useThree(s=>s.invalidate);useEffect(()=>{const timer=setInterval(()=>{if(!document.hidden)invalidate();},1000/(low?20:30));return()=>clearInterval(timer);},[invalidate,low]);return null;}
function Plant({at}:{at:Vec}){return <group position={at}><mesh position={[0,.3,0]} castShadow><cylinderGeometry args={[.3,.24,.6,16]}/><meshStandardMaterial color="#c4b8a3"/></mesh>{[-1,0,1].map(n=><mesh key={n} position={[n*.15,.85+Math.abs(n)*.15,0]} rotation={[0,n,n*.35]} scale={[.22,.53,.2]} castShadow><sphereGeometry args={[1,12,10]}/><meshStandardMaterial color={n?'#65866c':'#3b6658'}/></mesh>)}</group>;}
function Rack({at,alarm,recovering,selected,onSelect}:{at:Vec;alarm:boolean;recovering:boolean;selected:boolean;onSelect:()=>void}){const light=alarm?recovering?'#e0ab4e':'#dd604e':'#69b7a0';return <group position={at} onClick={e=>{e.stopPropagation();onSelect();}}><Round at={[0,1.55,0]} size={[1.35,3.1,1.2]} color={selected?'#486b92':'#263649'}/><Block at={[0,1.55,.615]} size={[1.13,2.82,.04]} color="#121f30"/>{Array.from({length:9},(_,i)=><group key={i}><Block at={[0,.28+i*.29,.65]} size={[1,.22,.04]} color="#37495c"/><Block at={[-.36,.28+i*.29,.681]} size={[.07,.045,.02]} color={light}/>{[0,.17,.34].map(x=><Block key={x} at={[x,.28+i*.29,.681]} size={[.09,.035,.02]} color="#7b8c9d"/>)}</group>)}<Block at={[0,3.17,0]} size={[1.15,.1,1]} color={light}/></group>;}
function Desk({at,angle=0,accent='#568ac1',onSelect}:{at:Vec;angle?:number;accent?:string;onSelect:()=>void}){return <group position={at} rotation={[0,angle,0]} onClick={e=>{e.stopPropagation();onSelect();}}><Round at={[0,1.05,0]} size={[2.5,.2,1.35]} color="#c5c8c7"/><Block at={[-.95,.5,0]} size={[.14,1,.9]} color="#34465a"/><Block at={[.95,.5,0]} size={[.14,1,.9]} color="#34465a"/>{[-.58,.58].map(x=><group key={x}><Block at={[x,1.35,-.27]} size={[.08,.5,.08]} color="#273749"/><Round at={[x,1.72,-.3]} size={[1.05,.68,.09]} color="#1b2f47" radius={.04}/><Block at={[x,1.72,-.245]} size={[.92,.56,.012]} color="#c6deeb"/>{[0,1,2].map(i=><Block key={i} at={[x-.12,1.88-i*.14,-.23]} size={[.55-i*.11,.035,.01]} color={accent}/>)}</group>)}<Block at={[0,1.17,.3]} size={[.8,.035,.3]} color="#405368"/><Round at={[0,.56,1.1]} size={[.7,.17,.7]} color="#596b7e"/><Block at={[0,.25,1.1]} size={[.09,.5,.09]} color="#26374a"/><Round at={[0,1,1.4]} size={[.72,.8,.13]} color="#596b7e"/></group>;}
function Screen({training,now}:{training:Training;now:number}){
 const m=displayedMetrics(training,now),normal=training.stage==='LOBBY'||training.stage==='RESULT';
 const texture=useMemo(()=>{const canvas=document.createElement('canvas');canvas.width=1536;canvas.height=600;const c=canvas.getContext('2d')!;c.fillStyle='#142a44';c.fillRect(0,0,1536,600);c.fillStyle='#9fbedc';c.font='26px Arial';c.fillText('S-CARE   /   INCIDENT RESPONSE',48,55);c.fillStyle='#fff';c.font='bold 48px Arial';c.fillText(normal?'금융 서비스 정상 운영':'카드 승인 지연 · 공동 대응',48,127);c.fillStyle=normal?'#8ed1ba':'#f4bd77';c.font='30px Arial';c.fillText(STAGE_NAMES[training.stage]||'공동 대응',1100,122);
 const labels=['고객 결제','카드 승인 앱','연결 풀','결제 DB'];for(let i=0;i<4;i++){const x=48+i*282;c.fillStyle=!normal&&i===1?'#723e3d':'#244464';c.fillRect(x,205,230,125);c.strokeStyle=!normal&&i===1?'#f28a71':'#769fbe';c.lineWidth=3;c.strokeRect(x,205,230,125);c.fillStyle='#fff';c.font='bold 29px Arial';c.fillText(labels[i],x+23,260);c.fillStyle='#b5cfe3';c.font='23px Arial';c.fillText(normal?'정상':i===1?'조사 대상':i===2?'대기 증가':'관측 확인',x+23,305);if(i<3){c.strokeStyle='#81a7c9';c.beginPath();c.moveTo(x+236,268);c.lineTo(x+273,268);c.stroke();}}
 [['승인 성공률',`${m.success}%`],['응답 시간',`${m.latency} ms`],['대기 요청',`${m.queue}건`],['연결 풀 사용',`${m.pool}%`]].forEach(([k,v],i)=>{const x=48+i*365;c.fillStyle='#91adca';c.font='24px Arial';c.fillText(k,x,438);c.fillStyle='#fff';c.font='bold 43px Arial';c.fillText(v,x,501);});c.fillStyle='#9ab4ce';c.font='22px Arial';c.fillText('가상 금융사 · 합성 관측값 · 실제 운영 명령 없음',48,566);const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;},[training.stage,m.success,m.latency,m.queue,m.pool,normal]);
 useEffect(()=>()=>texture.dispose(),[texture]);
 return <group position={[0,3.1,-6.72]}><Round at={[0,0,0]} size={[11.6,4.55,.22]} color="#25364c"/><mesh position={[0,0,.125]}><planeGeometry args={[11.25,4.39]}/><meshBasicMaterial map={texture}/></mesh></group>;
}
function Table({training,now,reduced,preview,onSelect}:{training:Training;now:number;reduced:boolean;preview:string;onSelect:()=>void}){
 const packet=useRef<THREE.Mesh>(null),normal=training.stage==='LOBBY'||training.stage==='RESULT',executing=training.stage==='EXECUTING',active=executing||training.stage==='VERIFY'||normal;
 const bypass=active&&training.selected==='bypass',route=useMemo(()=>bypass?[new THREE.Vector3(-2,1.22,0),new THREE.Vector3(-2,1.22,1),new THREE.Vector3(2,1.22,1),new THREE.Vector3(2,1.22,0)]:[new THREE.Vector3(-2,1.22,0),new THREE.Vector3(2,1.22,0)],[bypass]);
 useFrame(s=>{if(packet.current){const t=reduced?.5:(s.clock.elapsedTime*(active?.2:.065))%1;const segment=t*(route.length-1),i=Math.floor(segment);packet.current.position.lerpVectors(route[i],route[Math.min(i+1,route.length-1)],segment-i);}});
 const color=normal?'#66b7a6':executing?'#e5ba6c':'#e07965';
 return <group onClick={e=>{if(e.delta<5){e.stopPropagation();onSelect();}}}>
  <mesh position={[0,.52,0]} scale={[1.8,1,.9]} castShadow><cylinderGeometry args={[1,1.1,1,48]}/><meshStandardMaterial color="#42556b"/></mesh>
  <mesh position={[0,1.08,0]} scale={[3.05,1,1.78]} castShadow receiveShadow><cylinderGeometry args={[1,1,.18,64]}/><meshStandardMaterial color="#bfc6c9" metalness={.2} roughness={.5}/></mesh>
  <mesh position={[0,1.185,0]} rotation={[-Math.PI/2,0,0]} scale={[2.8,1.52,1]}><circleGeometry args={[1,64]}/><meshStandardMaterial color="#1d3856" roughness={.65}/></mesh>
  <Line points={route} color={color} lineWidth={2}/><mesh ref={packet}><sphereGeometry args={[.085,12,8]}/><meshBasicMaterial color={color}/></mesh>
  {[-2,-.7,.7,2].map((x,i)=><group key={x}><Round at={[x,1.27,0]} size={[.55,.12,.55]} color={i===1&&!normal?'#b95d51':'#5684b0'} radius={.04}/><Block at={[x,1.35,0]} size={[.32,.03,.32]} color="#bbd5e5"/></group>)}
  {training.clues.map((c,i)=><Round key={c.id} at={[-1.5+i,1.24,-.85]} size={[.55,.04,.36]} color="#e6ddbb" radius={.015}/>)}
  {preview&&<Line points={[[-2,1.25,.65],[0,1.25,.9],[2,1.25,.65]]} color="#b795df" lineWidth={3} dashed dashSize={.13} gapSize={.12}/>}
  {executing&&<mesh position={[0,1.25,0]} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[1.15,1.2,64,1,0,Math.PI*2*Math.min(1,Math.max(.01,(now-training.executionAt)/8000))]}/><meshBasicMaterial color="#e5ba6c"/></mesh>}
 </group>;
}
export default function CityScene({training,players,chat,id,zone,onZone,onMove,low,reduced,focus,reset,now,preview,paused}:{training:Training;players:Player[];chat:RoomState['chat'];id:string;zone:string;onZone:(id:string)=>void;onMove:(x:number,z:number)=>void;low:boolean;reduced:boolean;focus:string;reset:number;now:number;preview:string;paused:boolean}){
 const [labels,setLabels]=useState<HTMLDivElement|null>(null),portal=useMemo(()=>labels?{current:labels}:undefined,[labels]);
 const normal=training.stage==='LOBBY'||training.stage==='RESULT',recovering=['EXECUTING','VERIFY'].includes(training.stage);
 return <><div ref={setLabels} className="city-label-host"/>{labels&&<Canvas frameloop="demand" shadows={!low} dpr={low?[1,1.5]:[1,2]} camera={{position:[0,22,28],fov:44,near:.1,far:150}} gl={defaults=>{const gl=opaqueRenderer(defaults.canvas as HTMLCanvasElement,low);gl.toneMapping=THREE.NoToneMapping;gl.outputColorSpace=THREE.SRGBColorSpace;return gl;}} onCreated={({gl})=>gl.setClearColor('#e8edf3')}>
  <Cadence low={low}/><ambientLight intensity={.65}/><hemisphereLight args={['#fffaf0','#8f9baa',.85]}/><directionalLight position={[2,16,9]} intensity={1.5} castShadow={!low} shadow-mapSize={[1024,1024]} shadow-camera-left={-12} shadow-camera-right={12} shadow-camera-top={12} shadow-camera-bottom={-12} shadow-normalBias={.04}/>
  <Block at={[0,-.18,0]} size={[20,.32,14]} color="#b7bdc3"/>
  <mesh rotation={[-Math.PI/2,0,0]} receiveShadow onClick={e=>{if(e.delta<5){e.stopPropagation();onMove(e.point.x,e.point.z);}}}><planeGeometry args={[20,14]}/><meshStandardMaterial color="#e0ded5" roughness={.85}/></mesh>
  {Array.from({length:11},(_,i)=><Line key={i} points={[[-10,.012,-6+i*1.2],[10,.012,-6+i*1.2]]} color="#c6c8c6" lineWidth={.5}/>)}
  {[-8,-4,0,4,8].map(x=><Line key={x} points={[[x,.012,-7],[x,.012,7]]} color="#c6c8c6" lineWidth={.5}/>)}
  <Block at={[0,2.8,-7]} size={[20,5.6,.2]} color="#c9cdd0"/><Block at={[-9.95,1.7,-2]} size={[.15,3.4,10]} color="#c3cbd2"/>
  <Block at={[0,5.55,-6.9]} size={[20,.15,.4]} color="#34455b"/>{[-8,-6,6,8].map(x=><Block key={x} at={[x,2.8,-6.8]} size={[.11,5.4,.12]} color="#526579"/>)}
  <Screen training={training} now={now}/>
  <Block at={[-8, .025,-1.4]} size={[3.8,.03,10]} color="#bdc7ce"/>
  <Rack at={[-8,0,-4.5]} alarm={!normal} recovering={recovering} selected={zone==='app'} onSelect={()=>onZone('app')}/>
  <Rack at={[-8,0,-2.6]} alarm={!normal} recovering={recovering} selected={zone==='app'} onSelect={()=>onZone('app')}/>
  <Rack at={[-8,0,.6]} alarm={false} recovering={false} selected={zone==='db'} onSelect={()=>onZone('db')}/>
  {[-6.7,-3.6,2.5].map(z=><Block key={z} at={[-6.5,1.7,z]} size={[.09,3.4,.09]} color="#587084"/>)}
  <Block at={[-6.5,3.35,-2.1]} size={[.09,.09,9.4]} color="#587084"/>
  {/* Narrow glass panels only along the server boundary; never over the room. */}
  {[-5.2,-.6].map(z=><mesh key={z} position={[-6.5,1.7,z]} rotation={[0,Math.PI/2,0]}><planeGeometry args={[2.4,3.1]}/><meshStandardMaterial color="#a7c4d8" transparent opacity={.12} depthWrite={false} side={THREE.DoubleSide}/></mesh>)}
  <Desk at={[6.8,0,-3.3]} angle={-.2} onSelect={()=>onZone('network')}/>
  <Desk at={[6.8,0,1.1]} angle={-.2} accent={training.stage==='APPROVAL'?'#b98131':'#7463a4'} onSelect={()=>onZone('trial')}/>
  <Desk at={[-3.8,0,-4.8]} onSelect={()=>onZone('shop')}/>
  <Table training={training} now={now} reduced={reduced||paused} preview={preview} onSelect={()=>onZone('square')}/>
  {[-2,2].map(x=>[-2.15,2.15].map(z=><group key={`${x}-${z}`} position={[x,0,z]} rotation={[0,z<0?Math.PI:0,0]}><Round at={[0,.6,0]} size={[.75,.16,.7]} color="#6a7e92"/><Block at={[0,.28,0]} size={[.09,.56,.09]} color="#34475a"/><Round at={[0,1,.3]} size={[.75,.8,.12]} color="#6a7e92"/></group>))}<Plant at={[9,0,-5.8]}/><Plant at={[-9,0,4.9]}/><Plant at={[9,0,5]}/>
  <Line points={[[-5,.025,4.5],[-5,.025,2.3],[-4,.025,2.3],[-4,.025,-1]]} color="#658fba" lineWidth={2}/>
  <Line points={[[4,.025,4.5],[4,.025,2.3],[5,.025,2.3],[5,.025,-1.8]]} color="#658fba" lineWidth={2}/>
  {ZONES.map(z=><Html key={z.id} portal={portal} position={[z.x,z.id==='square'?1.4:2.8,z.z]} center style={{pointerEvents:'none'}}><div className="city-building-label" data-zone={z.id} data-selected={zone===z.id}><b>{z.name}</b>{zone===z.id&&<span>{z.id==='square'?`${training.clues.length}/4 근거 공유`:training.clues.some(c=>c.zone===z.id)?'✓ 근거 공유 완료':'선택한 조사 구역'}</span>}{training.pings.some(p=>p.zone===z.id&&now-p.at<10000)&&<em>여기 확인해 주세요</em>}</div></Html>)}
  {players.map(p=><OperatorAvatar key={p.id} player={p} self={p.id===id} reduced={reduced} portal={portal} role={training.roles[p.id]||'관제 담당'} speech={chat.filter(m=>(m.player?m.player===p.id:m.name===p.name)&&now-m.at<6500).at(-1)?.text}/>)}
  <Camera focus={focus} reset={reset} reduced={reduced}/>
 </Canvas>}</>;
}
