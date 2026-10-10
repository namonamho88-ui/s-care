"use client";
import { useState } from "react";
import { BookOpen, Download, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import manuals from "@/content/manuals.json";
type Section = { id: string; title: string; paragraphs?: string[]; steps?: string[]; callout?: string; table?: { headers: string[]; rows: string[][] } };
export default function ManualCenter() {
  const [audience, setAudience] = useState<"user" | "admin">("user");
  const manual = manuals[audience];
  return <section className="manual-center">
    <div className="manual-switch" aria-label="매뉴얼 선택">
      <Button variant={audience === "user" ? "default" : "outline"} aria-pressed={audience === "user"} onClick={() => setAudience("user")}><BookOpen size={16} />사용자용</Button>
      <Button variant={audience === "admin" ? "default" : "outline"} aria-pressed={audience === "admin"} onClick={() => setAudience("admin")}><ShieldCheck size={16} />관리자용</Button>
      <a className="manual-download" href={`/manuals/${audience}.html`} target="_blank" rel="noreferrer">인쇄용 매뉴얼 열기 ↗</a>
      <a className="manual-download" href={`/manuals/${audience}.html`} download><Download size={14} />HTML 다운로드</a>
    </div>
    <div className="manual-intro"><h2>{manual.title}</h2><p>{manual.subtitle}</p><p>{manual.intro}</p><small>기준일 {manual.updated} · 100% 가상 데이터</small></div>
    <div className="manual-layout" key={audience}>
      <nav className="manual-toc" aria-label="매뉴얼 목차">{manual.sections.map(s => <a key={s.id} href={`#manual-${audience}-${s.id}`}>{s.title}</a>)}</nav>
      <div>{manual.sections.map((s: Section) => <section className="manual-section" id={`manual-${audience}-${s.id}`} key={s.id}>
        <h3>{s.title}</h3>
        {s.paragraphs?.map(p => <p key={p}>{p}</p>)}
        {s.steps && <ol>{s.steps.map(step => <li key={step}>{step}</li>)}</ol>}
        {s.table && <div className="manual-table-scroll"><table><thead><tr>{s.table.headers.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{s.table.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>}
        {s.callout && <aside className="banner">{s.callout}</aside>}
      </section>)}</div>
    </div>
  </section>;
}
