'use client';
import {memo,useEffect,useMemo,useRef,useState} from 'react';
import {Canvas,useFrame,useThree} from '@react-three/fiber';
import {Html,OrbitControls} from '@react-three/drei';
import type {OrbitControls as OrbitControlsImpl} from 'three-stdlib';
import * as THREE from 'three';
import {opaqueRenderer} from '../war-room/scene';
import type {RoomState} from '../war-room/types';
import type {PeacePlayer} from './types';
import RitualAvatar from './ritual-avatar';
import HanokGarden,{gardenFloorY} from './hanok-garden';
function Cadence({low,active}:{low:boolean;active:boolean}){const invalidate=useThree(s=>s.invalidate);useEffect(()=>{if(!active)return;const timer=setInterval(()=>{if(!document.hidden)invalidate();},1000/(low?20:30));return()=>clearInterval(timer);},[invalidate,low,active]);return null;}
function GardenCamera({reset,reduced,focus,panelOpen}:{reset:number;reduced:boolean;focus?:PeacePlayer;panelOpen:boolean}){
 const {camera,size,gl}=useThree(),controls=useRef<OrbitControlsImpl>(null),moving=useRef(true),first=useRef(true);
 const frame=useMemo(()=>{
  const portrait=size.width/size.height<.85;
  if(focus){const target=new THREE.Vector3(focus.x,1.4+gardenFloorY(focus.x,focus.z),focus.z);if(portrait&&panelOpen)target.y-=1.45;return {target,position:target.clone().add(new THREE.Vector3(Math.abs(focus.x)>6?-Math.sign(focus.x)*6:.7,Math.abs(focus.x)>6?2.3:3.4,Math.abs(focus.x)>6?3.2:7.1)),distance:8};}
  const target=portrait?new THREE.Vector3(-9,1.7,-12):new THREE.Vector3(0,1.7,-24),position=portrait?new THREE.Vector3(5,2.7,20):new THREE.Vector3(0,2.7,19);return {target,position,distance:position.distanceTo(target)};
 },[size.width,size.height,focus?.x,focus?.z,!!focus&&panelOpen]);
 useEffect(()=>{const view=camera as THREE.PerspectiveCamera;view.fov=size.width/size.height<.85?64:58;view.updateProjectionMatrix();moving.current=true;gl.domElement.dataset.cameraSettled='false';},[reset,frame,gl]);
 useFrame((_,dt)=>{if(!controls.current||!moving.current)return;const blend=first.current||reduced?1:1-Math.exp(-dt*5);camera.position.lerp(frame.position,blend);controls.current.target.lerp(frame.target,blend);controls.current.update();first.current=false;if(camera.position.distanceTo(frame.position)<.02){moving.current=false;gl.domElement.dataset.cameraSettled='true';}});
 return <OrbitControls ref={controls} makeDefault enablePan={false} enableDamping dampingFactor={.12} onStart={()=>moving.current=false} minDistance={focus?5:12} maxDistance={55} minPolarAngle={.85} maxPolarAngle={1.62} minAzimuthAngle={focus?-1.3:-.65} maxAzimuthAngle={focus?1.3:.8}/>;
}
function PeaceScene({players,chat,id,low,reduced,quiet,now,reset,closeView,panelOpen=false,active=true,onMove}:{players:PeacePlayer[];chat:RoomState['chat'];id:string;low:boolean;reduced:boolean;quiet:boolean;now:number;reset:number;closeView:boolean;panelOpen?:boolean;active?:boolean;onMove:(x:number,z:number)=>void}){
 const [labels,setLabels]=useState<HTMLDivElement|null>(null),portal=useMemo(()=>labels?{current:labels}:undefined,[labels]);const wish=chat.filter(m=>m.text.startsWith('🌿 소원 · ')).at(-1);
 return <><div ref={setLabels} className="peace-label-host"/>{labels&&<Canvas frameloop="demand" shadows={!low} dpr={low?1:[1,1.5]} camera={{position:[0,2.7,15],fov:58,near:.1,far:300}} gl={defaults=>{const gl=opaqueRenderer(defaults.canvas as HTMLCanvasElement,low);gl.toneMapping=THREE.NoToneMapping;gl.outputColorSpace=THREE.SRGBColorSpace;return gl;}} onCreated={({gl})=>gl.setClearColor('#dce9e7',1)}>
  <Cadence low={low} active={active}/><ambientLight intensity={.35}/><hemisphereLight args={['#fff6df','#8a9275',.85]}/><directionalLight color="#fff3d9" position={[-7,15,6]} intensity={1.5} castShadow={!low} shadow-mapSize={[1024,1024]} shadow-camera-left={-14} shadow-camera-right={14} shadow-camera-top={13} shadow-camera-bottom={-13} shadow-camera-near={1} shadow-camera-far={40} shadow-bias={-.00015} shadow-normalBias={.035}/>
  <HanokGarden low={low} reduced={reduced} onMove={onMove}/>
  {wish&&!quiet&&!panelOpen&&<Html portal={portal} position={[1.3,2.15,-2.3]} center style={{pointerEvents:'none'}}><span className="peace-wish-label">{wish.text.slice('🌿 소원 · '.length,68)}</span></Html>}
  {players.map(p=><RitualAvatar key={p.id} player={p} self={p.id===id} reduced={reduced} portal={portal} now={now} speech={quiet?undefined:chat.filter(m=>(m.player?m.player===p.id:m.name===p.name)&&now-m.at<6500).at(-1)?.text}/>)}
  <GardenCamera reset={reset} reduced={reduced} focus={closeView?players.find(p=>p.id===id):undefined} panelOpen={panelOpen}/>
 </Canvas>}</>;
}

// Animation uses performance.now() between snapshots. UI clock ticks are coalesced; the once-per-second update expires chat bubbles.
export default memo(PeaceScene,(a,b)=>(!a.active&&!b.active)||Math.floor(a.now/1000)===Math.floor(b.now/1000)&&a.players===b.players&&a.chat===b.chat&&a.id===b.id&&a.low===b.low&&a.reduced===b.reduced&&a.quiet===b.quiet&&a.reset===b.reset&&a.closeView===b.closeView&&a.panelOpen===b.panelOpen&&a.active===b.active&&a.onMove===b.onMove);
