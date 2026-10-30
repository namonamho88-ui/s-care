'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {Canvas,useFrame,useThree} from '@react-three/fiber';
import {Html,Line,OrbitControls} from '@react-three/drei';
import * as THREE from 'three';
import {Avatar,opaqueRenderer} from './scene';
import {responseFraming} from './camera-framing';
import {ZONES,displayedMetrics,type Training} from './city-types';
import type {Player} from './types';
function Block({at,size,color}:{at:[number,number,number];size:[number,number,number];color:string}){return <mesh position={at} castShadow receiveShadow><boxGeometry args={size}/><meshStandardMaterial color={color} roughness={.85}/></mesh>;}
function Camera({focus,reset}:{focus:string;reset:number}){
 const {camera,size}=useThree();const controls=useRef<any>(null),moving=useRef(true);
 const framing=useMemo(()=>{const f=responseFraming(1,size.width/Math.max(1,size.height),48);const direction=f.position.clone().sub(f.target).multiplyScalar(.88);f.target.set(0,.8,0);f.position.copy(f.target).add(direction);f.distance*=.88;return f;},[size]);
 useEffect(()=>{moving.current=true;},[focus,reset,size.width,size.height]);
 useFrame((_,dt)=>{if(!controls.current||!moving.current)return;const zone=ZONES.find(z=>z.id===focus),target=zone?new THREE.Vector3(zone.x*.6,1,zone.z):framing.target;const position=zone?target.clone().add(new THREE.Vector3(0,10,13)):framing.position;const blend=1-Math.exp(-dt*5);camera.position.lerp(position,blend);controls.current.target.lerp(target,blend);controls.current.update();if(camera.position.distanceTo(position)<.02)moving.current=false;});
 return <OrbitControls ref={controls} makeDefault enablePan={false} onStart={()=>moving.current=false} minDistance={12} maxDistance={framing.distance*1.6} minPolarAngle={.3} maxPolarAngle={Math.PI/3} minAzimuthAngle={-Math.PI/3} maxAzimuthAngle={Math.PI/3}/>;
}
function Cadence({low}:{low:boolean}){const invalidate=useThree(s=>s.invalidate);useEffect(()=>{const timer=setInterval(()=>{if(!document.hidden)invalidate();},1000/(low?20:30));return()=>clearInterval(timer);},[invalidate,low]);return null;}
function Traffic({bad,bypass,reduced}:{bad:boolean;bypass:boolean;reduced:boolean}){
 const packet=useRef<THREE.Mesh>(null);const points=useMemo(()=>bypass?[new THREE.Vector3(-6,.25,-.8),new THREE.Vector3(-6,.25,1.2),new THREE.Vector3(3,.25,1.2),new THREE.Vector3(3,.25,-1.8)]:[new THREE.Vector3(-6,.25,-.8),new THREE.Vector3(-3,.25,-.8),new THREE.Vector3(0,.25,-.8)],[bypass]);
 const curve=useMemo(()=>new THREE.CatmullRomCurve3(points,false,'catmullrom',.05),[points]);
 useFrame(s=>{if(packet.current)packet.current.position.copy(curve.getPoint(reduced?.5:(s.clock.elapsedTime*(bad?.07:.25))%1));});
 return <><Line points={curve.getPoints(30)} color={bad?'#b94737':'#1761cb'} lineWidth={3} dashed={bad} dashSize={.25} gapSize={.2}/><mesh ref={packet}><boxGeometry args={[.22,.22,.22]}/><meshBasicMaterial color={bad?'#9b311e':'#174ca2'}/></mesh></>;
}
function Customer({index,walking,reduced}:{index:number;walking:boolean;reduced:boolean}){const root=useRef<THREE.Group>(null);useFrame(s=>{if(!root.current||reduced||!walking)return;const phase=(s.clock.elapsedTime*.12+index*.5)%1;root.current.position.set(-7+Math.sin(phase*Math.PI*2)*1.1,Math.abs(Math.sin(s.clock.elapsedTime*5))*.03,1.2+Math.cos(phase*Math.PI*2));root.current.rotation.y=-phase*Math.PI*2;});return <group ref={root} position={[-6.9+(index%3)*.55,0,-.25+Math.floor(index/3)*.55]}><Block at={[0,.48,0]} size={[.27,.5,.3]} color={index%2?'#3b6488':'#a07d63'}/>{[-.08,.08].map(x=><Block key={x} at={[x,.12,0]} size={[.09,.24,.15]} color="#23405b"/>)}<mesh position={[0,.88,0]}><sphereGeometry args={[.18,8,8]}/><meshStandardMaterial color="#e2b794"/></mesh></group>;}
function Customers({count,reduced,walking}:{count:number;reduced:boolean;walking:boolean}){return <>{Array.from({length:count},(_,i)=><Customer key={i} index={i} reduced={reduced} walking={walking}/>)}</>;}
export default function CityScene({training,players,id,zone,onZone,onMove,low,reduced,focus,reset,now,preview,paused}:{training:Training;players:Player[];id:string;zone:string;onZone:(id:string)=>void;onMove:(x:number,z:number)=>void;low:boolean;reduced:boolean;focus:string;reset:number;now:number;preview:string;paused:boolean}){
 const [labels,setLabels]=useState<HTMLDivElement|null>(null),portal=useMemo(()=>labels?{current:labels}:undefined,[labels]);
 const metrics=displayedMetrics(training,now),normal=training.stage==='LOBBY'||training.stage==='RESULT',active=['EXECUTING','VERIFY','RESULT'].includes(training.stage),bypass=active&&training.selected==='bypass';
 const count=normal?2:Math.max(1,Math.ceil(metrics.queue/15));
 // Dedicated DOM host: Drei owns its children; React only owns the empty host.
 // This avoids mixed ownership when the complete Canvas is removed on leaving.
 return <><div ref={setLabels} className="city-label-host"/>{labels&&<Canvas frameloop="demand" shadows={!low} dpr={low?[1,1.5]:[1,2]} camera={{position:[0,20,24],fov:48,near:.1,far:150}} gl={defaults=>{const gl=opaqueRenderer(defaults.canvas as HTMLCanvasElement,low);gl.toneMapping=THREE.NoToneMapping;gl.outputColorSpace=THREE.SRGBColorSpace;return gl;}} onCreated={({gl})=>gl.setClearColor('#eef4fb')}>
  <Cadence low={low}/><ambientLight intensity={.65}/><hemisphereLight args={['#ffffff','#8798ad',.65]}/><directionalLight position={[3,16,8]} intensity={1.3} castShadow={!low} shadow-mapSize={[1024,1024]} shadow-camera-left={-12} shadow-camera-right={12} shadow-camera-top={10} shadow-camera-bottom={-10} shadow-normalBias={.04}/>
  <mesh rotation={[-Math.PI/2,0,0]} receiveShadow onClick={e=>{if(e.delta<5){e.stopPropagation();onMove(e.point.x,e.point.z);}}}><planeGeometry args={[20,14]}/><meshStandardMaterial color="#e2eaf3" roughness={1}/></mesh>
  <Block at={[0,.025,2.6]} size={[18,.04,1.3]} color="#ffffff"/>
  {ZONES.filter(z=>z.id!=='square').map((z,i)=>{const alarm=!normal&&(z.id==='app'||z.id==='shop'),label=z.id==='app'?normal?'v2.7 · 정상':active&&training.selected==='rollback'?'v2.7 · 교체':'v2.8 · 조사 대상':z.id==='shop'?normal?'✓ 결제 정상':'! 결제 지연':z.id==='db'?'✓ CPU 32% · 쿼리 정상':z.id==='network'?bypass?'↪ 우회 경로':'✓ 손실 0%':'◇ 시험 전용';return <group key={z.id} position={[z.x,0,z.z]} onClick={e=>{if(e.delta<5){e.stopPropagation();onZone(z.id);}}}>
   <Block at={[0,1,0]} size={[2.25,2,1.8]} color={zone===z.id?'#bfd6f8':'#ffffff'}/><Block at={[0,2.05,0]} size={[2.4,.18,2]} color={alarm?'#a43f30':'#163b67'}/><Block at={[0,.9,.92]} size={[1.8,1.1,.04]} color="#244c75"/>
   {[-.6,0,.6].map(x=><Block key={x} at={[x,1,.96]} size={[.35,.7,.03]} color={alarm?'#eeb394':'#9cc8e8'}/>)}
   {z.id==='shop'&&<><Block at={[0,1.65,1.1]} size={[2.5,.2,.65]} color="#d59757"/><Block at={[0,.45,1.3]} size={[1.5,.6,.35]} color="#193c65"/></>}
   {z.id==='app'&&[-.6,.6].map(x=><group key={x}><Block at={[x,1,1.08]} size={[.65,1.65,.25]} color="#173556"/>{[.4,.8,1.2,1.6].map(y=><Block key={y} at={[x,y,1.23]} size={[.5,.08,.03]} color={alarm?'#e98662':'#64a98c'}/>)}</group>)}
   {z.id==='db'&&<mesh position={[0,2.55,0]}><cylinderGeometry args={[.75,.75,.8,16]}/><meshStandardMaterial color="#7fa6ca" roughness={.7}/></mesh>}
   {z.id==='network'&&[-.7,.7].map(x=><group key={x}><Block at={[x,2.45,0]} size={[.12,.8,.12]} color="#244a73"/><mesh position={[x,2.9,0]}><sphereGeometry args={[.16,8,8]}/><meshStandardMaterial color={bypass?'#3170d2':'#6b8caa'}/></mesh></group>)}
   {z.id==='trial'&&<><Block at={[0,1.6,1.05]} size={[1.7,.9,.15]} color="#6b55a4"/><Block at={[0,1.6,1.14]} size={[1.4,.6,.04]} color="#e5def5"/></>}
   <Html portal={portal} position={[0,3.1,0]} center style={{pointerEvents:'none'}}><div className="city-building-label" data-zone={z.id} data-selected={zone===z.id} title={label}><b>{i+1}. {['결제','서버','DB','통신','시험'][i]}</b><span>{z.id==='trial'?'◇ 시험':alarm?'! 지연':'✓ 정상'}</span>{training.clues.some(c=>c.zone===z.id)&&<small>✓ 공유</small>}{training.pings.some(p=>p.zone===z.id&&now-p.at<10000)&&<em>📍 여기 확인</em>}</div></Html>
  </group>;})}
  <Traffic bad={!normal&&!active} bypass={bypass} reduced={reduced||paused}/><Customers count={count} reduced={reduced||paused} walking={normal}/>
  {training.clues.map(c=>{const z=ZONES.find(z=>z.id===c.zone)!;return <Line key={c.id} points={[[z.x,.15,z.z+1],[z.x,.15,2.5],[0,.15,3.8]]} color="#7a8fa8" lineWidth={1} dashed dashSize={.15} gapSize={.2}/>;})}
  {preview&&<><Line points={preview==='bypass'?[[-6,.6,-.8],[-6,.6,1.3],[3,.6,1.3],[6,.6,-1.8]]:[[-3,.6,-1.8],[6,.6,-1.8]]} color="#8656bd" lineWidth={2} dashed dashSize={.2} gapSize={.15}/><Html portal={portal} position={[6,4.2,-3]} center style={{pointerEvents:'none'}}><span className="city-preview-label">◇ 시험 미리보기 · 도시 적용 전</span></Html></>}
  <Html portal={portal} position={[-7,.1,1.8]} center style={{pointerEvents:'none'}}><span className="city-npc-label">도시 NPC · 고객 대기 {metrics.queue}건</span></Html>
  <Block at={[0,.5,4.8]} size={[5,1,1]} color="#173d65"/>
  <Html portal={portal} position={[0,1.1,5.8]} center style={{pointerEvents:'none'}}><span className="city-building-label"><b>중앙 상황실 · {training.clues.length}/4 단서</b></span></Html>
  {players.map(p=><Avatar key={p.id} player={{...p,floor:1}} self={p.id===id} reduced={reduced} fixedLabels portal={portal} message={training.roles[p.id]||'관제 담당'}/>)}
  <Camera focus={focus} reset={reset}/>
 </Canvas>}</>;
}
