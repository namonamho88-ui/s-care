import Campus from '@/components/war-room/campus';
import {redirect} from 'next/navigation';
import './campus.css';
export default async function Page({searchParams}:{searchParams:Promise<{room?:string}>}){
 const {room}=await searchParams;
 if(room&&/^[a-z0-9-]{1,32}$/.test(room))redirect(`/war-room/classic?room=${encodeURIComponent(room)}`);
 return <Campus/>;
}
