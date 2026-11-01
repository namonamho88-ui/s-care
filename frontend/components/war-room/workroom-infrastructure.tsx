'use client';
import {components,dependencies,nameOf,zones} from './campus-model';

// Logical deployment components, not an inventory of physical rack units.
export const infrastructure=components.filter(c=>c.kind!=='feature');
export function infrastructurePosition(id:string):[number,number,number]{const index=infrastructure.findIndex(c=>c.id===id);return[index<4?-37:37,0,-29+(index%4)*9];}
export function InfrastructureDetail({id,onSelect}:{id:string;onSelect:(id:string)=>void}){
 const component=components.find(c=>c.id===id);
 if(!component)return null;
 const incoming=dependencies.filter(d=>d.to===id),outgoing=dependencies.filter(d=>d.from===id);
 return <div className="office-infrastructure-detail">
 <span className="office-eyebrow">REPOSITORY CONFIGURATION · 실측 미연동</span><h3>{component.name}</h3><p>{component.role}</p>
 <dl className="office-facts"><dt>구역</dt><dd>{zones[component.zone]}</dd><dt>구성 확인 근거</dt><dd>{component.evidence}</dd><dt>운영 상태</dt><dd>확인되지 않음 · 장비별 헬스 체크 미연동</dd><dt>CPU · 메모리 · 응답 시간 · 오류율</dt><dd>실측 미연동 · 시뮬레이션 기준값을 운영 지표로 표시하지 않습니다.</dd><dt>물리 장비 정보</dt><dd>호스트·IP·스펙·랙 위치 미연동. 3D 장비는 논리 구성의 시각화입니다.</dd></dl>
 {([{title:'이 구성 요소를 사용하는 대상',edges:incoming,other:'from'},{title:'이 구성 요소가 사용하는 대상',edges:outgoing,other:'to'}] as const).map(group=><section key={group.title}><h3>{group.title}</h3>{group.edges.length?group.edges.map(edge=><article className="office-infra-edge" key={`${edge.from}-${edge.to}`}><strong>{nameOf(edge.from)} → {nameOf(edge.to)}</strong><p>{edge.label}</p><small>요청자 → 의존 대상 · 저장소 구성 기준</small><button onClick={()=>onSelect(edge[group.other])}>{nameOf(edge[group.other])} 정보 보기</button></article>):<p>현재 구성 모델에 등록된 연결이 없습니다.</p>}</section>)}
 <p className="office-note">모든 업무·장애 기록은 가상입니다. 이 패널은 저장소에서 확인한 구성 설명이며 현재 클라우드 장비 상태를 조회한 결과가 아닙니다. 연결 관계는 장애 시뮬레이션과 같은 모델을 사용합니다.</p>
 </div>;
}
