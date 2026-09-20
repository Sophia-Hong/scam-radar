"use client";

import { useMemo, useState } from "react";
import { scoreText } from "@/engine";

const SAMPLE = "급등주 종목 무료로 공개합니다. 수익 인증 300%, 선착순 20명. ㅌㄹㄱㄹ @stock_king77";

const LEVEL = {
  HIGH: { eyebrow: "강한 유인 신호", title: "가능성 높음", tone: "risk-high" },
  REVIEW: { eyebrow: "의심 신호 감지", title: "주의 필요", tone: "risk-review" },
  LOW: { eyebrow: "뚜렷한 신호 없음", title: "가능성 낮음", tone: "risk-low" },
} as const;

export function LiveAnalyzer() {
  const [text, setText] = useState("");
  const result = useMemo(() => text.trim() ? scoreText(text) : null, [text]);
  const level = result ? LEVEL[result.label] : null;
  const reasons = result?.reasons.filter((reason) => reason.points > 0).slice(0, 4) ?? [];

  return (
    <section id="check" className="analyzer-shell" aria-labelledby="analyzer-title">
      <div className="analyzer-input">
        <div className="section-kicker"><span /> 실시간 문구 판독</div>
        <h2 id="analyzer-title">의심되는 글을 그대로 붙여넣으세요.</h2>
        <p>버튼도, 계정 조회도 필요 없어요. 입력하는 즉시 이 브라우저 안에서만 분석합니다.</p>
        <div className="textarea-wrap">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={"Threads 게시물, 댓글, DM 문구를 여기에 붙여넣으세요.\n\n예) 무료 종목 공개, 수익 보장, 텔레그램 입장…"}
            aria-label="분석할 게시물 문구"
            rows={9}
          />
          <div className="textarea-meta">
            <span>{text.length.toLocaleString()}자</span>
            <div>
              <button type="button" onClick={() => setText(SAMPLE)}>예시 넣기</button>
              {text && <button type="button" onClick={() => setText("")}>지우기</button>}
            </div>
          </div>
        </div>
        <p className="privacy-note"><span aria-hidden="true">✓</span> 입력 내용은 저장하거나 서버로 보내지 않습니다.</p>
      </div>

      <div className={`analyzer-result ${level?.tone ?? "risk-empty"}`} aria-live="polite">
        {!result || !level ? (
          <div className="empty-result">
            <div className="radar-mark" aria-hidden="true"><span /><i /></div>
            <div>
              <strong>판독 대기 중</strong>
              <p>문구를 붙여넣으면 연락처 유도, 수익 약속, 사칭, 재촉 표현을 바로 확인해요.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="result-topline"><span>{level.eyebrow}</span><span>실시간 분석</span></div>
            <div className="result-score-row">
              <div><strong>{level.title}</strong><p>리딩방 유인 신호 점수</p></div>
              <div className="score-orb"><b>{result.score}</b><span>/ 100</span></div>
            </div>
            <div className="score-track" aria-label={`신호 점수 ${result.score}점`}><span style={{ width: `${result.score}%` }} /></div>
            <div className="result-reasons">
              <h3>감지 근거 {reasons.length}개</h3>
              {reasons.length ? (
                <ul>
                  {reasons.map((reason) => (
                    <li key={reason.code}>
                      <span>+{reason.points}</span>
                      <div><strong>{reason.label}</strong>{reason.evidence && <small>“{reason.evidence}”</small>}</div>
                    </li>
                  ))}
                </ul>
              ) : <p className="no-reason">현재 문구에서는 뚜렷한 유인 신호를 찾지 못했어요.</p>}
            </div>
            <p className="result-caution">자동 판독은 참고용이며, 특정 계정을 사기로 단정하지 않습니다.</p>
          </>
        )}
      </div>
    </section>
  );
}
