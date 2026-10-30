'use client';
import {useEffect,useState} from 'react';
import type {Fault} from './workflow';
export function usePresentation(steps=7){
 const duration=steps*8;
 const [active,setActive]=useState(false),[playing,setPlaying]=useState(false),[time,setTime]=useState(0),[speed,setSpeed]=useState(1),[fault,setFault]=useState<Fault>('DATABASE');
 useEffect(()=>{if(!active||!playing)return;let last=performance.now();const timer=setInterval(()=>{const now=performance.now();const dt=Math.min(.3,(now-last)/1000);last=now;if(!document.hidden)setTime(t=>Math.min(duration,t+dt*speed));},100);return()=>clearInterval(timer);},[active,playing,speed,duration]);
 useEffect(()=>{if(time>=duration){setPlaying(false);setActive(false);}},[time,duration]);
 return {active,playing,time,speed,fault,setSpeed,setFault,step:Math.min(steps-1,Math.floor(time/8)),progress:(time%8)/8,
 start:()=>{setTime(0);setActive(true);setPlaying(true);},pause:()=>setPlaying(p=>!p),stop:()=>{setPlaying(false);setActive(false);},seek:(step:number)=>{setTime(step*8);setActive(true);setPlaying(false);}};
}
