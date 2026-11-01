'use client';
import {useEffect,useRef,useState} from 'react';
import {useRoom} from './use-room';
import {campusRoomId} from './campus-worlds';
import type {Player} from './types';
const solo:Player={id:'solo-explorer',name:'탐험가',role:'혼자 탐험',floor:1,x:0,z:3,direction:Math.PI,contributions:0,appearance:0};
export function useCampus(blocked:boolean){
 const room=useRoom();const [local,setLocal]=useState<Player>(solo),[roomName,setRoomName]=useState('우리팀'),[notice,setNotice]=useState(''),[pending,setPending]=useState<number|null>(null);
 const destination=useRef<{x:number;z:number}|null>(null),latest=useRef({room,local,blocked});latest.current={room,local,blocked};
 const joined=!!room.state,connected=room.status==='연결됨',me=room.state?.players.find(p=>p.id===room.id),world=joined?(me?.floor??1)-1:local.floor-1;
 useEffect(()=>{const q=new URLSearchParams(location.search).get('campus');if(q&&q.length<=24)setRoomName(q);},[]);
 useEffect(()=>{destination.current=null;},[blocked,world,connected]);
 useEffect(()=>{if(pending===null)return;if(me?.floor===pending+1){setPending(null);return;}const timer=setTimeout(()=>{setPending(null);setNotice('포털 이동을 확인하지 못했습니다. 연결 상태를 확인하고 다시 선택하세요.');},5000);return()=>clearTimeout(timer);},[pending,me?.floor]);
 useEffect(()=>{const timer=setInterval(()=>{const {room:r,local:l,blocked:b}=latest.current,d=destination.current;if(!d||b||document.hidden)return;const p=r.state?r.state.players.find(p=>p.id===r.id):l;if(!p)return;const dx=d.x-p.x,dz=d.z-p.z,length=Math.hypot(dx,dz);if(length<.25){destination.current=null;return;}const x=dx/length,z=dz/length;if(r.state){if(r.status==='연결됨')r.send({type:'move',x,z});}else setLocal(v=>({...v,x:v.x+x*Math.min(.3,length),z:v.z+z*Math.min(.3,length),direction:Math.atan2(x,z)}));},100);return()=>clearInterval(timer);},[]);
 async function join(){destination.current=null;setNotice('');try{await room.join(await campusRoomId(roomName));}catch(e){setNotice((e as Error).message);}}
 function visit(next:number){if(next<0||next>4||!Number.isInteger(next)||pending!==null)return;destination.current=null;setNotice('');if(joined){if(!connected){setNotice('재접속 후 포털을 이용할 수 있습니다. 혼자 탐험으로 전환할 수도 있습니다.');return;}setPending(next);room.send({type:'campus-portal',world:next});}else setLocal(p=>({...p,floor:next+1,x:0,z:3,direction:Math.PI}));}
 function move(x:number,z:number){if(blocked||pending!==null)return;destination.current={x:Math.max(-8,Math.min(8,x)),z:Math.max(-1.4,Math.min(5.5,z))};}
 function leave(){room.leave();setPending(null);destination.current=null;setLocal({...solo,floor:world+1});setNotice('혼자 탐험으로 전환했습니다. 가상 장애 실험은 계속 유지됩니다.');}
 return {room,roomName,setRoomName,notice,setNotice,pending,world,connected,joined,players:joined?room.state!.players:[local],id:joined?room.id:solo.id,join,visit,move,leave};
}
