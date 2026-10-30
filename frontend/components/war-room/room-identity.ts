export function normalizeRoomName(value:string){return value.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();}
export async function trainingRoomId(value:string){
 const name=normalizeRoomName(value);
 if(!name||name.length>27||!/^[-\p{L}\p{N} ]+$/u.test(name))throw new Error('방 이름은 한글·영문·숫자·공백·하이픈 27자 이내로 입력하세요.');
 if(/^[a-z0-9-]+$/.test(name))return `city-${name}`;
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(name));
 return `city-${Array.from(new Uint8Array(digest)).slice(0,12).map(n=>n.toString(16).padStart(2,'0')).join('')}`;
}
