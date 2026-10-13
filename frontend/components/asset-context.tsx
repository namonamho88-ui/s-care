"use client";
import {useEffect,useState} from 'react';
import PaginatedList from './pagination';
type Row=Record<string,any>;
export default function AssetContext({id,api}:{id:string;api:(p:string)=>Promise<any>}){
 const [data,setData]=useState<Row|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{let active=true;setData(null);setError('');api(`/assets/${id}/context`).then(d=>{if(active)setData(d);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[id,api,retry]);
 if(error)return <div role="alert">{error}<button onClick={()=>setRetry(n=>n+1)}>다시 조회</button></div>;
 if(!data)return <p role="status">관련 지식과 장애 이력을 불러오는 중입니다.</p>;
 return <section aria-label="자산별 대응 정보" className="asset-context"><h3>{data.asset.name} · 대응 정보</h3><p className="small">소속 시스템: {data.asset.system_id||'업무 시스템'} · 담당: {data.asset.owner_id} · 중요도: {data.asset.criticality}</p><details><summary>구성요소 {data.components.length}개 · 의존 관계 {data.dependencies.length}개</summary>{data.components.map((a:Row)=><p key={a.id}>{a.name} · {a.id}</p>)}{data.dependencies.map((e:Row)=><p key={e.source_id+e.target_id}>{e.source_id} → {e.target_id}</p>)}</details><h4>연결된 승인 지식</h4><PaginatedList<Row> label="자산별 승인 지식" items={data.skills} empty="연결된 승인 지식이 없습니다.">{rows=>rows.map(k=><details key={k.id}><summary>{k.title}</summary><p>{k.conditions}</p><p>{k.checks}</p><p>{k.solution}</p><p>{k.cautions}</p></details>)}</PaginatedList><h4>과거 장애 사례</h4><p className="small">최근 최대 20건 · 삭제된 장애 제외</p><PaginatedList<Row> label="자산별 장애" items={data.incidents} empty="저장된 장애 이력이 없습니다.">{rows=>rows.map(i=><details key={i.id}><summary>{i.title} · {i.type}</summary><p>{i.id} · {i.status}</p><p>{i.notes}</p><p>{i.prevention}</p></details>)}</PaginatedList><details><summary>주요 장애 유형·대응 매뉴얼</summary>{data.types.map((t:Row)=><p key={t.type}>{t.type}: {t.total}건</p>)}{data.manuals.map((m:Row)=><details key={m.id}><summary>{m.title}</summary><p>{m.procedure_text}</p></details>)}</details></section>;
}
