'use client';
import {Canvas,useThree,useFrame} from '@react-three/fiber';
import {Html,Line,OrbitControls} from '@react-three/drei';
import {useEffect,useRef} from 'react';
import {Vector3,OrthographicCamera} from 'three';
import type {OrbitControls as Controls} from 'three-stdlib';
import {components,dependencies,type Result} from './campus-model';
const color=(status:string)=>status==='장애'?'#f16b76':status==='영향받음'?'#eba860':status==='주의'?'#e7ca68':'#51bfae';
function Camera({selected,reset,zoom,reduced}:{selected:string;reset:number;zoom:number;reduced:boolean}){
 const {camera,size,invalidate}=useThree();const controls=useRef<Controls>(null);const destination=useRef(new Vector3());const desired=useRef(16);const framing=useRef(true);
 useEffect(()=>{framing.current=true;const c=components.find(n=>n.id===selected);destination.current.set(c?c.position[0]:1,0,c?c.position[1]:0);desired.current=Math.min(size.width/37,size.height/29)*(c?1.8:1)*zoom;invalidate();},[selected,reset,size.width,size.height,zoom,invalidate]);
 useFrame(()=>{if(!framing.current)return;const cam=camera as OrthographicCamera;const target=controls.current?.target;if(!target)return;const distance=target.distanceTo(destination.current);if(distance>.005||Math.abs(cam.zoom-desired.current)>.005){const old=target.clone();target.lerp(destination.current,reduced?1:.14);camera.position.add(target.clone().sub(old));cam.zoom+=(desired.current-cam.zoom)*(reduced?1:.14);cam.updateProjectionMatrix();controls.current?.update();invalidate();}else framing.current=false;});
 return <OrbitControls ref={controls} enableRotate={false} enablePan={false} enableZoom minZoom={5} maxZoom={100} zoomSpeed={.6} target={[1,0,0]}/>;
}
export default function CampusScene({results,selected,onSelect,reset,zoom,low,reduced}:{results:Result[];selected:string;onSelect:(id:string)=>void;reset:number;zoom:number;low:boolean;reduced:boolean}){
 const labels=useRef<HTMLDivElement>(null!);
 return <><div ref={labels} className="campus-label-root"/><Canvas orthographic camera={{position:[26,30,32],zoom:16,near:.1,far:150}} dpr={low?1:[1,1.5]} frameloop="demand" gl={{antialias:!low,alpha:false}} onCreated={({gl})=>gl.setClearColor('#101f2b')}>
  <ambientLight intensity={1.8}/><directionalLight position={[5,20,8]} intensity={2}/>
  <Camera selected={selected} reset={reset} zoom={zoom} reduced={reduced}/>
  <mesh rotation={[-Math.PI/2,0,0]} position={[1,-.3,1]}><planeGeometry args={[38,30]}/><meshStandardMaterial color="#142936"/></mesh>
  {[[-8,6],[-2,5],[5,5],[11,5]].map(([x,width],i)=><group key={i} position={[x,-.14,0]}><mesh><boxGeometry args={[width-.7,.2,19]}/><meshStandardMaterial color={['#203d50','#243f4c','#233f44','#30394e'][i]}/></mesh></group>)}
  {dependencies.filter(e=>e.from===selected||e.to===selected).map(e=>{const a=components.find(c=>c.id===e.from)!,b=components.find(c=>c.id===e.to)!,affected=results.find(r=>r.id===e.from)!.path.includes(e.to),p1:[number,number,number]=[a.position[0],.25,a.position[1]],p2:[number,number,number]=[b.position[0],.25,b.position[1]];const direction=new Vector3(p2[0]-p1[0],0,p2[2]-p1[2]).normalize(),tip=new Vector3(...p2).addScaledVector(direction,-1.1),side=new Vector3(-direction.z,0,direction.x);return <group key={e.from+e.to}><Line points={[p1,p2]} color={affected?'#ffb16d':'#83bfff'} lineWidth={2}/><Line points={[tip.clone().addScaledVector(direction,-.6).addScaledVector(side,.3),tip,tip.clone().addScaledVector(direction,-.6).addScaledVector(side,-.3)]} color="#a9d3ff" lineWidth={2}/></group>;})}
  {components.map((c,i)=>{const r=results.find(r=>r.id===c.id)!,active=selected===c.id,height=c.kind==='database'?2.5:c.kind==='external'?1.8:1.25;return <group key={c.id} position={[c.position[0],0,c.position[1]]} onClick={e=>{e.stopPropagation();onSelect(c.id);}}>
   <mesh position={[0,.05,0]}><boxGeometry args={[2.6,.18,2.6]}/><meshStandardMaterial color={active?'#8cbdff':'#426072'}/></mesh>
   <mesh position={[0,height/2+.15,0]}>{c.kind==='database'?<cylinderGeometry args={[.8,.8,height,low?12:24]}/>:<boxGeometry args={[1.8,height,1.6]}/>}<meshStandardMaterial color={active?'#87a9d4':'#577c94'} roughness={.7}/></mesh>
   <mesh position={[0,height+.25,0]}><boxGeometry args={[1.5,.14,1.2]}/><meshStandardMaterial color={color(r.status)} emissive={color(r.status)} emissiveIntensity={.22}/></mesh>
   <Html portal={labels} position={[0,height+.65,0]} center zIndexRange={[4,0]}><button className={`campus-node-label ${active?'active':''}`} onClick={()=>onSelect(c.id)} aria-label={`${c.name} · ${r.status}`}><span style={{color:color(r.status)}}>{r.status==='정상'?'●':r.status==='장애'?'×':'△'}</span> {active?c.short:String(i+1).padStart(2,'0')}</button></Html>
  </group>;})}
 </Canvas></>;
}
