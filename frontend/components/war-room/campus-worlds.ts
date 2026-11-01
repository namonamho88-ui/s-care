import {zones,type Component} from './campus-model';
export const worlds=[
 {name:'중앙 광장',subtitle:'함께 만나고, 새로운 세계로',color:'#94c4ff',zone:-1},
 {name:zones[0],subtitle:'Next.js · BFF · Spring Boot API',color:'#6dbaff',zone:0},
 {name:zones[1],subtitle:'장애 접수·분석 · 영향 분석 · 지식 초안 · 이력·보고',color:'#8bdbbb',zone:1},
 {name:zones[2],subtitle:'PostgreSQL · Neo4j · PostgreSQL 작업 큐',color:'#f0bf7c',zone:2},
 {name:zones[3],subtitle:'Jev · Hermes',color:'#c3a4ff',zone:3},
] as const;
export const worldFor=(c:Component)=>c.zone+1;
export async function campusRoomId(value:string){
 const name=value.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
 if(!name||name.length>24||!/^[-\p{L}\p{N} ]+$/u.test(name))throw Error('방 이름은 한글·영문·숫자·공백·하이픈 24자 이내로 입력하세요.');
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(name));
 return 'campus-'+Array.from(new Uint8Array(hash)).slice(0,12).map(n=>n.toString(16).padStart(2,'0')).join('');
}
