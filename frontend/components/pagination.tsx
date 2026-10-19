"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { usePageActivity } from "@/components/use-page-activity";

export const PAGE_SIZE = 10;
type Row = Record<string, any>;
export function Pagination({ label, page, total, onChange, disabled=false }: {label:string;page:number;total:number;onChange:(page:number)=>void;disabled?:boolean}) {
  const pages=Math.max(1,Math.ceil(total/PAGE_SIZE));
  const start=Math.max(1,Math.min(page-2,pages-4));
  const numbers=Array.from({length:Math.min(5,pages)},(_,i)=>start+i);
  return <nav className="pagination" aria-label={`${label} 페이지 이동`}>
    <span className="pagination-count" aria-live="polite">총 {total}건 · {total?(page-1)*PAGE_SIZE+1:0}–{Math.min(page*PAGE_SIZE,total)}건 <span className="muted">· {page}/{pages}페이지</span></span>
    <div className="pagination-buttons">
      <Button type="button" size="sm" variant="outline" aria-label="첫 페이지" disabled={disabled||page===1} onClick={()=>onChange(1)}>처음</Button>
      <Button type="button" size="sm" variant="outline" aria-label="이전 페이지" disabled={disabled||page===1} onClick={()=>onChange(page-1)}>이전</Button>
      {numbers.map(n=><Button type="button" key={n} size="sm" variant={n===page?"default":"ghost"} aria-label={`${n}페이지`} aria-current={n===page?"page":undefined} disabled={disabled} onClick={()=>onChange(n)}>{n}</Button>)}
      <Button type="button" size="sm" variant="outline" aria-label="다음 페이지" disabled={disabled||page===pages} onClick={()=>onChange(page+1)}>다음</Button>
      <Button type="button" size="sm" variant="outline" aria-label="마지막 페이지" disabled={disabled||page===pages} onClick={()=>onChange(pages)}>마지막</Button>
    </div>
  </nav>;
}

export default function PaginatedList<T>({items,label,children,empty="등록된 항목이 없습니다."}:{items:T[];label:string;children:(items:T[])=>ReactNode;empty?:string}) {
  const [requested,setPage]=useState(1);
  const page=Math.min(requested,Math.max(1,Math.ceil(items.length/PAGE_SIZE)));
  const root=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(page!==requested)setPage(page);},[page,requested]);
  function change(n:number){setPage(n);root.current?.scrollIntoView({block:"start",behavior:"instant"});root.current?.focus({preventScroll:true});}
  const controls=<Pagination label={label} page={page} total={items.length} onChange={change}/>;
  return <div className="paged-list" role="region" aria-label={`${label} 목록`} ref={root} tabIndex={-1}>
    {controls}
    {items.length?children(items.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE)):<div className="empty">{empty}</div>}
    {items.length>PAGE_SIZE&&controls}
  </div>;
}

export function useRemotePage(path:string,api:(path:string)=>Promise<any>,enabled:boolean,revision:number,identity:string) {
  const [requested,setPage]=useState(1),[data,setData]=useState<{items:Row[];page:number;total:number;running?:boolean}|null>(null);
  const [loading,setLoading]=useState(false),[error,setError]=useState("");
  const [retry,setRetry]=useState(0);
  const keepLive=usePageActivity(!!data?.running);
  useEffect(()=>{setData(null);setPage(1);setError("");},[identity]);
  useEffect(()=>{
    if(!enabled||!keepLive){setLoading(false);return;}
    let active=true,pending=false,nextPoll=0;
    const load=async()=>{
      if(pending||document.hidden||Date.now()<nextPoll)return;pending=true;setLoading(true);
      try{const result=await api(`${path}?page=${requested}`);
        if(!result||!Array.isArray(result.items)||!Number.isInteger(result.page)||result.page<1||!Number.isInteger(result.total)||result.total<0)throw new Error("서버의 페이지 응답을 확인할 수 없습니다. 잠시 후 다시 조회해 주세요.");
        nextPoll=Date.now()+(result.running?15000:60000);if(active){setData(result);setPage(result.page);setError("");}}
      catch(e){if(active)setError((e as Error).message);}
      finally{pending=false;if(active)setLoading(false);}
    };
    void load();const interval=setInterval(load,15000);
    return()=>{active=false;clearInterval(interval);};
  },[api,path,enabled,requested,revision,retry,identity,keepLive]);
  return {items:data?.items||[],page:data?.page||1,total:data?.total||0,running:data?.running??false,loading,error,ready:!!data,setPage,reload:()=>setRetry(n=>n+1)};
}

export function RemoteList({result,label,children,empty}:{result:ReturnType<typeof useRemotePage>;label:string;children:(items:Row[])=>ReactNode;empty:string}) {
  const root=useRef<HTMLDivElement>(null);
  function change(page:number){result.setPage(page);root.current?.scrollIntoView({block:"start",behavior:"instant"});root.current?.focus({preventScroll:true});}
  const controls=<Pagination label={label} page={result.page} total={result.total} disabled={result.loading||!result.ready} onChange={change}/>;
  return <div className="paged-list" role="region" aria-label={`${label} 목록`} ref={root} tabIndex={-1} aria-busy={result.loading}>
    {controls}
    {result.error&&<div className="banner error" role="alert">목록 조회 실패: {result.error} <Button type="button" size="sm" variant="outline" onClick={result.reload}>다시 조회</Button></div>}
    {!result.ready?(result.loading?<p role="status" className="empty">목록을 불러오는 중입니다.</p>:null):result.items.length?children(result.items):<div className="empty">{empty}</div>}
    {result.total>PAGE_SIZE&&controls}
  </div>;
}
