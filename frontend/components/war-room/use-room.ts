'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import type {RoomState,Player} from './types';
import type {Training} from './city-types';
export function useRoom(){
 const [state,setState]=useState<RoomState|null>(null),[status,setStatus]=useState('입장 대기'),[error,setError]=useState(''),[id,setId]=useState('');
 const [training,setTraining]=useState<Training|null>(null),[clockOffset,setClockOffset]=useState(0);
 const socket=useRef<WebSocket|null>(null),generation=useRef(0),timers=useRef(new Set<ReturnType<typeof setTimeout>>()),players=useRef<Player[]>([]);
 const releaseIdentity=useRef<(()=>void)|null>(null);
 const clear=useCallback(()=>{generation.current++;socket.current?.close();socket.current=null;timers.current.forEach(clearTimeout);timers.current.clear();players.current=[];releaseIdentity.current?.();releaseIdentity.current=null;},[]);
 const send=useCallback((data:unknown)=>{if(socket.current?.readyState===WebSocket.OPEN)socket.current.send(JSON.stringify(data));},[]);
 const join=useCallback(async(room:string)=>{
  clear();setState(null);setTraining(null);setError('');setStatus('입장 중');const turn=generation.current;
  // Separate identities per tab; resumable credentials remain HttpOnly.
  let clientId=sessionStorage.getItem('war-tab');if(!clientId){clientId=crypto.randomUUID();sessionStorage.setItem('war-tab',clientId);}
  // Duplicated/opened tabs can inherit sessionStorage, including a live tab's ID.
  // A browser-scoped lock makes ownership exclusive while retaining reload/resume.
  if(navigator.locks){
   let owned=false;
   for(let attempt=0;attempt<3&&!owned;attempt++){
    owned=await new Promise<boolean>(resolve=>{void navigator.locks.request(`s-care-war-tab-${clientId}`,{ifAvailable:true},lock=>{if(!lock||turn!==generation.current){resolve(false);return;}return new Promise<void>(release=>{releaseIdentity.current=release;resolve(true);});}).catch(()=>resolve(false));});
    if(!owned){clientId=crypto.randomUUID();sessionStorage.setItem('war-tab',clientId);}
   }
   if(turn!==generation.current)return;
   if(!owned){setError('창 식별자를 확보하지 못했습니다. 새 탭에서 다시 입장하세요.');setStatus('입장 실패');return;}
  }
  let failures=0;
  const later=(fn:()=>void,delay:number)=>{const timer=setTimeout(()=>{timers.current.delete(timer);fn();},delay);timers.current.add(timer);return timer;};
  const retry=()=>{if(turn!==generation.current)return;setStatus(`재접속 중 · ${++failures}`);later(()=>void connect(),Math.min(15000,750*2**Math.min(failures,5)));};
  const connect=async()=>{
   try{
    const res=await fetch('/api/war-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room,clientId}),signal:AbortSignal.timeout(18000)});
    const data=await res.json();if(turn!==generation.current)return;
    if(!res.ok){setError(data.error||'입장 실패');if(res.status>=500){retry();return;}setStatus('입장 실패');return;}
    setId(data.id);const ws=new WebSocket(data.ws);socket.current=ws;let revision=-1,trainingRevision=-1;
    const deadline=later(()=>ws.close(),8000);
    ws.onopen=()=>ws.send(JSON.stringify({type:'join',ticket:data.ticket}));
    ws.onmessage=e=>{if(turn!==generation.current||socket.current!==ws)return;try{
     const value=JSON.parse(e.data);
     if(value.type==='welcome'){clearTimeout(deadline);timers.current.delete(deadline);failures=0;setStatus('연결됨');setError('');}
     if(value.type==='state'&&value.room===room&&value.revision>=revision){revision=value.revision;players.current=value.players;setState(value);if(typeof value.serverNow==='number')setClockOffset(value.serverNow-Date.now());}
     // Movement never changes incident state or its revision.
     if(value.type==='presence'){players.current=value.players;setState(s=>s?{...s,players:value.players}:s);}
     if(value.type==='collaboration')setState(s=>s?{...s,chat:value.chat,checks:value.checks}:s);
     if(value.type==='training'&&value.room===room&&value.training.revision>=trainingRevision){trainingRevision=value.training.revision;setTraining(value.training);setClockOffset(value.serverNow-Date.now());}
     if(value.type==='error')setError(value.message);
    }catch{setError('실시간 응답을 읽을 수 없습니다.');send({type:'sync'});}};
    ws.onclose=()=>{clearTimeout(deadline);timers.current.delete(deadline);if(turn===generation.current&&socket.current===ws)retry();};
    ws.onerror=()=>{if(turn===generation.current)setError('실시간 연결을 다시 확인하고 있습니다.');};
   }catch(e){if(turn===generation.current){setError((e as Error).message);retry();}}
  };await connect();
 },[clear,send]);
 useEffect(()=>{const beat=setInterval(()=>{send({type:'ping'});send({type:'sync'});},15000);const resume=()=>{if(!document.hidden)send({type:'sync'});};document.addEventListener('visibilitychange',resume);return()=>{clearInterval(beat);document.removeEventListener('visibilitychange',resume);clear();};},[send,clear]);
 return {state,training,clockOffset,status,error,clearError:()=>setError(''),id,join,send,players,leave:()=>{clear();setState(null);setTraining(null);setStatus('입장 대기');}};
}
