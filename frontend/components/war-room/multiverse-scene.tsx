'use client';
import {Canvas,useFrame,useThree} from '@react-three/fiber';
import {Html,Line} from '@react-three/drei';
import {useEffect,useMemo,useRef,useState,type RefObject} from 'react';
import {Vector3,type PerspectiveCamera} from 'three';
import OperatorAvatar from './operator-avatar';
import {components,dependencies,type Result,type Component} from './campus-model';
import {worlds} from './campus-worlds';
import {fieldAnchors,fieldPosition,fieldDestination} from './campus-field';
import type {Player} from './types';
const statusColor=(s:string)=>s==='정상'?'#4ed6b0':s==='장애'?'#ff6652':'#ffbc53';
function FollowCamera({position,heading,zoom,world,low,reduced,onArrive,goal}:{position:RefObject<Vector3>;heading:number;zoom:number;world:number;low:boolean;reduced:boolean;onArrive:(arrived:boolean)=>void;goal:Vector3}){
 const {camera,invalidate,size}=useThree(),ready=useRef(false),wasArrived=useRef(false);
 useEffect(()=>{const timer=setInterval(()=>{if(!document.hidden)invalidate();},low?66:33);return()=>clearInterval(timer);},[invalidate,low]);
 useEffect(()=>{wasArrived.current=false;onArrive(false);},[world,onArrive]);
 useFrame((_,dt)=>{const p=position.current,wide=size.width>700,distance=(wide?13:16)/Math.sqrt(zoom),offset=new Vector3(Math.sin(heading)*distance,wide?6.3:8,Math.cos(heading)*distance),target=p.clone().add(offset),look=p.clone().add(new Vector3(-Math.sin(heading)*(wide?7:3),1.8,-Math.cos(heading)*(wide?7:3)));
 if(!ready.current||reduced){camera.position.copy(target);ready.current=true;}else camera.position.lerp(target,1-Math.exp(-Math.min(dt,.1)*5));camera.lookAt(look);const c=camera as PerspectiveCamera;c.fov=wide?66:72;c.updateProjectionMatrix();const arrived=p.distanceTo(goal)<.3;if(arrived!==wasArrived.current){wasArrived.current=arrived;onArrive(arrived);}});
 return null;
}
function Box({position,size,color}:{position:[number,number,number];size:[number,number,number];color:string}){return <mesh position={position} receiveShadow><boxGeometry args={size}/><meshStandardMaterial color={color} roughness={.8}/></mesh>;}
function Equipment({component:c,status,active}:{component:Component;status:string;active:boolean}){
 const light=statusColor(status);
 return <group>
 <Box position={[0,.12,0]} size={[3.6,.24,3.2]} color={active?'#c89e55':'#788b8d'}/>
 {c.kind==='database'?<>
 <Box position={[0,1.5,0]} size={[3,2.7,1.8]} color={c.id==='graph'?'#527f80':'#406985'}/>
 <Box position={[0,1.5,.94]} size={[2.8,2.5,.08]} color="#233b4a"/>
 {Array.from({length:12},(_,i)=><group key={i}><Box position={[-.9+(i%3)*.9,.55+Math.floor(i/3)*.5,1]} size={[.75,.34,.1]} color="#83949b"/><Box position={[-.64+(i%3)*.9,.55+Math.floor(i/3)*.5,1.07]} size={[.08,.1,.03]} color={light}/></group>)}
 <Box position={[0,2.65,1.05]} size={[2.4,.18,.04]} color={light}/>
 </>:c.kind==='queue'?<>
 <Box position={[0,.65,0]} size={[3,1.1,2]} color="#a4b9b4"/>
 {[0,1,2].map(i=><Box key={i} position={[-.8+i*.8,1.4,0]} size={[.6,.4,1.3]} color={i===0?light:'#426e83'}/>)}
 <Box position={[0,1.1,1.1]} size={[3.2,.15,.15]} color="#485c62"/>
 </>:c.kind==='feature'||c.kind==='entry'?<>
 <Box position={[0,1.3,0]} size={[.45,2.4,.45]} color="#697d86"/>
 <Box position={[0,2.45,0]} size={[2.7,1.7,.35]} color="#243c4b"/>
 <Box position={[0,2.45,.2]} size={[2.4,1.4,.04]} color="#172e3b"/>
 {[0,1,2].map(i=><Box key={i} position={[-.6,2.85-i*.4,.24]} size={[1.1+i*.3,.12,.02]} color={i===0?light:'#74a5b7'}/>)}
 </>:<>
 <Box position={[0,1.9,0]} size={[2,3.5,1.7]} color="#344c5b"/>
 <Box position={[0,1.9,.89]} size={[1.8,3.25,.06]} color="#182d3b"/>
 {[0,1,2,3,4,5].map(i=><group key={i}><Box position={[0,.55+i*.51,.95]} size={[1.6,.34,.06]} color="#526975"/><Box position={[.57,.55+i*.51,1]} size={[.13,.13,.03]} color={light}/><Box position={[-.2,.55+i*.51,1]} size={[.7,.06,.03]} color="#162c38"/></group>)}
 </>}
 {active&&<mesh rotation={[-Math.PI/2,0,0]} position={[0,.28,0]}><ringGeometry args={[2,2.12,48]}/><meshBasicMaterial color="#f6c772"/></mesh>}
 </group>;
}
function Landscape({low}:{low:boolean}){
 return <>
 <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.15,-12]}><planeGeometry args={[220,220]}/><meshStandardMaterial color="#647480"/></mesh>
 <Box position={[0,-.03,-8]} size={[7,.1,82]} color="#80919c"/>
 {[-1,-23,19].map(z=><Box key={z} position={[0,.01,z+3]} size={[49,.12,6]} color="#7d8c96"/>)}
 {[-31,31].map(x=><group key={x}><Box position={[x,2,-13]} size={[.12,4,62]} color="#728da0"/><Box position={[x,4.4,-13]} size={[2,.15,62]} color="#465c6b"/></group>)}
 {[-24,24].flatMap(x=>[-15,8,28].map(z=><group key={`${x}:${z}`} position={[x,0,z]}><Box position={[0,2.4,0]} size={[.15,4.8,.15]} color="#667c82"/><Box position={[0,4.8,0]} size={[1.2,.12,.6]} color="#f2e6c4"/></group>))}
 <Box position={[0,2,-53]} size={[62,4,.2]} color="#647784"/>
 <Box position={[0,.04,19]} size={[10,.08,6]} color="#b8c3bf"/>
 <Box position={[0,1,17]} size={[3.8,1.5,.7]} color="#496b7e"/>
 </>;
}
export default function MultiverseScene({world,players,id,results,onVisit,onMove,onSelect,zoom,low,reduced,heading,selected,focus,origin,onArrive}:{world:number;players:Player[];id:string;results:Result[];onVisit:(w:number)=>void;onMove:(x:number,z:number)=>void;onSelect:(id:string)=>void;zoom:number;low:boolean;reduced:boolean;heading:number;selected:string;focus:string;origin:string;onArrive:(v:boolean)=>void}){
 const [compact,setCompact]=useState(false);useEffect(()=>{const q=matchMedia('(max-width:700px)'),update=()=>setCompact(q.matches);update();q.addEventListener('change',update);return()=>q.removeEventListener('change',update);},[]);
 const labels=useRef<HTMLDivElement>(null!),self=players.find(p=>p.id===id),anchor=fieldAnchors[world]||fieldAnchors[0],goal=useMemo(()=>new Vector3((self?.x||0)+anchor[0],.06,(self?.z||0)+anchor[1]),[self?.x,self?.z,anchor]),rendered=useRef(goal.clone());
 const visible=players.slice().sort((a,b)=>Number(b.id===id)-Number(a.id===id)).slice(0,low?6:20);
 const focused=selected||focus,activeLinks=dependencies.filter(e=>e.from===focused||e.to===focused||results.some(r=>r.path.includes(e.from)&&r.path.includes(e.to)));
 function walk(x:number,z:number){const destination=fieldDestination(x,z);if(destination.world!==world)onVisit(destination.world);else onMove(destination.x,destination.z);}
 return <><div ref={labels} className="campus-label-root"/><Canvas camera={{position:[0,9,36],fov:66,near:.1,far:200}} dpr={low?1:[1,1.5]} frameloop="demand" gl={{antialias:!low}} onCreated={({gl})=>gl.setClearColor('#334957')}>
 <hemisphereLight args={['#edf8ff','#3b4f61',1.5]}/><directionalLight position={[-15,35,18]} intensity={2}/>
 <FollowCamera position={rendered} goal={goal} heading={heading} zoom={zoom} world={world} low={low} reduced={reduced} onArrive={onArrive}/>
 <group onClick={e=>{e.stopPropagation();walk(e.point.x,e.point.z);}}><Landscape low={low}/></group>
 {worlds.slice(1).map((w,i)=>{const [x,z]=fieldAnchors[i+1],zoneResults=components.filter(c=>c.zone===i).map(c=>results.find(r=>r.id===c.id)!),bad=zoneResults.filter(r=>r.status!=='정상').length,guideZone=components.find(c=>c.id===focus)?.zone===i;return <group key={w.name} position={[x,0,z]}>
 <Box position={[0,.04,0]} size={[20,.16,14]} color={guideZone?'#b2c3c2':'#bdc8c5'}/>
 <Box position={[0,.16,6.7]} size={[20,.08,.18]} color={bad?'#e18b6a':w.color}/>
 {[-9,9].map(p=><Box key={p} position={[p,2.5,-6]} size={[.25,5,.25]} color="#8da5aa"/>)}
 <Box position={[0,4.9,-6]} size={[18.4,.2,.25]} color="#91a8aa"/>
 {(!compact||(world===0&&i<2))&&<Html portal={labels} position={[compact?(i===0?6:-6):0,compact?2.1:world===0&&i>1?10:5.2,compact?4:-6]} center zIndexRange={[5,0]}><button className="field-zone-label" aria-label={`${w.name} 구역으로 이동`} onClick={()=>onVisit(i+1)}><b>{w.name}</b><span>{bad?`△ ${bad}개 영향`:'● 정상'}{guideZone?' · 확인 구역':''}</span></button></Html>}
 </group>;})}
 {activeLinks.map(e=>{const a=fieldPosition(e.from),b=fieldPosition(e.to),affected=results.find(r=>r.id===e.from)?.path.includes(e.to),points:[number,number,number][]=[[a[0],.25,a[2]+2],[a[0],.25,a[2]+5],[b[0],.25,b[2]+5],[b[0],.25,b[2]+2]];return <group key={e.from+e.to}><Line points={points} color={affected?'#dd7953':'#5b9db5'} lineWidth={affected?3:1.5}/><mesh position={[b[0],.3,b[2]+2.4]} rotation={[-Math.PI/2,0,0]}><coneGeometry args={[.25,.7,3]}/><meshBasicMaterial color={affected?'#dd7953':'#5b9db5'}/></mesh></group>;})}
 {components.map(c=>{const p=fieldPosition(c.id),r=results.find(r=>r.id===c.id)!,active=focused===c.id;return <group key={c.id} position={p} onClick={e=>{e.stopPropagation();onSelect(c.id);}}><Equipment component={c} status={r.status} active={active}/>
 {(active||c.zone===world-1)&&<Html portal={labels} position={[0,c.kind==='queue'?2.4:4.1,0]} center zIndexRange={[6,1]}><button className="field-equipment-label" aria-label={`${c.name} · ${r.status}`} onClick={()=>onSelect(c.id)}><b>{c.short}</b><span style={{color:statusColor(r.status)}}>{r.status==='정상'?(c.id===origin?'● 정상 · 시작점':'● 정상'):c.id===origin?'× 최초 장애':`△ ${r.status}`}</span></button></Html>}
 {c.id===origin&&r.status!=='정상'&&<mesh position={[0,2,0]}><cylinderGeometry args={[2.1,2.1,4,24,1,true]}/><meshBasicMaterial color="#f58166" transparent opacity={.1} depthWrite={false}/></mesh>}
 </group>;})}
 {visible.map(p=>{const [x,z]=fieldAnchors[p.floor-1]||fieldAnchors[0];return <OperatorAvatar key={p.id} player={{...p,x:p.x+x,z:p.z+z}} self={p.id===id} reduced={reduced} role={p.id===id?'내 시점 · 바닥 탭 이동':worlds[p.floor-1]?.name||'동료'} portal={labels} travelSpeed={reduced?200:12} routeLaneX={0} renderedPosition={p.id===id?rendered:undefined}/>;})}
 </Canvas></>;
}
