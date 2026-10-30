'use client';
import {useEffect,useMemo,useRef} from 'react';
import {Canvas,useFrame,useThree,type ThreeEvent} from '@react-three/fiber';
import {Html,Line,OrbitControls,RoundedBox} from '@react-three/drei';
import * as THREE from 'three';
import type {OrbitControls as OrbitControlsImpl} from 'three-stdlib';
import {COLORS,FLOORS,NODE_FLOOR,nodePosition,playerColor,type Node,type Player,type RoomState} from './types';

import {Operations} from './operations';
import type {Workflow} from './workflow';
import {responseFraming} from './camera-framing';

// All meshes are original procedural assets. No downloaded models or textures.
function Box({at,size,color='#294c58',glow=false}:{at:[number,number,number];size:[number,number,number];color?:string;glow?:boolean}){
 return <mesh position={at} castShadow receiveShadow><boxGeometry args={size}/><meshStandardMaterial color={color} roughness={.75} emissive={glow?color:'#000'} emissiveIntensity={glow?.35:0}/></mesh>;
}
function Plant({at}:{at:[number,number,number]}){return <group position={at}><mesh position={[0,.28,0]} castShadow><cylinderGeometry args={[.35,.25,.55,12]}/><meshStandardMaterial color="#e6d6bd"/></mesh><Box at={[0,.8,0]} size={[.09,.8,.09]} color="#73583d"/>{[-1,0,1].map((n)=><mesh key={n} position={[n*.22,1.1+Math.abs(n)*.18,n*.12]} rotation={[0,n,.4*n]} scale={[.32,.62,.25]} castShadow><sphereGeometry args={[1,10,8]}/><meshStandardMaterial color={n===0?'#5e986f':'#83ac75'} roughness={.9}/></mesh>)}</group>;}
function FloorBoards({y}:{y:number}){const ref=useRef<THREE.InstancedMesh>(null);useEffect(()=>{const o=new THREE.Object3D();for(let i=0;i<28;i++){o.position.set(0,0,-6.75+i*.5);o.updateMatrix();ref.current?.setMatrixAt(i,o.matrix);}if(ref.current)ref.current.instanceMatrix.needsUpdate=true;},[]);return <instancedMesh ref={ref} args={[undefined,undefined,28]} position={[0,y,0]} receiveShadow><boxGeometry args={[19.8,.04,.48]}/><meshStandardMaterial color="#8999a7" roughness={.9}/></instancedMesh>;}
function Floor({floor,overview,onMove}:{floor:number;overview:boolean;onMove:(x:number,z:number)=>void}){
 const y=(floor-1)*5.5,down=useRef<[number,number]|null>(null);
 const move=(e:ThreeEvent<PointerEvent>)=>{if(!down.current||overview)return;const dist=Math.hypot(e.clientX-down.current[0],e.clientY-down.current[1]);down.current=null;if(dist>6)return;e.stopPropagation();onMove(THREE.MathUtils.clamp(e.point.x,-8.9,8.9),THREE.MathUtils.clamp(e.point.z,-5.9,5.9));};
 return <group>
  <Box at={[0,y-.18,0]} size={[20,.34,14]} color="#d9d7ca"/>
  <FloorBoards y={y}/>
  <mesh position={[0,y+.04,0]} rotation={[-Math.PI/2,0,0]} onPointerDown={e=>{down.current=[e.clientX,e.clientY];}} onPointerUp={move}><planeGeometry args={[20,14]}/><meshBasicMaterial transparent opacity={0} depthWrite={false}/></mesh>
  <Box at={[0,y+.7,-7]} size={[20,1.4,.2]} color="#d4dce3"/>
  <Box at={[-10,y+.7,0]} size={[.2,1.4,14]} color="#d4dce3"/>
  {[-6.8,0,6.8].map(z=><Box key={z} at={[-10,y+2.1,z]} size={[.18,4.2,.18]} color="#4b6070"/>)}
  <Box at={[-10,y+4.15,0]} size={[.22,.18,14]} color="#4b6070"/>
  <Box at={[-9.85,y+1.4,0]} size={[.38,.1,14]} color="#526b7f"/>
  {[-9.8,-5,0,5,9.8].map(x=><Box key={x} at={[x,y+2.1,-7]} size={[.18,4.2,.22]} color="#4b6070"/>)}
  <Box at={[0,y+4.15,-7]} size={[20,.18,.23]} color="#4b6070"/>
  <Box at={[0,y+1.4,-6.85]} size={[20,.1,.38]} color="#526b7f"/>
  {[-7.5,-2.5,2.5,7.5].map(x=><mesh key={x} position={[x,y+2.7,-7.03]}><planeGeometry args={[4.75,2.7]}/><meshStandardMaterial color="#b9d2df" roughness={.2} metalness={.15}/></mesh>)}
  <Plant at={[9,y,-5.9]}/><Plant at={[-9,y,-5.9]}/>
  <Box at={[8.65,y+.02,4.8]} size={[1.45,.04,1.45]} color="#729b91"/>
  <Html position={[8.65,y+.14,4.8]} center style={{pointerEvents:'none'}}><span className="wr-lift-label">{floor}F</span></Html>
  {floor>=3&&<Html position={[0,y+3.3,-6.75]} center distanceFactor={18} style={{pointerEvents:'none'}}><span className="wr-space-sign">S-CARE <b>{FLOORS[floor-1]}</b></span></Html>}
  {floor===3&&<><RoundedBox position={[0,y+.75,0]} args={[6,1.3,2.8]} radius={.3} smoothness={3} castShadow><meshStandardMaterial color="#e0c19a" roughness={.7}/></RoundedBox><Box at={[0,y+1.43,0]} size={[4.7,.05,1.8]} color="#527e7b"/>{[-4,4].map(x=>[-1.3,1.3].map(z=><group key={`${x}-${z}`}><RoundedBox position={[x,y+.55,z]} args={[.8,.25,.8]} radius={.12} smoothness={2}><meshStandardMaterial color="#789d91"/></RoundedBox><Box at={[x,y+.25,z]} size={[.13,.5,.13]} color="#b7a48d"/><Box at={[x,y+1,z+.32]} size={[.8,.8,.15]} color="#789d91"/></group>))}</>}
  {floor===4&&[-6,-3,0,3,6].map(x=><group key={x}><Box at={[x,y+.5,-2]} size={[2.5,1,1.4]} color="#c2b59e"/><Box at={[x,y+1.35,-2.4]} size={[2.2,.9,.15]} color="#356e76" glow/><Box at={[x,y+1.02,-1.7]} size={[1.8,.04,.5]} color="#dce5df"/></group>)}
 </group>;
}
function RackSlots({color}:{color:string}){const ref=useRef<THREE.InstancedMesh>(null);useEffect(()=>{const o=new THREE.Object3D();for(let i=0;i<6;i++){o.position.set(0,-.67+i*.28,.58);o.updateMatrix();ref.current?.setMatrixAt(i,o.matrix);}if(ref.current)ref.current.instanceMatrix.needsUpdate=true;},[]);return <><instancedMesh ref={ref} args={[undefined,undefined,6]}><boxGeometry args={[.95,.19,.05]}/><meshStandardMaterial color="#3e5f67"/></instancedMesh>{[0,1,2].map(i=><Box key={i} at={[-.36,.65-i*.28,.63]} size={[.06,.06,.03]} color={color} glow/>)}</>;}
function Rack({node,selected,onSelect,overview}:{node:Node;selected:boolean;onSelect:(id:string)=>void;overview:boolean}){const color=COLORS[node.status]||COLORS.HEALTHY;return <group position={nodePosition(node.id)} onClick={e=>{if(e.delta>6)return;e.stopPropagation();onSelect(node.id);}}><RoundedBox args={[1.35,2.25,1.1]} radius={.1} smoothness={2} castShadow receiveShadow><meshStandardMaterial color={selected?'#617e98':'#526477'} roughness={.65}/></RoundedBox><Box at={[0,0,.57]} size={[1.08,1.92,.04]} color="#23424c"/><RackSlots color={color}/><Box at={[0,1.15,0]} size={[1.2,.06,.95]} color={color} glow/>{!overview&&(selected||node.status!=='HEALTHY')&&<Html position={[0,1.65,0]} center distanceFactor={15} style={{pointerEvents:'none'}}><span className="wr-rack-label"><i style={{background:color}}/>{node.name}</span></Html>}{node.status!=='HEALTHY'&&<mesh position={[0,-1.2,0]} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[.8,1.05,28]}/><meshBasicMaterial color={color} transparent opacity={.8}/></mesh>}</group>;}
function Avatar({player,self,reduced,message}:{player:Player;self:boolean;reduced:boolean;message?:string}){
 const caption=useRef<HTMLSpanElement>(null);
 const root=useRef<THREE.Group>(null),left=useRef<THREE.Group>(null),right=useRef<THREE.Group>(null),last=useRef(new THREE.Vector3(player.x,(player.floor-1)*5.5,player.z)),motion=useRef(0),arm=useRef<THREE.Group>(null);
 const color=playerColor(player.id);
 useFrame((s,dt)=>{if(!root.current)return;const target=new THREE.Vector3(player.x,(player.floor-1)*5.5+.07,player.z);if(Math.abs(root.current.position.y-target.y)>1)root.current.position.copy(target);else root.current.position.lerp(target,1-Math.exp(-dt*15));const angle=THREE.MathUtils.euclideanModulo(player.direction-root.current.rotation.y+Math.PI,Math.PI*2)-Math.PI;root.current.rotation.y+=angle*(1-Math.exp(-dt*12));if(caption.current){caption.current.dataset.position=`${root.current.position.x.toFixed(2)},${root.current.position.z.toFixed(2)}`;caption.current.dataset.direction=root.current.rotation.y.toFixed(2);}if(last.current.distanceTo(target)>.008)motion.current=.18;else motion.current=Math.max(0,motion.current-dt);last.current.copy(target);const stride=!reduced&&motion.current>0?Math.sin(s.clock.elapsedTime*12)*.38:0;if(left.current)left.current.rotation.x=stride;if(right.current)right.current.rotation.x=-stride;if(arm.current)arm.current.rotation.z=message?.includes('👋')?(!reduced?2.3+Math.sin(s.clock.elapsedTime*8)*.3:2.3):.12;});
 return <group ref={root} position={[player.x,(player.floor-1)*5.5+.07,player.z]}>
  <group ref={left} position={[-.17,.51,0]}><RoundedBox position={[0,-.24,0]} args={[.25,.5,.29]} radius={.1} smoothness={2} castShadow><meshStandardMaterial color="#ece9dc"/></RoundedBox><Box at={[0,-.46,.08]} size={[.27,.12,.4]} color="#647a75"/></group><group ref={right} position={[.17,.51,0]}><RoundedBox position={[0,-.24,0]} args={[.25,.5,.29]} radius={.1} smoothness={2} castShadow><meshStandardMaterial color="#ece9dc"/></RoundedBox><Box at={[0,-.46,.08]} size={[.27,.12,.4]} color="#647a75"/></group>
  <RoundedBox position={[0,.88,0]} args={[.73,.78,.43]} radius={.17} smoothness={3} castShadow><meshStandardMaterial color="#f0ecdf" roughness={.9}/></RoundedBox><RoundedBox position={[0,.87,.21]} args={[.48,.58,.07]} radius={.08} smoothness={2}><meshStandardMaterial color={color}/></RoundedBox>
  {[-1,1].map(n=><group ref={n===1?arm:undefined} key={n} position={[n*.45,.87,0]} rotation={[0,0,n*.12]}><mesh castShadow><capsuleGeometry args={[.12,.39,4,8]}/><meshStandardMaterial color="#f0ecdf"/></mesh><mesh position={[0,-.31,0]}><sphereGeometry args={[.13,10,8]}/><meshStandardMaterial color="#e4bb94"/></mesh></group>)}
  <mesh position={[0,1.54,0]} castShadow><sphereGeometry args={[.39,20,16]}/><meshStandardMaterial color="#e6bf9b" roughness={.9}/></mesh><mesh position={[0,1.69,-.025]} castShadow><sphereGeometry args={[.395,16,12,0,Math.PI*2,0,Math.PI*.48]}/><meshStandardMaterial color="#514c41" roughness={1}/></mesh>
  {[-.12,.12].map(x=><mesh key={x} position={[x,1.54,.37]}><sphereGeometry args={[.029,8,8]}/><meshStandardMaterial color="#393b36"/></mesh>)}<mesh position={[0,1.43,.375]} rotation={[0,0,Math.PI]}><torusGeometry args={[.065,.012,6,14,Math.PI]}/><meshStandardMaterial color="#875b4c"/></mesh>
  <mesh rotation={[-Math.PI/2,0,0]} position={[0,.015,0]}><circleGeometry args={[.46,24]}/><meshBasicMaterial color="#485a52" transparent opacity={.15} depthWrite={false}/></mesh>
  <Html position={[0,2.13,0]} center distanceFactor={10} style={{pointerEvents:'none'}}><div className="wr-avatar-caption">{message&&<span className="wr-speech">{message}</span>}<span ref={caption} data-player-id={player.id} className={`wr-name ${self?'self':''}`}>{self?`나 · ${player.name}`:player.name}</span></div></Html>
 </group>;
}
function Agent({x,y,label,active,done,reduced,onSelect}:{x:number;y:number;label:string;active:boolean;done:boolean;reduced:boolean;onSelect:()=>void}){const ref=useRef<THREE.Group>(null);useFrame(s=>{if(ref.current)ref.current.position.y=y+1.6+(!reduced?Math.sin(s.clock.elapsedTime*2+x)*.08:0);});const color=active?'#65cde5':done?'#7dbd91':'#a8c4c0';return <group ref={ref} position={[x,y+1.6,1]} onClick={e=>{if(e.delta>6)return;e.stopPropagation();onSelect();}}><RoundedBox args={[.85,.7,.55]} radius={.2} smoothness={3} castShadow><meshStandardMaterial color={color}/></RoundedBox><Box at={[0,.02,.29]} size={[.6,.27,.04]} color="#25444b"/>{[-.17,.17].map(dx=><Box key={dx} at={[dx,.03,.32]} size={[.08,.08,.03]} color="#a9eee3" glow/>)}<mesh position={[0,.5,0]}><sphereGeometry args={[.09,10,8]}/><meshStandardMaterial color="#e0b878"/></mesh><Html position={[0,.8,0]} center distanceFactor={14} style={{pointerEvents:'none'}}><span className="wr-agent-label">{label}<small>{active?'생각하는 중…':done?'결과 도착':'대기 중'}</small></span></Html></group>;}
function Connections({state,floor,overview,selected}:{state:RoomState;floor:number;overview:boolean;selected:string}){return <group>{state.run.current.edges.filter(e=>(overview||NODE_FLOOR(e.source)===floor&&NODE_FLOOR(e.target)===floor)&&(e.source===selected||e.target===selected||state.run.current.nodes.some(n=>n.id===e.source&&n.status!=='HEALTHY'))).map(e=>{const a=nodePosition(e.source),b=nodePosition(e.target);return <Line key={`${e.source}-${e.target}`} points={[[a[0],a[1]+1.4,a[2]],[b[0],b[1]+1.4,b[2]]]} color="#d58b66" lineWidth={2} transparent opacity={.65}/>;})}</group>;}
function Camera({player,floor,overview,reduced,focus,presentation,reset}:{player?:Player;floor:number;overview:boolean;reduced:boolean;focus?:string;presentation:boolean;reset:number}){
 const controls=useRef<OrbitControlsImpl>(null),transition=useRef(true);const {camera,size}=useThree();const target=useMemo(()=>new THREE.Vector3(),[]),delta=useMemo(()=>new THREE.Vector3(),[]);
 const framing=useMemo(()=>responseFraming(floor,size.width/Math.max(1,size.height),(camera as THREE.PerspectiveCamera).fov),[floor,size.width,size.height,camera]);
 useEffect(()=>{transition.current=true;},[floor,overview,size.width,size.height,reduced,focus,presentation,reset]);
 useFrame((_,dt)=>{const c=controls.current;if(!c)return;const y=(floor-1)*5.5,portrait=size.width<size.height;const point=focus?nodePosition(focus):null;if(presentation)target.copy(framing.target);else target.set(overview?0:point?point[0]*.35:player?.x||0,overview?8:y+1,overview?0:point?point[2]+1.8:player?.z||3);const blend=reduced?1:1-Math.exp(-dt*5);if(transition.current){const pos=presentation?framing.position:overview?new THREE.Vector3(30,29,34):new THREE.Vector3(target.x+3,target.y+(portrait?8:6),target.z+(portrait?13:10));camera.position.lerp(pos,blend);c.target.lerp(target,blend);if(camera.position.distanceTo(pos)<.05)transition.current=false;}else{delta.copy(target).sub(c.target).multiplyScalar(blend);c.target.add(delta);camera.position.add(delta);}c.update();
  if(!overview&&!presentation){const ray=new THREE.Ray(c.target.clone(),camera.position.clone().sub(c.target).normalize());let distance=c.target.distanceTo(camera.position);const hit=new THREE.Vector3();for(const nodeId of (floor===1?['db-primary','db-replica','redis','mq','app-1','app-2','app-3']:floor===2?['gateway','lb','external-api','web-1','web-2','partner']:[])){const p=nodePosition(nodeId);const box=new THREE.Box3(new THREE.Vector3(p[0]-.9,y,p[2]-.8),new THREE.Vector3(p[0]+.9,y+2.7,p[2]+.8));if(ray.intersectBox(box,hit))distance=Math.min(distance,Math.max(.6,c.target.distanceTo(hit)-.25));}camera.position.copy(ray.at(distance,hit));camera.position.x=Math.max(-9.5,Math.min(12,camera.position.x));camera.position.z=Math.max(-6.4,Math.min(16,camera.position.z));camera.position.y=Math.max(y+1,camera.position.y);}
 });
 return <OrbitControls ref={controls} makeDefault onStart={()=>{transition.current=false;}} enablePan={false} minDistance={presentation?framing.distance*.65:overview?22:4} maxDistance={presentation?framing.distance*1.8:overview?65:17} minPolarAngle={.25} maxPolarAngle={presentation?Math.PI/3:Math.PI/2.15} minAzimuthAngle={presentation?-Math.PI/4:-Infinity} maxAzimuthAngle={presentation?Math.PI/4:Infinity} enableDamping/>;
}
// Three r180 requests an alpha context even with renderer alpha:false. Create the
// opaque context explicitly: this full-screen scene never needs canvas compositing.
function opaqueRenderer(canvas:HTMLCanvasElement,low:boolean){
 const powerPreference=low?'low-power':'high-performance';
 const context=canvas.getContext('webgl2',{alpha:false,antialias:true,powerPreference});
 if(!context)throw new Error('WebGL 2 context unavailable');
 const renderer=new THREE.WebGLRenderer({canvas,context,alpha:false,antialias:true,powerPreference});
 renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
 return renderer;
}
function RenderCadence({low,reduced,paused}:{low:boolean;reduced:boolean;paused:boolean}){
 const invalidate=useThree(s=>s.invalidate);
 useEffect(()=>{if(reduced||paused)return;const timer=setInterval(()=>{if(!document.hidden)invalidate();},1000/(low?24:30));return()=>clearInterval(timer);},[invalidate,low,reduced,paused]);
 return null;
}
export default function Scene({state,id,floor,overview,selected,onSelect,onMove,onAgent,low,reduced,flow,paused,focus,speed,presentation,cameraReset}:{state:RoomState;id:string;floor:number;overview:boolean;selected:string;onSelect:(id:string)=>void;onMove:(x:number,z:number)=>void;onAgent:()=>void;low:boolean;reduced:boolean;flow:Workflow;paused:boolean;focus?:string;speed:number;presentation:boolean;cameraReset:number}){
 const floors=overview?[1,2,3,4]:[floor],me=state.players.find(p=>p.id===id);
 return <Canvas frameloop="demand" shadows={!low} dpr={low?1:[1,2]} camera={{position:[-5,5,12],fov:48,near:.1,far:180}} gl={defaults=>opaqueRenderer(defaults.canvas as HTMLCanvasElement,low)} onCreated={({gl})=>{gl.setClearColor('#b8c7d4');}}>
  <RenderCadence low={low} reduced={reduced} paused={paused}/>
  <ambientLight intensity={.55}/><hemisphereLight args={['#ffffff','#667889',.8]}/><directionalLight position={[6,28,14]} intensity={1.6} castShadow={!low} shadow-mapSize={[2048,2048]} shadow-camera-left={-20} shadow-camera-right={20} shadow-camera-top={35} shadow-camera-bottom={-20} shadow-normalBias={.04}/>
  <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.5,0]} receiveShadow><planeGeometry args={[200,200]}/><meshStandardMaterial color="#9aaebb" roughness={1}/></mesh>
  {[-26,-16,-5,8,20,30].map((x,i)=><group key={x} position={[x,0,-15-i%2*4]}><Box at={[0,2,0]} size={[.5,4,.5]} color="#8b8871"/><mesh position={[0,5,0]} scale={[3,4,3]}><icosahedronGeometry args={[1,2]}/><meshStandardMaterial color={i%2?'#7b9d7d':'#94ac89'} roughness={1}/></mesh></group>)}
  {floors.map(f=><Floor key={f} floor={f} overview={overview} onMove={onMove}/>)}
  {state.run.current.nodes.filter(n=>overview||NODE_FLOOR(n.id)===floor).map(n=><Rack key={n.id} node={n} selected={selected===n.id} onSelect={onSelect} overview={overview}/>)}
  <Operations snapshot={state.run.current} flow={flow} floor={floor} overview={overview} reduced={reduced} paused={paused} speed={speed}/>
  {state.players.filter(p=>overview||p.floor===floor).map(p=><Avatar key={p.id} player={p} self={p.id===id} reduced={reduced} message={state.players.filter(other=>other.name===p.name).length===1?state.chat.filter(m=>m.name===p.name&&Date.now()-m.at<6500).at(-1)?.text:undefined}/>)}
  {floors.includes(4)&&[['원인 · 영향 분석','analyze',!!state.run.analysis],['복구 전략','strategies',!!state.run.strategies],['복구 검증','simulate',!!state.run.results]].map(([label,op,done],i)=><Agent key={String(op)} x={-4+i*4} y={16.5} label={String(label)} active={state.busy&&state.operation===op} done={!!done} reduced={reduced} onSelect={onAgent}/>)}
  {floors.includes(3)&&<Html position={[0,12.7,-6.65]} center distanceFactor={18} style={{pointerEvents:'none'}}><div className="wr-wall-board"><small>함께 해결하는 공간</small><strong>{state.run.status==='NORMAL'?'오늘도 평온해요':state.run.status==='APPROVED'?'복구 결과를 확인해요':'함께 확인해 볼까요?'}</strong><span>{state.players.length}명 함께 · 합성 시뮬레이션</span></div></Html>}
  <Camera player={me} floor={floor} overview={overview} reduced={reduced} focus={focus} presentation={presentation&&!overview} reset={cameraReset}/>
 </Canvas>;
}
