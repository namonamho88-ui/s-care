'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
export type Sensation='bead'|'place'|'fall'|'gesture';
const PATTERNS:Record<Sensation,number|number[]>={bead:12,place:22,fall:[30,45,22],gesture:14};
/** Local, opt-in feedback only. An API return value is never treated as proof of physical vibration. */
export function useFeedback(){
 const [supported,setSupported]=useState(false),[vibration,setVibration]=useState(false),[sound,setSound]=useState(false);
 const audio=useRef<AudioContext|null>(null),last=useRef(0),settings=useRef({vibration,sound});settings.current={vibration,sound};
 useEffect(()=>{setSupported(typeof navigator.vibrate==='function');const stop=()=>{if(document.hidden){navigator.vibrate?.(0);void audio.current?.suspend();}};document.addEventListener('visibilitychange',stop);return()=>{document.removeEventListener('visibilitychange',stop);navigator.vibrate?.(0);void audio.current?.close();};},[]);
 const unlock=useCallback(()=>{if(settings.current.sound){try{audio.current??=new AudioContext();void audio.current.resume().catch(()=>{});}catch{/* Sound remains optional. */}}},[]);
 const pulse=useCallback((kind:Sensation)=>{if(document.hidden||Date.now()-last.current<140)return;last.current=Date.now();const s=settings.current;if(s.vibration&&typeof navigator.vibrate==='function')navigator.vibrate(PATTERNS[kind]);
  const context=audio.current;if(!s.sound||!context||context.state!=='running')return;
  // Short synthesized wooden contact sound; no religious chant or external audio request.
  const t=context.currentTime,osc=context.createOscillator(),gain=context.createGain();osc.type='sine';osc.frequency.setValueAtTime(kind==='fall'?150:kind==='bead'?760:360,t);osc.frequency.exponentialRampToValueAtTime(90,t+.09);gain.gain.setValueAtTime(.035,t);gain.gain.exponentialRampToValueAtTime(.0001,t+.12);osc.connect(gain);gain.connect(context.destination);osc.start(t);osc.stop(t+.13);osc.onended=()=>{osc.disconnect();gain.disconnect();};
 },[]);
 return {supported,vibration,sound,pulse,unlock,setVibration:(value:boolean)=>{setVibration(value);if(!value)navigator.vibrate?.(0);},setSound:(value:boolean)=>{settings.current.sound=value;setSound(value);if(value)unlock();else void audio.current?.suspend();}};
}
