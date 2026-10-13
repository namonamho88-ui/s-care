"use client";
import {useEffect,useState} from 'react';
import {Button} from './ui/button';
export default function DemoSettings({api}:{api:(p:string,m?:string,b?:any)=>Promise<any>}){
 const [data,setData]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function load(){try{setData(await api('/demo-control'));setError('');}catch(e){setError((e as Error).message);}}
 useEffect(()=>{void load();},[]);
 async function change(){setBusy(true);try{setData(await api('/demo-control','POST',{enabled:!data.enabled}));setError('');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <section className="workflow-card" aria-label="시연 접속 설정"><h2>로그인 없는 시연 접속</h2><p>AI의 DEMO/REAL 실행 모드와 별개입니다. 비활성화하면 기존 시연 세션도 폐기되며 데이터는 보존됩니다.</p>{error&&<p role="alert">{error}<button onClick={load}>다시 조회</button></p>}{data?<><p>현재: {data.enabled?'활성화':'비활성화'} · 서버 허용: {data.allowed?'허용':'차단'}</p>{data.expiresAt&&<p>자동 종료: {new Date(data.expiresAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} KST</p>}<Button onClick={change} disabled={busy||!data.enabled&&!data.allowed}>{busy?'설정 저장 중…':data.enabled?'시연 접속 비활성화':'시연 접속 활성화'}</Button></>:!error&&<p role="status">설정을 불러오는 중입니다.</p>}</section>;
}
