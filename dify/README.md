# S-CARE × Dify optional mock analysis

This is an **optional, isolated** analysis path. It does not replace Jev, Hermes, A2A, or the Spring Boot incident workflow.

1. In Dify Studio, import `dify/scare-workflow.yml` as Workflow. Select a valid configured chat model if the imported OpenAI provider is unavailable.
2. Publish the workflow and generate the workflow's API key.
3. In **Vercel**, set `DIFY_API_KEY` and optionally `DIFY_BASE_URL=https://api.dify.ai/v1`. Do not use any `NEXT_PUBLIC_` prefix.
4. Sign into S-CARE. In the frontend, call `analyzeWithDify("CARD_DB_POOL")` from `@/lib/dify-client`. The endpoint is POST `/api/dify/analyze` and is deliberately **not** under the generic Spring backend proxy.
5. Read `result.analysis` in the component. It may be a parsed JSON object or a raw text string.

Mock scenarios: CARD_DB_POOL, API_LATENCY, REDIS_FAILURE, POD_RESTART.

Security: The API key only exists server-side. A valid `brain_token` is verified against Spring Boot `/api/auth/me` before invoking Dify. Both ADMIN and USER sessions can use this read-only mock analysis endpoint. Before public exposure, add server-side rate limits and usage quotas. All scenarios are fixed mocks; no actual recovery execution. Dify import and live API calls require manual verification in your workspace.

Example:
```ts
import { analyzeWithDify } from "@/lib/dify-client";
const result = await analyzeWithDify("CARD_DB_POOL", "원인과 영향 분석");
console.log(result.analysis);
```
