export type DifyScenarioId = "CARD_DB_POOL" | "API_LATENCY" | "REDIS_FAILURE" | "POD_RESTART";
export async function analyzeWithDify(scenario_id:DifyScenarioId,question?:string) {
  const response = await fetch("/api/dify/analyze",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    credentials:"same-origin",
    body:JSON.stringify({scenario_id,question})
  });
  const data = await response.json();
  if(!response.ok) throw new Error(data.error || "Dify 분석 실패");
  return data;
}
