"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { scoreText } from "@/engine";

const SAMPLE = "급등주 종목 무료로 공개합니다. 수익 인증 300%, 선착순 20명. ㅌㄹㄱㄹ @stock_king77";

const LEVEL = {
  HIGH: { eyebrow: "강한 유인 신호", title: "가능성 높음", tone: "risk-high" },
  REVIEW: { eyebrow: "의심 신호 감지", title: "주의 필요", tone: "risk-review" },
  LOW: { eyebrow: "뚜렷한 신호 없음", title: "가능성 낮음", tone: "risk-low" },
} as const;

type AccountLookup =
  | { status: "idle" }
  | { status: "loading"; handle: string }
  | { status: "known"; handle: string; profileUrl: string; score: number; postCount: number }
  | { status: "paste"; handle: string; profileUrl: string }
  | { status: "error"; message: string };

function accountHandle(value: string) {
  const trimmed = value.trim();
  const urlMatch = trimmed.match(/threads\.(?:com|net)\/@([a-zA-Z0-9._]+)/i);
  const raw = urlMatch?.[1] ?? trimmed.replace(/^@/, "").split(/[/?#]/)[0];
  return /^[a-zA-Z0-9._]{1,64}$/.test(raw) ? raw : "";
}

export function LiveAnalyzer() {
  const [text, setText] = useState("");
  const [accountQuery, setAccountQuery] = useState("");
  const [account, setAccount] = useState<AccountLookup>({ status: "idle" });
  const result = useMemo(() => text.trim() ? scoreText(text) : null, [text]);
  const level = result ? LEVEL[result.label] : null;
  const reasons = result?.reasons.filter((reason) => reason.points > 0).slice(0, 4) ?? [];

  async function checkAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const handle = accountHandle(accountQuery);
    if (!handle) {
      setAccount({ status: "error", message: "@계정명이나 Threads 프로필 주소를 확인해 주세요." });
      return;
    }

    setAccount({ status: "loading", handle });
    try {
      const response = await fetch(`/api/accounts/${encodeURIComponent(handle)}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (response.ok && data?.found) {
        const postText = Array.isArray(data.posts)
          ? data.posts.slice(0, 8).map((post: { text?: string }) => post.text?.trim()).filter(Boolean).join("\n\n")
          : "";
        if (postText) setText(postText);
        setAccount({
          status: "known",
          handle: data.account.handle ?? handle,
          profileUrl: data.account.profileUrl ?? `https://www.threads.com/@${handle}`,
          score: postText ? scoreText(postText).score : Number(data.account.score ?? 0),
          postCount: Number(data.account.postTotal ?? data.posts?.length ?? 0),
        });
        return;
      }
      setAccount({ status: "paste", handle, profileUrl: `https://www.threads.com/@${handle}` });
    } catch {
      setAccount({ status: "paste", handle, profileUrl: `https://www.threads.com/@${handle}` });
    }
  }

  return (
    <section id="check" className="analyzer-shell" aria-labelledby="analyzer-title">
      <header className="analyzer-hero">
        <div className="analyzer-hero-copy">
          <div className="hero-label">SCAM RADAR · AI 리딩방 문구 판독</div>
          <h1>사원증까지 위조하는,<br /><em>AI 리딩방 사기</em> —<br />꼭 한번 확인해보아요</h1>
          <p>사진과 경력이 그럴듯해도 안심할 수 없어요. 먼저 확인할 Threads 계정을 넣어보세요.</p>
          <form className="account-form" onSubmit={checkAccount}>
            <label htmlFor="account-query">Threads 계정 확인</label>
            <div>
              <input
                id="account-query"
                value={accountQuery}
                onChange={(event) => setAccountQuery(event.target.value)}
                placeholder="@계정명 또는 Threads 프로필 주소"
                autoComplete="off"
              />
              <button type="submit" disabled={account.status === "loading"}>
                {account.status === "loading" ? "확인 중…" : "계정 확인"}
              </button>
            </div>
            <small>로그인 없이 공개된 정보만 확인하며, 계정명만으로 사기를 단정하지 않습니다.</small>
          </form>
        </div>
        <div className="analyzer-evidence" aria-label="서로 다른 사원 정보에 같은 얼굴 사진이 쓰인 게시물 사례">
          <figure className="analyzer-evidence-card evidence-dark">
            <Image src="/evidence-dark.jpeg" alt="삼성전자 사원증을 내세운 Threads 게시물 캡처" fill priority sizes="(max-width: 900px) 50vw, 28vw" />
          </figure>
          <figure className="analyzer-evidence-card evidence-light">
            <Image src="/evidence-light.jpeg" alt="다른 직무와 부서가 적힌 삼성전자 사원증 게시물 캡처" fill priority sizes="(max-width: 900px) 50vw, 28vw" />
          </figure>
          <div className="analyzer-evidence-note"><b>CASE 01</b><span>같은 얼굴, 다른 부서·직무</span></div>
        </div>
      </header>

      {account.status !== "idle" && account.status !== "loading" && (
        <div className={`account-status account-status-${account.status}`} aria-live="polite">
          {account.status === "known" && (
            <>
              <div><b>@{account.handle}</b><span>확인된 게시물 {account.postCount}건을 현재 판독 기준으로 다시 계산했어요.</span></div>
              <strong>{account.score}점</strong>
            </>
          )}
          {account.status === "paste" && (
            <>
              <div>
                <b>@{account.handle}</b>
                <span>Threads가 임의 계정의 게시물을 외부에서 자동으로 읽는 것을 제한하고 있어요. 최근 글을 복사해 아래에 붙여넣으면 즉시 판독합니다.</span>
              </div>
              <a href={account.profileUrl} target="_blank" rel="noreferrer">계정 열기 ↗</a>
            </>
          )}
          {account.status === "error" && <span>{account.message}</span>}
        </div>
      )}

      <div className="analyzer-body">
        <div className="analyzer-input">
          <div className="section-kicker"><span /> 2단계 · 실시간 문구 판독</div>
          <h2 id="analyzer-title">의심되는 글을 붙여넣으세요.</h2>
          <p>{account.status === "known" ? `@${account.handle}의 확인된 문구를 불러왔어요. 수정하거나 더 붙여넣어도 바로 다시 계산됩니다.` : "계정에서 본 게시물·댓글·DM을 붙여넣으면 입력하는 즉시 이 브라우저 안에서만 분석합니다."}</p>
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
              <strong>{account.status === "paste" ? "게시물 문구가 필요해요" : "계정 판독 대기 중"}</strong>
              <p>{account.status === "paste" ? `@${account.handle}에서 의심되는 글 하나만 복사해 붙여넣어 주세요.` : "계정을 먼저 확인하거나 문구를 바로 붙여넣으면 유인 신호를 확인해요."}</p>
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
      </div>
    </section>
  );
}
