'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import type {RoomState,Player} from './types';
export function useRoom(){
 const [state,setState]=useState<RoomState|null>(null),[status,setStatus]=useState('입장 대기'),[error,setError]=useState(''),[id,setId]=useState('');
 const socket=useRef<WebSocket|null>(null),generation=useRef(0),timers=useRef<ReturnType<typeof setTimeout>[]>([]),players=useRef<Player[]>([]);
 const clear=useCallback(()=>{generation.current++;socket.current?.close();socket.current=null;timers.current.forEach(clearTimeout);timers.current=[];},[]);
 const send=useCallback((data:unknown)=>{if(socket.current?.readyState===WebSocket.OPEN)socket.current.send(JSON.stringify(data));},[]);
 const join=useCallback(async(room:string)=>{
  clear();setState(null);setError('');setStatus('입장 중');const turn=generation.current;
  const connect=async(attempt:number)=>{
   try{
    const res=await fetch('/api/war-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room}),signal:AbortSignal.timeout(18000)});const data=await res.json();if(turn!==generation.current)return;if(!res.ok)throw Error(data.error||'입장 실패');
    setId(data.id);const ws=new WebSocket(data.ws);socket.current=ws;
    const deadline=setTimeout(()=>ws.close(),8000);timers.current.push(deadline);
    ws.onopen=()=>ws.send(JSON.stringify({type:'join',ticket:data.ticket}));
    ws.onmessage=e=>{if(turn!==generation.current)return;try{const value=JSON.parse(e.data);if(value.type==='welcome'){clearTimeout(deadline);setStatus('연결됨');setError('');}if(value.type==='state'){players.current=value.players;setState(value);}if(value.type==='presence'){players.current=value.players;setState(s=>s?{...s,players:value.players}:s);}if(value.type==='collaboration')setState(s=>s?{...s,chat:value.chat,checks:value.checks}:s);if(value.type==='error')setError(value.message);}catch{setError('실시간 응답을 읽을 수 없습니다.');}};
    ws.onclose=()=>{clearTimeout(deadline);if(turn!==generation.current)return;setStatus('연결 끊김');if(attempt<4){setStatus(`재접속 ${attempt+1}/4`);timers.current.push(setTimeout(()=>void connect(attempt+1),Math.min(8000,1000*2**attempt)));}else setError('연결이 끊겼습니다. 다시 입장해 주세요.');};
    ws.onerror=()=>setError('실시간 연결을 확인하지 못했습니다.');
   }catch(e){if(turn===generation.current){setStatus('입장 실패');setError((e as Error).message);}}
  };await connect(0);
 },[clear]);
 useEffect(()=>{const beat=setInterval(()=>send({type:'ping'}),15000);return()=>{clearInterval(beat);clear();};},[send,clear]);
 return {state,status,error,id,join,send,players,leave:()=>{clear();setState(null);setStatus('입장 대기');}};
}
