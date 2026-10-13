import { NextRequest, NextResponse } from 'next/server';
export const dynamic='force-dynamic';
async function control(req:NextRequest){
 if(req.method==='POST') {let origin;try{origin=new URL(req.headers.get('origin')||'');}catch{return NextResponse.json({error:'Invalid origin'},{status:403});}if(origin.host!==req.headers.get('host')||origin.protocol!==req.nextUrl.protocol)return NextResponse.json({error:'Invalid origin'},{status:403});}
 const token=req.cookies.get('brain_token')?.value;if(!token)return NextResponse.json({error:'계정 관리자 로그인이 필요합니다.'},{status:401});
 try{
  const auth=await fetch(`${process.env.BACKEND_URL||'http://127.0.0.1:8080'}/api/auth/me`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:AbortSignal.timeout(10000)});
  const user=await auth.json();if(!auth.ok||user.role!=='ADMIN')return NextResponse.json({error:'관리자 권한이 필요합니다.'},{status:403});
  if(!process.env.DEMO_BACKEND_URL||!process.env.DEMO_CONTROL_KEY)return NextResponse.json({allowed:false,enabled:false,configured:false});
  const body=req.method==='POST'?await req.json():null;
  if(body&&typeof body.enabled!=='boolean')return NextResponse.json({error:'설정 값을 확인하세요.'},{status:400});
  const res=await fetch(`${process.env.DEMO_BACKEND_URL}/api/demo/control`,{method:req.method,headers:{'X-Demo-Control':process.env.DEMO_CONTROL_KEY,'Content-Type':'application/json'},body:body?JSON.stringify({enabled:body.enabled,actor:user.id}):undefined,cache:'no-store',signal:AbortSignal.timeout(10000)});
  return NextResponse.json(await res.json(),{status:res.status,headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({error:'시연 설정 서버에 연결할 수 없습니다.'},{status:502});}
}
export {control as GET,control as POST};
