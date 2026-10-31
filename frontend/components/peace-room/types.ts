import type {Player} from '../war-room/types';
export type RitualKind='cross'|'rosary'|'bow'|'beads'|'prayer'|'dua'|'rest'|'stone';
export type RitualState={kind:RitualKind;at:number;sequence:number;step:number;stones:number;result:string;stoneX?:number;stoneZ?:number;stoneDirection?:number};
export type PeacePlayer=Player & {ritual?:RitualState};
export const RITUAL_LABELS:Record<RitualKind,string>={cross:'성호 긋기',rosary:'묵주 한 알 넘기기',bow:'합장 인사',beads:'염주 한 알 넘기기',prayer:'묵상 기도',dua:'두아',rest:'잠시 쉬기',stone:'돌 올려놓기'};
export const EMPTY_RITUAL:RitualState={kind:'rest',at:0,sequence:0,step:0,stones:0,result:'idle'};
export const TRADITIONS=[
 {id:'catholic',name:'천주교',subtitle:'성호와 묵주',description:'오른손으로 이마, 가슴, 자신의 왼쪽 어깨, 오른쪽 어깨를 차례로 짚어요.',actions:['cross','rosary']},
 {id:'buddhist',name:'불교',subtitle:'합장과 염주',description:'두 손을 모아 인사하거나, 나무 염주를 한 알씩 천천히 넘겨요.',actions:['bow','beads']},
 {id:'protestant',name:'개신교',subtitle:'조용한 묵상 기도',description:'두 손을 모으고 고개를 살짝 숙여, 원하는 마음을 조용히 담아요.',actions:['prayer']},
 {id:'muslim',name:'이슬람',subtitle:'개인의 두아',description:'두 손바닥을 위로 향해 편안하게 들어 개인의 바람을 담아요. 정규 예배 전체를 재현하지는 않아요.',actions:['dua']},
 {id:'personal',name:'나만의 방식',subtitle:'돌탑과 쉼',description:'돌 하나에 마음을 담거나, 아무것도 하지 않고 잠시 머물러요.',actions:['stone','rest']}
] as const;
