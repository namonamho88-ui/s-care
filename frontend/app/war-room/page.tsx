import WarRoomHub from '@/components/war-room/war-room-hub';
import {redirect} from 'next/navigation';
import './campus.css';
import './workroom.css';
export default async function Page({searchParams}:{searchParams:Promise<{room?:string;view?:string;campus?:string}>}){
 const {room,view,campus}=await searchParams;
 if(room&&/^[a-z0-9-]{1,32}$/.test(room))redirect(`/war-room/classic?room=${encodeURIComponent(room)}`);
 return <WarRoomHub initialMode={view==='simulation'||campus?'simulation':'work'}/>;
}
