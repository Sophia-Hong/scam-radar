"use client";

import { useLang } from "@/lib/i18n";

/**
 * 홈 첫 화면의 예시 — 합성(가짜) 게시물 카드 두 장. 실제 계정·실제 인물 사진·실제 캡처를 쓰지 않는다 (Kai 훑기 1번: 합성 데모만 공개).
 * 이전에는 실제 Threads 캡처(핸들·얼굴 노출)가 있었다.
 */
export function HeroSample() {
  const s = useLang().t.sample;
  return (
    <div className="analyzer-evidence" aria-label={s.aria}>
      <figure className="analyzer-evidence-card evidence-dark synthetic-card">
        <div className="synthetic-post">
          <div className="synthetic-head"><i aria-hidden="true" /><b>sample_hr_lab</b><span>8m</span></div>
          <p>{s.post}</p>
          <div className="synthetic-badge" aria-hidden="true"><span>{s.badge}</span></div>
          <div className="synthetic-foot">{s.foot1}</div>
        </div>
      </figure>
      <figure className="analyzer-evidence-card evidence-light synthetic-card">
        <div className="synthetic-post">
          <div className="synthetic-head"><i aria-hidden="true" /><b>sample_hr_lab2</b><span>3h</span></div>
          <p>{s.post}</p>
          <div className="synthetic-badge" aria-hidden="true"><span>{s.badge}</span></div>
          <div className="synthetic-foot">{s.foot2}</div>
        </div>
      </figure>
      <div className="analyzer-evidence-note"><b>{s.note}</b><span>{s.noteTail}</span></div>
    </div>
  );
}
