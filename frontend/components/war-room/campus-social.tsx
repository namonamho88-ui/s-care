'use client';
import {useState} from 'react';
import type {useCampus} from './use-campus';
import {worlds} from './campus-worlds';
export default function CampusSocial({presence:p}:{presence:ReturnType<typeof useCampus>}){
 const [text,setText]=useState(''),[until,setUntil]=useState(0);
 async function share(){try{const url=new URL('/war-room',location.origin);url.searchParams.set('campus',p.roomName);await navigator.clipboard.writeText(url.toString());p.setNotice('초대 링크를 복사했습니다. 동료가 같은 방에 연결하면 만날 수 있습니다.');}catch{p.setNotice('링크를 복사하지 못했습니다. 동료에게 같은 방 이름을 알려주세요.');}}
 function say(){if(!p.connected||!text.trim()||Date.now()<until)return;p.room.send({type:'chat',text:text.trim()});setText('');setUntil(Date.now()+1100);}
 return <details className="mv-social"><summary>동료와 만나기 · {p.joined?`${p.players.length}명 · ${p.room.status}`:'혼자 탐험 중'}</summary>
  <p>위치·포털 이동·대화는 같은 방에 공유됩니다. 장애 실험은 내 브라우저에서만 실행됩니다.</p>
  {!p.joined?<form onSubmit={e=>{e.preventDefault();void p.join();}}><label>함께 만날 방<input value={p.roomName} maxLength={24} onChange={e=>p.setRoomName(e.target.value)} required/></label><button disabled={p.room.status==='입장 중'||p.room.status.startsWith('재접속')}>동료와 연결</button>{(p.room.status==='입장 중'||p.room.status.startsWith('재접속'))&&<button type="button" onClick={p.leave}>연결 취소</button>}</form>:<><div className="mv-social-actions"><button onClick={share}>방 초대 링크 복사</button><button onClick={p.leave}>혼자 탐험</button></div><ul>{p.players.map(person=><li key={person.id}>{person.id===p.id?'나 · ':''}{person.name} <span>{worlds[person.floor-1]?.name||'위치 확인 중'}</span></li>)}</ul><div className="mv-chat-log" role="log" aria-label="동료 대화">{p.room.state?.chat.slice(-12).map(m=><p key={m.id}><b>{m.name}</b> {m.text}</p>)}</div><form onSubmit={e=>{e.preventDefault();say();}}><label>동료에게 메시지<input maxLength={240} value={text} onChange={e=>setText(e.target.value)} disabled={!p.connected}/></label><button disabled={!p.connected||!text.trim()}>보내기</button></form></>}
  {(p.notice||p.room.error)&&<p role="status">{p.notice||p.room.error}</p>}
 </details>;
}
