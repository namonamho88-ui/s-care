import {redirect} from 'next/navigation';
import PeaceRoom from '@/components/peace-room/peace-room';
import './peace-room/peace.css';
export const metadata={title:'S-CARE | 평온의 방',description:'같은 나무 아래에서 함께 쉬어가는 가상 3D 정원'};
export default async function Home({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const params=await searchParams;
 // Preserve existing incident and digital-twin deep links after changing the landing page.
 if(params.view!==undefined||params.incident!==undefined){
  const query=new URLSearchParams();
  for(const [key,value] of Object.entries(params)){if(Array.isArray(value))value.forEach(v=>query.append(key,v));else if(value!==undefined)query.set(key,value);}
  redirect('/operations?'+query.toString());
 }
 return <PeaceRoom/>;
}
