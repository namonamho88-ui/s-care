"use client";
import { ArrowRight, Check, CirclePause, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { incidentGuide } from "@/lib/incident-guide.mjs";

export default function IncidentProgress({ guide, incidentTitle, onNavigate, announce = true }: {
  guide: ReturnType<typeof incidentGuide>;
  incidentTitle?: string;
  onNavigate: (target: string) => void;
  announce?: boolean;
}) {
  return <section className={`incident-progress ${guide.tone}`} aria-label="장애 처리 길잡이">
    <div className="progress-heading"><strong>장애 처리 길잡이</strong><span>{incidentTitle || "처음이라면 현재 단계부터 따라오세요"}</span></div>
    <ol className="progress-steps" aria-label="장애 처리 순서">
      {guide.steps.map((step, index) => <li key={step.label} className={step.state} aria-current={step.state === "current" ? "step" : undefined}>
        <span className="step-point" aria-hidden="true">{step.state === "complete" ? <Check size={14} /> : index + 1}</span>
        <div><strong>{step.label}</strong><small>{step.state === "complete" ? "완료" : step.state === "current" ? "현재 단계" : "다음 단계"} · {step.who}</small></div>
      </li>)}
    </ol>
    <div className="progress-now">
      <div className="progress-message" aria-live={announce ? "polite" : "off"} aria-atomic="true">
        <span className="progress-badge">{guide.tone === "auto" && incidentTitle ? <LoaderCircle size={13} aria-hidden="true" /> : guide.tone === "complete" ? <Check size={13} aria-hidden="true" /> : <CirclePause size={13} aria-hidden="true" />}{guide.badge}</span>
        <h3>{guide.title}</h3><p>{guide.text}</p>
        {guide.phase && <p className="progress-phase">최근 실행: {guide.phase}</p>}
      </div>
      <Button size="sm" onClick={() => onNavigate(guide.target)}>{guide.action}<ArrowRight size={14} /></Button>
    </div>
  </section>;
}
