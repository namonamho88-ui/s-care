'use client';
import {useEffect,useMemo,useRef} from 'react';
import {Canvas,useFrame,useThree} from '@react-three/fiber';
import {Html,Line,OrbitControls,RoundedBox} from '@react-three/drei';
import * as THREE from 'three';
import type {OrbitControls as OrbitControlsImpl} from 'three-stdlib';
import {COLORS,FLOORS,NODE_FLOOR,nodePosition,type Node,type Player,type RoomState} from './types';

function Box({at,size,color='#182c3b',glow=false}:{at:[number,number,number];size:[number,number,number];color?:string;glow?:boolean}){
 return <mesh position={at} castShadow receiveShadow><boxGeometry args={size}/><meshStandardMaterial color={color} roughness={.55} metalness={.4} emissive={glow?color:'#000'} emissiveIntensity={glow?.7:0}/></mesh>;
}
function RackSlots({color}:{color:string}){
 const slots=useRef<THREE.InstancedMesh>(null),lights=useRef<THREE.InstancedMesh>(null),vents=useRef<THREE.InstancedMesh>(null);
 useEffect(()=>{const o=new THREE.Object3D();for(let i=0;i<7;i++){for(const [ref,x,z] of [[slots,0,.61],[lights,-.4,.65],[vents,.23,.65]] as const){o.position.set(x,-.82+i*.26,z);o.updateMatrix();ref.current?.setMatrixAt(i,o.matrix);}}for(const ref of [slots,lights,vents])if(ref.current)ref.current.instanceMatrix.needsUpdate=true;},[]);
 return <><instancedMesh ref={slots} args={[undefined,undefined,7]}><boxGeometry args={[1.04,.2,.06]}/><meshStandardMaterial color="#385266"/></instancedMesh><instancedMesh ref={lights} args={[undefined,undefined,7]}><boxGeometry args={[.05,.06,.02]}/><meshBasicMaterial color={color}/></instancedMesh><instancedMesh ref={vents} args={[undefined,undefined,7]}><boxGeometry args={[.4,.035,.02]}/><meshStandardMaterial color="#0b1521"/></instancedMesh></>;
}
function Rack({node,selected,onSelect}:{node:Node;selected:boolean;onSelect:(id:string)=>void}){
 const pos=nodePosition(node.id),color=COLORS[node.status]||COLORS.HEALTHY;
 return <group position={pos} onClick={e=>{e.stopPropagation();onSelect(node.id);}}>
  <RoundedBox args={[1.35,2.25,1.1]} radius={.06} smoothness={2} castShadow receiveShadow><meshStandardMaterial color={selected?'#4b758a':'#294558'} roughness={.5} metalness={.45}/></RoundedBox>
  <Box at={[0,0,.57]} size={[1.13,2.03,.04]} color="#060f1b"/>
  <RackSlots color={color}/>
  <Box at={[0,1.15,0]} size={[1.3,.05,1.05]} color={color} glow/>
  <Html position={[0,1.6,0]} center distanceFactor={28} style={{pointerEvents:'none'}}><span className={`wr-rack-label ${selected?'selected':''}`}><i style={{background:color}}/>{node.name}</span></Html>
  {node.status!=='HEALTHY'&&<mesh position={[0,-1.18,0]} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[.8,1,32]}/><meshBasicMaterial color={color} transparent opacity={.7} side={THREE.DoubleSide}/></mesh>}
 </group>;
}
function Tiles({floor}:{floor:number}){
 const mesh=useRef<THREE.InstancedMesh>(null);
 useEffect(()=>{if(!mesh.current)return;const o=new THREE.Object3D();let i=0;for(let x=-9;x<=9;x+=2)for(let z=-6;z<=6;z+=2){o.position.set(x,0,z);o.updateMatrix();mesh.current.setMatrixAt(i++,o.matrix);}mesh.current.instanceMatrix.needsUpdate=true;},[]);
 return <instancedMesh ref={mesh} args={[undefined,undefined,70]} position={[0,(floor-1)*5.5+.02,0]} receiveShadow><boxGeometry args={[1.94,.035,1.94]}/><meshStandardMaterial color={floor%2?'#203448':'#233c4d'} roughness={.8}/></instancedMesh>;
}
function Floor({floor,active}:{floor:number;active:boolean}){
 const y=(floor-1)*5.5;
 return <group>
  <Box at={[0,y-.22,0]} size={[20,.4,14]} color="#102537"/>
  <Tiles floor={floor}/>
  <Box at={[0,y-.3,7.04]} size={[20,.08,.06]} color={active?'#7bffe1':'#375b70'} glow={active}/>
  <Box at={[-10,y+1.5,0]} size={[.18,3.1,14]} color="#20374b"/>
  <Box at={[0,y+1.5,-7]} size={[20,3.1,.18]} color="#20374b"/>
  {[-8,-4,0,4,8].map(x=><group key={x}><Box at={[x,y+1.6,-6.87]} size={[2.8,1.2,.04]} color="#0a1629"/><Box at={[x,y+2.25,-6.82]} size={[2.8,.03,.04]} color="#53cbd3" glow/></group>)}
  {[-9.6,9.6].map(x=><Box key={x} at={[x,y+1.6,-6.6]} size={[.3,3.2,.3]} color="#567183"/>)}
  <Html position={[-9.6,y+.2,7.3]} style={{pointerEvents:'none'}}><span className={`wr-floor-label ${active?'active':''}`}>0{floor} / {FLOORS[floor-1]}</span></Html>
  <Box at={[8.7,y+.04,4.8]} size={[1.5,.06,1.5]} color="#3a8093"/>
  <Html position={[8.7,y+.15,4.8]} center style={{pointerEvents:'none'}}><span className="wr-lift-label">LIFT</span></Html>
  {floor===3&&<>
   <RoundedBox position={[0,y+.7,0]} args={[6,1.3,2.8]} radius={.25} smoothness={3}><meshStandardMaterial color="#30495c" metalness={.5} roughness={.4}/></RoundedBox>
   <Box at={[0,y+1.39,0]} size={[4.6,.04,1.8]} color="#37a6bc" glow/>
   {[-4,4].map(x=>[-1.3,1.3].map(z=><group key={`${x}-${z}`}><Box at={[x,y+.55,z]} size={[.7,.2,.7]} color="#4f687a"/><Box at={[x,y+.25,z]} size={[.12,.5,.12]}/><Box at={[x,y+1,z+.3]} size={[.7,.7,.14]} color="#4f687a"/></group>))}
   <Box at={[0,y+2.05,-6.6]} size={[8,2.1,.14]} color="#061d30"/>
  </>}
  {floor===4&&[-6,-3,0,3,6].map(x=><group key={x}><Box at={[x,y+.5,-2]} size={[2.5,1,1.4]} color="#354e61"/><Box at={[x,y+1.35,-2.4]} size={[2.2,.9,.15]} color="#1a647b" glow/><Box at={[x,y+1.02,-1.7]} size={[1.8,.04,.5]} color="#162b40"/></group>)}
 </group>;
}
function Avatar({player,self,reduced}:{player:Player;self:boolean;reduced:boolean}){
 const root=useRef<THREE.Group>(null),legs=useRef<THREE.Group>(null),last=useRef(new THREE.Vector3(player.x,0,player.z));
 const color=self?'#71f3d3':['#ffbb78','#90b9ff','#dba7ff','#ffd974'][player.id.charCodeAt(0)%4];
 useFrame((s,dt)=>{if(!root.current)return;const target=new THREE.Vector3(player.x,(player.floor-1)*5.5+.12,player.z);if(Math.abs(root.current.position.y-target.y)>1)root.current.position.copy(target);else root.current.position.lerp(target,1-Math.exp(-dt*16));root.current.rotation.y=THREE.MathUtils.damp(root.current.rotation.y,player.direction,12,dt);const moving=last.current.distanceTo(target)>.003;last.current.copy(target);if(legs.current)legs.current.rotation.z=!reduced&&moving?Math.sin(s.clock.elapsedTime*14)*.16:0;});
 return <group ref={root} position={[player.x,(player.floor-1)*5.5+.12,player.z]}>
  <group ref={legs}><Box at={[-.16,.25,0]} size={[.22,.5,.25]} color="#152534"/><Box at={[.16,.25,0]} size={[.22,.5,.25]} color="#152534"/></group>
  <RoundedBox position={[0,.8,0]} args={[.65,.65,.35]} radius={.12} smoothness={2} castShadow><meshStandardMaterial color={color}/></RoundedBox>
  <mesh position={[0,1.36,0]} castShadow><sphereGeometry args={[.25,12,10]}/><meshStandardMaterial color="#e7d5bf"/></mesh>
  <Box at={[0,1.42,.21]} size={[.34,.1,.08]} color="#123446"/>
  <mesh rotation={[-Math.PI/2,0,0]} position={[0,.02,0]}><ringGeometry args={[.35,.4,24]}/><meshBasicMaterial color={color}/></mesh>
  <Html position={[0,1.95,0]} center style={{pointerEvents:'none'}}><span className={`wr-name ${self?'self':''}`}>{player.name}{self?' · 나':''}<small>{player.role}</small></span></Html>
 </group>;
}
function Agent({x,label,active,done,reduced}:{x:number;label:string;active:boolean;done:boolean;reduced:boolean}){
 const group=useRef<THREE.Group>(null);useFrame(s=>{if(group.current)group.current.position.y=18.1+(!reduced&&active?Math.sin(s.clock.elapsedTime*3)*.12:0);});
 const color=active?'#65e0ff':done?'#64efb2':'#748eb2';
 return <group ref={group} position={[x,18.1,1.2]}>
  <mesh><octahedronGeometry args={[.48,0]}/><meshStandardMaterial color={color} emissive={color} emissiveIntensity={active?1.3:.25} metalness={.7} roughness={.25}/></mesh>
  <mesh rotation={[Math.PI/2,0,0]} position={[0,-.7,0]}><torusGeometry args={[.65,.035,8,32]}/><meshBasicMaterial color={color}/></mesh>
  <Html position={[0,.8,0]} center style={{pointerEvents:'none'}}><span className="wr-agent-label">{label}<small>{active?'실행 중':done?'결과 수신':'대기'}</small></span></Html>
 </group>;
}
function Connections({state,visibleFloor,reduced}:{state:RoomState;visibleFloor:number;reduced:boolean}){
 const snapshot=state.run.current;const affected=useMemo(()=>new Set(snapshot.nodes.filter(n=>n.status!=='HEALTHY').map(n=>n.id)),[snapshot]);
 return <group>{snapshot.edges.filter(e=>NODE_FLOOR(e.source)<=visibleFloor&&NODE_FLOOR(e.target)<=visibleFloor).map((e,i)=>{
  const a=nodePosition(e.source),b=nodePosition(e.target),bad=affected.has(e.source)&&affected.has(e.target);const points:[number,number,number][]=[[a[0],a[1]+1.3,a[2]],[a[0],a[1]+1.7,a[2]+1.2],[b[0],b[1]+1.7,b[2]+1.2],[b[0],b[1]+1.3,b[2]]];
  return <group key={`${e.source}-${e.target}`}><Line points={points} color={bad?'#ff7b71':e.relation==='REPLICATES_TO'?'#a49cec':'#40748a'} lineWidth={bad?2:1} transparent opacity={bad?.85:.25}/>{bad&&!reduced&&<Pulse points={points} offset={i*.11}/>}</group>;
 })}</group>;
}
function Pulse({points,offset}:{points:[number,number,number][];offset:number}){const mesh=useRef<THREE.Mesh>(null);const curve=useMemo(()=>new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),[points]);useFrame(s=>{mesh.current?.position.copy(curve.getPoint(1-(s.clock.elapsedTime*.3+offset)%1));});return <mesh ref={mesh}><sphereGeometry args={[.07,6,6]}/><meshBasicMaterial color="#ffb393"/></mesh>;}
function Camera({floor,overview,reduced}:{floor:number;overview:boolean;reduced:boolean}){
 const controls=useRef<OrbitControlsImpl>(null),transition=useRef(true);const {camera,size}=useThree();
 useEffect(()=>{transition.current=true;},[floor,overview,size.width,size.height,reduced]);
 useFrame((_,dt)=>{if(!controls.current||!transition.current)return;const y=(floor-1)*5.5,scale=Math.max(1,Math.min(1.7,.95/(size.width/size.height)));const target=new THREE.Vector3(0,overview?8:y+.9,0);const position=new THREE.Vector3((overview?30:23)*scale,(overview?8:y)+ (overview?22:19)*scale,(overview?34:25)*scale);const blend=reduced?1:1-Math.exp(-dt*4);camera.position.lerp(position,blend);controls.current.target.lerp(target,blend);controls.current.update();if(camera.position.distanceTo(position)<.06)transition.current=false;});
 return <OrbitControls ref={controls} makeDefault onStart={()=>{transition.current=false;}} minDistance={14} maxDistance={65} maxPolarAngle={Math.PI/2.05} enableDamping/>;
}
export default function Scene({state,id,floor,overview,selected,onSelect,low,reduced}:{state:RoomState;id:string;floor:number;overview:boolean;selected:string;onSelect:(id:string)=>void;low:boolean;reduced:boolean}){
 const visible=overview?4:floor;
 return <Canvas shadows={!low} dpr={low?1:[1,1.5]} camera={{position:[30,30,34],fov:43,near:.1,far:150}} gl={{antialias:!low,powerPreference:low?'low-power':'high-performance'}} onCreated={({gl})=>{gl.setClearColor('#081521');}}>
  <fog attach="fog" args={['#081521',65,135]}/><ambientLight intensity={1.4}/><hemisphereLight args={['#c3ebff','#182e46',1.5]}/><directionalLight position={[15,30,20]} intensity={2.6} castShadow={!low} shadow-mapSize={[1024,1024]} shadow-camera-left={-22} shadow-camera-right={22} shadow-camera-top={32} shadow-camera-bottom={-22}/>
  <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.55,0]} receiveShadow><planeGeometry args={[200,200]}/><meshStandardMaterial color="#0c1d2c" roughness={1}/></mesh>
  <gridHelper args={[140,70,'#213b4f','#162c3e']} position={[0,-.5,0]}/>
  {Array.from({length:visible},(_,i)=><Floor key={i} floor={i+1} active={i+1===floor}/>)}
  {state.run.current.nodes.filter(n=>NODE_FLOOR(n.id)<=visible).map(n=><Rack key={n.id} node={n} selected={selected===n.id} onSelect={onSelect}/>)}
  <Connections state={state} visibleFloor={visible} reduced={reduced}/>
  {state.players.filter(p=>p.floor<=visible).map(p=><Avatar key={p.id} player={p} self={id===p.id} reduced={reduced}/>)}
  {visible===4&&<>{[['원인 · 영향 분석','analyze',!!state.run.analysis],['복구 전략 · 정책','strategies',!!state.run.strategies],['시뮬레이션 검증','simulate',!!state.run.results]].map(([label,op,done],i)=><Agent key={String(op)} x={-4+i*4} label={String(label)} active={state.busy&&state.operation===op} done={!!done} reduced={reduced}/>)}</>}
  {visible>=3&&<Html position={[0,13.1,-6.45]} transform distanceFactor={8} style={{pointerEvents:'none'}}><div className="wr-wall-board"><small>INCIDENT COMMAND</small><strong>{state.run.status}</strong><span>{state.players.length} OPERATORS · SYNTHETIC</span></div></Html>}
  <Camera floor={floor} overview={overview} reduced={reduced}/>
 </Canvas>;
}
