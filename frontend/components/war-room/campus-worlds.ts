import type {Component} from './campus-model';
export const worlds=[
 {name:'중앙 광장',subtitle:'함께 만나고, 새로운 세계로',color:'#94c4ff',zone:-1},
 {name:'게이트웨이 시티',subtitle:'사용자 요청이 시작되는 세계',color:'#6dbaff',zone:0},
 {name:'서비스 아일랜드',subtitle:'기술을 사용자 기능으로 연결',color:'#8bdbbb',zone:1},
 {name:'데이터 코어',subtitle:'기억과 작업이 흐르는 세계',color:'#f0bf7c',zone:2},
 {name:'AI 오비탈',subtitle:'판단과 지식이 만나는 세계',color:'#c3a4ff',zone:3},
] as const;
export const worldFor=(c:Component)=>c.zone+1;
export async function campusRoomId(value:string){
 const name=value.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
 if(!name||name.length>24||!/^[-\p{L}\p{N} ]+$/u.test(name))throw Error('방 이름은 한글·영문·숫자·공백·하이픈 24자 이내로 입력하세요.');
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(name));
 return 'campus-'+Array.from(new Uint8Array(hash)).slice(0,12).map(n=>n.toString(16).padStart(2,'0')).join('');
}
