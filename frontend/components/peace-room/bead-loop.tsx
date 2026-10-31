'use client';
import {useId,useRef,useState} from 'react';

/** Drag position is local; the shared ritual counter advances only after server acknowledgement. */
export default function BeadLoop({step,disabled,onAdvance,onTouch,label}:{step:number;disabled:boolean;onAdvance:()=>void;onTouch:()=>void;label:string}){
 const id=useId().replace(/:/g,''),drag=useRef<{id:number;y:number}|null>(null),[offset,setOffset]=useState(0);
 const release=()=>{drag.current=null;setOffset(0);};
 return <div className="peace-bead-experience">
  <div className="peace-bead-slider" data-testid="bead-slider" role="group" aria-label="묵주 또는 염주를 잡고 아래로 쓸어 넘기기"
   onPointerDown={e=>{if(disabled)return;e.currentTarget.setPointerCapture(e.pointerId);drag.current={id:e.pointerId,y:e.clientY};onTouch();}}
   onPointerMove={e=>{const d=drag.current;if(!d||d.id!==e.pointerId)return;const distance=e.clientY-d.y;setOffset(Math.max(-.45,Math.min(.95,distance/64)));if(distance>=64){onAdvance();release();}}}
   onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}>
   <svg viewBox="0 0 360 660" aria-hidden="true">
    <defs><radialGradient id={`${id}-wood`} cx="32%" cy="25%" r="76%"><stop offset="0" stopColor="#f8d39a"/><stop offset=".32" stopColor="#dca35e"/><stop offset=".8" stopColor="#b7783f"/><stop offset="1" stopColor="#8f582e"/></radialGradient><pattern id={`${id}-grain`} width="9" height="70" patternUnits="userSpaceOnUse"><path d="M2 0 Q-2 20 3 36 T2 70 M7 0 Q12 25 7 45 T7 70" fill="none" stroke="#fff0ce" strokeWidth=".7" opacity=".32"/></pattern></defs>
    <ellipse cx="180" cy="328" rx="106" ry="284" fill="none" stroke="#a88d5e" strokeWidth="3"/>
    {Array.from({length:30},(_,i)=>{const angle=(i+step+offset)/30*Math.PI*2,x=180+106*Math.sin(angle),y=328-284*Math.cos(angle);return <g key={i} style={{transform:`translate(${x}px, ${y}px) rotate(${-angle*180/Math.PI}deg)`,transition:drag.current?'none':'transform 240ms ease-out'}}><ellipse cy="4" rx="23" ry="25" fill="#624522" opacity=".1"/><circle r={i===0?25:23} fill={`url(#${id}-wood)`}/><circle r={i===0?24:22} fill={`url(#${id}-grain)`}/><ellipse cx="-7" cy="-10" rx="7" ry="4" fill="#fff7df" opacity=".3"/></g>;})}
   </svg>
  </div>
  <div className="peace-bead-progress" role="status"><strong>{step}</strong><span>한 알씩, 내 속도로</span></div>
  <p className="peace-muted">구슬을 잡고 아래로 천천히 쓸어보세요</p>
  <button className="peace-bead-key" disabled={disabled} onClick={onAdvance}>{label}</button>
 </div>;
}
