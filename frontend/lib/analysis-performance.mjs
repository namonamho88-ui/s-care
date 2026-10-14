const decode = value => { try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { return null; } };
const time = value => value ? new Date(value).getTime() : NaN;
const tracked = stage => /^(JEV|ONTOLOGY|TASK_.+|AGENT_.+|HERMES|HARNESS|RECOVERY|MCP_ACTION|VERIFY|REPORT|SKILL_DRAFT)$/.test(stage);

export function resultCategory(result) {
  if (!result) return 'PENDING';
  const provider = String(result.provider || '');
  if (result.fallback === true || provider.includes('FALLBACK')) return 'MOCK_FALLBACK';
  if (result.simulated === true || provider.startsWith('MOCK')) return 'DEMO_MOCK';
  if (result.simulated === false && ['LOCAL_JEV', 'TYPESAFE_JEV', 'HERMES_AGENT'].includes(provider)) return 'REAL_AI';
  return provider === 'OPERATOR' ? 'OPERATOR' : 'UNAVAILABLE';
}
export const categoryLabel = category => ({ REAL_AI:'REAL AI · 실제 모델 응답', DEMO_MOCK:'DEMO Mock · 실제 AI 아님', MOCK_FALLBACK:'MOCK_FALLBACK · 실제 AI 아님', LOCAL:'내부 처리 · 모델 추론 아님', OPERATOR:'담당자가 확인한 판단', PENDING:'응답 출처 확인 중', UNAVAILABLE:'실제 AI 응답 확인 불가' }[category] || '실행 출처 미확인');

/** Preserve SSE rows that arrived while a detail snapshot was in flight. */
export function mergeIncidentEvents(incident, incoming = []) {
  if (!incident) return incident;
  const events = new Map((incident.events || []).map(row => [String(row.id), row]));
  for (const row of incoming) if (row?.id != null) events.set(String(row.id), row);
  return {...incident, events:[...events.values()].sort((a,b) => Number(a.id) - Number(b.id))};
}
export function mergeIncidentSnapshot(snapshot, current) {
  return current?.id === snapshot.id ? mergeIncidentEvents(snapshot, current.events || []) : snapshot;
}

/** Latest run per stage; timers describe server work and never advance incident status. */
export function analysisStages(incident, now = Date.now()) {
  const spans = new Map((incident?.performance?.stages || []).map(row => [row.id, row]));
  const eventStages = new Map();
  for (const event of incident?.events || []) {
    const stage = String(event.stage).toUpperCase();
    if (stage === 'PERFORMANCE') {
      const span = decode(event.data_json);
      if (span?.id && span.stage) spans.set(span.id, span);
    } else if (tracked(stage)) {
      const previous = eventStages.get(stage);
      eventStages.set(stage, {
        stage, state:event.state, startedAt:event.state === 'RUNNING' ? event.created_at : previous?.startedAt,
        endedAt:event.state === 'RUNNING' ? null : event.created_at,
        category:event.state === 'RUNNING' ? 'PENDING' : resultCategory(decode(event.data_json)?.artifacts?.[0]?.parts?.[0]?.data || decode(event.data_json)),
      });
    }
  }
  const latest = new Map();
  for (const span of [...spans.values()].sort((a,b) => time(a.startedAt)-time(b.startedAt))) latest.set(String(span.stage).toUpperCase(), {...span, measured:true});
  for (const [stage,event] of eventStages) {
    const span = latest.get(stage);
    if (!span || (event.state === 'RUNNING' && span.endedAt && time(event.startedAt) > time(span.endedAt))) latest.set(stage, {...event, measured:false});
    else if (span.state === 'RUNNING' && event.state !== 'RUNNING' && time(event.endedAt) >= time(span.startedAt)) latest.set(stage, {...span,state:event.state,endedAt:event.endedAt,category:event.category,measured:false});
  }
  const stopped = incident?.deleted_at || !['REGISTERED','ANALYZING','RECOVERING'].includes(incident?.status);
  return [...latest.values()].map(row => {
    const state = stopped && row.state === 'RUNNING' ? 'INTERRUPTED' : row.state;
    const elapsed = state === 'RUNNING' ? now-time(row.startedAt) : Number.isFinite(row.durationMs) ? row.durationMs : state === 'COMPLETED' ? time(row.endedAt)-time(row.startedAt) : NaN;
    return {...row, state, elapsedMs:Number.isFinite(elapsed) ? Math.max(0,elapsed) : null, nested:String(row.stage).toUpperCase().startsWith('AGENT_')};
  }).sort((a,b) => time(a.startedAt)-time(b.startedAt));
}
