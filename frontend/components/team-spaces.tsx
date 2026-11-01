import {Activity,ArrowRight,Box,Users} from 'lucide-react';

const spaces=[
 {name:'평온의 방',title:'평온의 방 · 오늘도 무사히',description:'같은 정원에서 성호, 염주, 돌탑으로 각자의 마음을 쉬어가세요.',href:'/peace-room',Icon:Box},
 {name:'워룸',title:'워룸 · 팀의 업무 공간',description:'진행 중인 업무와 검토할 작업을 한눈에 확인하세요.',href:'/war-room',Icon:Activity},
 {name:'공동 대응 훈련',title:'공동 대응 훈련',description:'가상 금융 장애 상황에서 팀과 함께 대응 과정을 연습하세요.',href:'/war-room/city',Icon:Users},
];
export default function TeamSpaces(){
 return <section className="team-space-cards" aria-label="메타버스 공간 입장">{spaces.map(({name,title,description,href,Icon})=><nav key={href} aria-label={name} className="team-space-entry"><div className="team-space-icon"><Icon size={28} aria-hidden="true"/></div><div className="team-space-copy"><strong>{title}</strong><p>{description}</p></div><a href={href}>{name} 입장 <ArrowRight size={20} aria-hidden="true"/></a></nav>)}</section>;
}
