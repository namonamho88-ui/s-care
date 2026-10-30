import {NextRequest,NextResponse} from 'next/server';
export const runtime='nodejs';
export async function POST(req:NextRequest){
 const fail=(error:string,status:number)=>NextResponse.json({error},{status,headers:{'Cache-Control':'no-store'}});
 if(process.env.WAR_ROOM_ENABLED!=='true')return fail('3D 워룸이 아직 활성화되지 않았습니다.',404);
 try{
  const origin=req.headers.get('origin');if(!origin||new URL(origin).host!==req.headers.get('host'))return fail('Invalid origin',403);
  const {room,clientId}=await req.json();if(typeof room!=='string'||!/^[a-z0-9-]{1,32}$/.test(room))return fail('방 이름을 확인하세요.',400);
  if(clientId!==undefined&&(typeof clientId!=='string'||!/^[a-f0-9-]{36}$/.test(clientId)))return fail('잘못된 창 ID',400);
  const cookieName=clientId?`war_guest_${clientId}`:'war_guest';
  const upstream=process.env.BACKEND_URL||'http://127.0.0.1:8080';
  const ws=process.env.WAR_ROOM_WS_URL;if(!ws||!/^wss?:\/\//.test(ws))return fail('실시간 서버 주소가 설정되지 않았습니다.',503);
  const res=await fetch(`${upstream}/api/war-room/guest`,{method:'POST',headers:{'Content-Type':'application/json','X-War-Gateway':process.env.WAR_ROOM_GATEWAY_KEY||''},body:JSON.stringify({room,resume:req.cookies.get(cookieName)?.value}),cache:'no-store',signal:AbortSignal.timeout(15000)});
  const data=await res.json();if(!res.ok)return fail(data.error||'게스트 입장을 처리하지 못했습니다.',res.status);
  if(typeof data.resume!=='string'||typeof data.ticket!=='string')return fail('잘못된 입장 응답입니다.',502);
  const response=NextResponse.json({ticket:data.ticket,id:data.id,name:data.name,ws,expiresAt:data.expiresAt},{headers:{'Cache-Control':'no-store'}});
  response.cookies.set(cookieName,data.resume,{httpOnly:true,sameSite:'strict',secure:process.env.VERCEL==='1'||process.env.COOKIE_SECURE==='true',path:'/api/war-session',maxAge:Math.max(0,Math.min(3600,Math.floor((data.expiresAt-Date.now())/1000)))});return response;
 }catch{return fail('워룸 서버 연결을 확인하지 못했습니다. 다시 입장해 주세요.',502);}
}
