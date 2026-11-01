'use client';
import {Canvas,useThree} from '@react-three/fiber';
import {Html,OrbitControls} from '@react-three/drei';
import {useEffect,useRef} from 'react';
import type {OrthographicCamera} from 'three';
import OperatorAvatar from './operator-avatar';
import {components,type Result} from './campus-model';
import {worlds} from './campus-worlds';
import type {Player} from './types';
function View({zoom,world,reduced}:{zoom:number;world:number;reduced:boolean}){const {camera,size,invalidate}=useThree();useEffect(()=>{const c=camera as OrthographicCamera;c.zoom=Math.min(size.width/24,size.height/21)*zoom;c.updateProjectionMatrix();invalidate();},[camera,size,zoom,world,invalidate]);useEffect(()=>{const timer=setInterval(()=>{if(!document.hidden)invalidate();},reduced?200:66);return()=>clearInterval(timer);},[invalidate,reduced]);return <OrbitControls enableRotate={false} enablePan={false} minZoom={8} maxZoom={80} target={[0,0,0]}/>;}
export default function MultiverseScene({world,players,id,results,onVisit,onMove,onSelect,zoom,low,reduced}:{world:number;players:Player[];id:string;results:Result[];onVisit:(w:number)=>void;onMove:(x:number,z:number)=>void;onSelect:(id:string)=>void;zoom:number;low:boolean;reduced:boolean}){
 const labels=useRef<HTMLDivElement>(null!);const here=worlds[world]||worlds[0],nodes=components.filter(c=>c.zone===here.zone),people=players.filter(p=>p.floor===world+1).sort((a,b)=>Number(b.id===id)-Number(a.id===id)).slice(0,low?6:20);
 return <><div ref={labels} className="campus-label-root"/><Canvas orthographic camera={{position:[8,24,30],zoom:20,near:.1,far:120}} dpr={low?1:[1,1.5]} frameloop="demand" gl={{antialias:!low}} onCreated={({gl})=>gl.setClearColor('#101a30')}>
 <ambientLight intensity={2}/><directionalLight position={[4,18,8]} intensity={2.3}/><View world={world} zoom={zoom} reduced={reduced}/>
 <mesh position={[0,-.35,0]} onClick={e=>{e.stopPropagation();onMove(e.point.x,e.point.z);}}><cylinderGeometry args={[11,10,.6,low?32:64]}/><meshStandardMaterial color={world===0?'#293d56':'#29374b'}/></mesh>
 <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.035,1]}><ringGeometry args={[3.2,3.3,48]}/><meshBasicMaterial color={here.color}/></mesh>
 {(world===0?[1,2,3,4]:[0]).map((w,i)=>{const x=world===0?(i-1.5)*5:-7;return <group key={w} position={[x,0,-3.5]} onClick={e=>{e.stopPropagation();onVisit(w);}}><mesh position={[0,1.6,0]}><torusGeometry args={[1.3,.13,8,32]}/><meshStandardMaterial color={worlds[w].color} emissive={worlds[w].color} emissiveIntensity={.8}/></mesh><mesh position={[0,1.6,0]}><circleGeometry args={[1.19,32]}/><meshBasicMaterial color={worlds[w].color} transparent opacity={.2} side={2}/></mesh><mesh position={[0,.05,0]}><cylinderGeometry args={[1.5,1.7,.2,24]}/><meshStandardMaterial color="#526581"/></mesh><Html portal={labels} position={[0,3.5,0]} center><button className="mv-portal-label mv-world-label" aria-label={`${worlds[w].name} 포털 이동`} onClick={()=>onVisit(w)}>{worlds[w].name.split(' ').map((part,index)=><span key={index}>{part}</span>)}{!low&&<small>포털 이동 ↗</small>}</button></Html></group>;})}
 {nodes.map((c,i)=>{const r=results.find(r=>r.id===c.id)!,color=r.status==='정상'?'#79d9bc':'#ff9b84',x=(i-(nodes.length-1)/2)*4+1.5;return <group key={c.id} position={[x,0,-3.5]} onClick={e=>{e.stopPropagation();onSelect(c.id);}}><mesh position={[0,.9,0]}>{c.kind==='database'?<cylinderGeometry args={[.8,.8,1.8,16]}/>:<boxGeometry args={[1.7,1.8,1.5]}/>}<meshStandardMaterial color={here.color}/></mesh><mesh position={[0,1.95,0]}><boxGeometry args={[1.5,.15,1.4]}/><meshBasicMaterial color={color}/></mesh><Html portal={labels} position={[0,2.8,0]} center><button className="mv-portal-label" aria-label={`${c.name} · ${r.status}`} onClick={()=>onSelect(c.id)}>{low?({pg:'PG',queue:'작업 큐',portal:'UI',api:'API',intake:'접수',impact:'영향',knowledge:'지식',report:'이력'} as Record<string,string>)[c.id]||c.short:c.short}<small style={{color}}>{r.status==='정상'?'●':'△'} {r.status}</small></button></Html></group>;})}
 {world===0&&<mesh position={[0,.5,0]}><octahedronGeometry args={[.65]}/><meshStandardMaterial color="#b7dcff" emissive="#4888ce" emissiveIntensity={.5} wireframe/></mesh>}
 {people.map(p=><OperatorAvatar key={p.id} player={p} self={p.id===id} reduced={reduced} role={p.id===id?'바닥을 탭해 이동':'함께 탐험 중'} portal={labels}/>)}
 </Canvas></>;
}
