/** One shared guest garden; URL room names no longer select a peace room. */
export const COMMON_PEACE_ROOM='peace-together';
export function normalizeRoomName(value:string){return value.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();}
export async function trainingRoomId(value:string){
 const name=normalizeRoomName(value);
 if(!name||name.length>27||!/^[-\p{L}\p{N} ]+$/u.test(name))throw new Error('방 이름은 한글·영문·숫자·공백·하이픈 27자 이내로 입력하세요.');
 if(/^[a-z0-9-]+$/.test(name))return `city-${name}`;
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(name));
 return `city-${Array.from(new Uint8Array(digest)).slice(0,12).map(n=>n.toString(16).padStart(2,'0')).join('')}`;
}

/** Separate namespace from training; preserve Korean/case/space normalization and the server's 32-character limit. */
export async function peaceRoomId(value:string){
 const name=normalizeRoomName(value);
 const training=await trainingRoomId(name);
 const suffix=training.slice(5);
 if(suffix.length<=26)return `peace-${suffix}`;
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(name));
 return `peace-${Array.from(new Uint8Array(digest)).slice(0,12).map(n=>n.toString(16).padStart(2,'0')).join('')}`;
}
