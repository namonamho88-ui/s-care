"use client";
import {useState} from "react";
export default function SimilarPanel({id,api}:{id:string;api:(p:string)=>Promise<any>}){
 const [data,setData]=useState<any>(null),[error,setError]=useState('');
 return <details className="workflow-evidence" onToggle={async e=>{if(!e.currentTarget.open||data)return;try{setData(await api(`/incidents/${id}/similar`));}catch(e){setError((e as Error).message);}}}><summary>비슷한 과거 장애와 당시 조치 보기</summary>{error&&<p role="alert">{error}</p>}{data?<><p className="small muted">{data.note}</p>{data.items.length?data.items.map((x:any)=><article key={x.id} className="system"><h3>{x.title}</h3><p className="small">{x.id} · 유사도 {x.similarity}점 · {x.sameType?'유형 일치 ':''}{x.sameAsset?'같은 자산 ':''} · 공통 표현: {x.matchedTerms.join(', ')||'없음'}</p><p>당시 조치: {x.notes||'미기록'}</p><p>예방 대책: {x.prevention||'미기록'}</p></article>):<p>충분히 비슷한 종료 이력이 없습니다.</p>}</>:!error&&<p>유사 장애를 조회합니다.</p>}</details>;
}
