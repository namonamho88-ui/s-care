'use client';
import {useState} from 'react';
import dynamic from 'next/dynamic';
import Workroom from './workroom';
const Campus=dynamic(()=>import('./campus'),{ssr:false});
export default function WarRoomHub({initialMode='work'}:{initialMode?:'work'|'simulation'}){
 const [mode,setMode]=useState(initialMode),[opened,setOpened]=useState(initialMode==='simulation');
 function change(next:'work'|'simulation'){setMode(next);if(next==='simulation')setOpened(true);const url=new URL(location.href);if(next==='simulation')url.searchParams.set('view','simulation');else url.searchParams.delete('view');history.replaceState(null,'',url);}
 return <div className="war-room-hub"><nav className="war-room-modes" aria-label="워룸 기능"><button aria-pressed={mode==='work'} onClick={()=>change('work')}>업무 워룸</button><button aria-pressed={mode==='simulation'} onClick={()=>change('simulation')}>장애 시뮬레이션</button><span>업무 기록과 개인 실험은 별도 데이터</span></nav><div className="war-room-module" hidden={mode!=='work'}><Workroom active={mode==='work'}/></div>{opened&&<div className="war-room-module" hidden={mode!=='simulation'}><Campus active={mode==='simulation'}/></div>}</div>;
}
