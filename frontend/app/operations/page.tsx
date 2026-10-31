import {redirect} from 'next/navigation';
// Keep the briefly published operations URL working without moving the main dashboard.
export default async function OperationsAlias({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const params=await searchParams,query=new URLSearchParams();
 for(const [key,value] of Object.entries(params)){if(Array.isArray(value))value.forEach(v=>query.append(key,v));else if(value!==undefined)query.set(key,value);}
 const suffix=query.toString();
 redirect('/'+(suffix?'?'+suffix:''));
}
