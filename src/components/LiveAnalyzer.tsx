"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { scoreText, type Label, type SignalGroup } from "@/engine";
import { minhash } from "@/engine/minhash";
import type { ShownReason } from "./Reasons";
import { DEMO_HANDLE } from "@/lib/copy";
import { useLang } from "@/lib/i18n";
import { communityKeys, keyLabel, shareUrl, signIds, signTexts, type SignId } from "@/lib/result-view";
import { extractEntities } from "@/engine/entities";

const SAMPLE = "급등주 종목 무료로 공개합니다. 원금보장 수익 인증 300%, 선착순 20명. ㅌㄹㄱㄹ @stock_king77";

const TONE = { HIGH: "risk-high", REVIEW: "risk-review", LOW: "risk-low" } as const;
const STEP = { LOW: 1, REVIEW: 2, HIGH: 3 } as const;

type AccountLookup =
  | { status: "idle" }
  | { status: "loading"; handle: string }
  | { status: "known"; handle: string; label: Label; reasons: ShownReason[]; signalGroups: SignalGroup[]; signs: SignId[]; postCount: number }
  | { status: "paste"; handle: string; profileUrl: string }
  | { status: "demoFail" };

type LiveResult = {
  score: number;
  label: Label;
  reasons: ShownReason[];
  signalGroups: SignalGroup[];
  signs?: SignId[];
};

type Check = { counts: Record<string, number>; similar: number; unavailable?: boolean };
type PanelStatus = "closed" | "open" | "sending" | "done" | "limited" | "failed";
type Registry = { status: PanelStatus; picked: string[]; withText: boolean };
const NO_REGISTRY: Registry = { status: "closed", picked: [], withText: false };

/** 공유창(모바일) 또는 복사 — 성공 여부만 돌려준다 */
async function shareOrCopy(title: string, text: string, url: string): Promise<"shared" | "copied" | "failed"> {
  if (typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches) {
    try { await navigator.share({ title, text, url }); return "shared"; } catch (e) { if ((e as Error).name === "AbortError") return "shared"; }
  }
  try { await navigator.clipboard.writeText(`${text} ${url}`); return "copied"; } catch { return "failed"; }
}

/** 한 칸 입력이 계정인가: 공백 없이 @핸들이거나 Threads 프로필 주소일 때만 */
/** 서버 응답 → 화면 상태. "AI 재검토 반영"은 서버가 실제 모델 판정을 받았다고 답했을 때만, 키 없음·상한·실패는 "못 함 · 규칙 결과"(카이 1fe5e41) */
export function aiStatusOf(data: unknown): "applied" | "error" {
  return (data as { ai?: string } | null)?.ai === "applied" ? "applied" : "error";
}

export function accountFromInput(value: string): string | null {
  const v = value.trim();
  if (!v || /\s/.test(v)) return null;
  if (!v.startsWith("@") && !/threads\.(?:com|net)\//i.test(v)) return null;
  const c = classifyInput(v);
  return c.kind === "handle" ? c.handle : null;
}

const TLDS = "com|net|org|kr|co|io|me|shop|store|site|online|xyz|top|vip|app|dev|ai|info|biz|cc|tv|ly|link|click|club|live|page";

/** 입력 분류: Threads 계정(@핸들 · 프로필 주소) / 지원 범위 밖(다른 주소) / 읽을 수 없음. 핸들에는 점이 들어갈 수 있어(john.doe) 주소 판단은 글자 모양으로만 한다 */
export function classifyInput(value: string): { kind: "handle"; handle: string } | { kind: "unsupported" } | { kind: "invalid" } {
  const trimmed = value.trim();
  if (!trimmed) return { kind: "invalid" };
  const urlLike = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) || /^www\./i.test(trimmed)
    || /^[^\s@/]+\.[^\s@/]+\//.test(trimmed)
    || (!trimmed.startsWith("@") && new RegExp(`^[a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.(?:${TLDS})$`, "i").test(trimmed));
  if (urlLike) {
    const m = trimmed.match(/^(?:https?:\/\/)?(?:www\.)?threads\.(?:com|net)\/@([a-zA-Z0-9._]{1,64})(?:[/?#]|$)/i);
    return m ? { kind: "handle", handle: m[1] } : { kind: "unsupported" };
  }
  const raw = trimmed.replace(/^@/, "").split(/[/?#]/)[0];
  return /^[a-zA-Z0-9._]{1,64}$/.test(raw) ? { kind: "handle", handle: raw } : { kind: "invalid" };
}

export function LiveAnalyzer() {
  const { lang, t } = useLang();
  const [input, setInput] = useState("");
  const [text, setText] = useState("");
  const [account, setAccount] = useState<AccountLookup>({ status: "idle" });
  const textResult = useMemo(() => text.trim() ? scoreText(text) : null, [text]);
  const [serverResult, setServerResult] = useState<{ input: string; result: LiveResult } | null>(null);
  const [aiStatus, setAiStatus] = useState<"idle" | "checking" | "applied" | "error">("idle")   // applied = 서버가 실제 모델 판정을 받았다고 답했을 때만;
  const [community, setCommunity] = useState<Check>({ counts: {}, similar: 0 });
  const [registry, setRegistry] = useState<Registry>(NO_REGISTRY);
  const [familyMsg, setFamilyMsg] = useState<"" | "copied" | "failed">("");
  const [shareMsg, setShareMsg] = useState<"" | "copied" | "failed">("");

  const known = account.status === "known";
  // "AI 없이 확인"(율·테오 국외 이전 거부 방법): 켜면 넣은 글·글에서 뽑은 연락처·서명이 브라우저 밖으로 나가지 않는다 — AI 재검·신고 수 조회 안 함
  const [aiOff, setAiOff] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => { try { if (localStorage.getItem("sr-ai-off") === "1") setAiOff(true); } catch { /* 저장소 없음 */ } }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  function toggleAiOff(on: boolean) {
    setAiOff(on); setServerResult(null); setAiStatus("idle");
    if (on) { setCommunity({ counts: {}, similar: 0 }); setRegistry(NO_REGISTRY); }   // 이전에 받은 신고 수·열린 신고 패널도 지운다
    try { if (on) localStorage.setItem("sr-ai-off", "1"); else localStorage.removeItem("sr-ai-off"); } catch { /* 저장소 없음 */ }
  }
  // 대상이 바뀌면 세대를 올린다 — 이전 대상의 신고 요청 응답이 늦게 와도 새 화면에 "신고했어요"가 뜨지 않게(카이 5808c65)
  const gen = useRef(0);

  useEffect(() => {
    if (aiOff || !textResult || !textResult.needsLlmReview || known) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setAiStatus("checking");
      try {
        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text }),
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error("analysis failed");
        setServerResult({ input: text, result: data as LiveResult });
        setAiStatus(aiStatusOf(data));
      } catch (error) {
        if ((error as Error).name !== "AbortError") setAiStatus("error");
      }
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [text, textResult, known, aiOff]);

  const handle = account.status === "known" || account.status === "paste" ? account.handle : null;
  const keys = useMemo(() => {
    // 계정 조회의 글은 공개 응답에서 연락처가 가려져 있다 — 신고·조회 키는 확인한 계정만(가린 값을 키로 쓰지 않게)
    const own = communityKeys(handle, known ? "" : text);
    return own.slice(0, 6);
  }, [handle, text, known]);
  // 비슷한 신고 글 대조용 서명 — 브라우저에서 계산하고 원문은 보내지 않는다. 계정 조회(여러 글을 이은 것)는 대조하지 않는다
  const sig = useMemo(() => (text.trim() && !known ? minhash(text) : null), [text, known]);
  // 신고 수는 지금 화면의 엔진 판정이 중간 이상일 때만 보인다(서버가 강제, 테오 1791948637·율 1791948645) — 판정이 바뀌면 다시 묻는다
  const engineLevel = (account.status === "known" ? account.label : (serverResult?.input === text ? serverResult.result.label : textResult?.label)) ?? undefined;
  const checkBody = useMemo(() => (keys.length || sig ? JSON.stringify({ keys, sig: sig ?? undefined, level: engineLevel }) : ""), [keys, sig, engineLevel]);

  // 이용자 신고 수·비슷한 신고 글·검토 중 여부 — 입력이 정해질 때마다 한 번
  useEffect(() => {
    if (!checkBody || aiOff) return;   // AI 없이 확인: 연락처·서명·계정 키 어떤 것도 보내지 않고 신고 수도 묻지 않는다(카이 2257ada)
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/community/check", { method: "POST", headers: { "content-type": "application/json" }, body: checkBody, cache: "no-store", signal: controller.signal });
        const data = await response.json().catch(() => null);
        if (response.ok && data?.counts) setCommunity(data as Check);
        else setCommunity({ counts: {}, similar: 0, unavailable: true });
      } catch (e) {   // 신고 장부를 못 읽으면 "0건"처럼 보이지 않게 신고 칸을 숨긴다(카이 ④ 검수 4). 판독은 그대로
        if ((e as Error).name !== "AbortError") setCommunity({ counts: {}, similar: 0, unavailable: true });
      }
    }, 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [checkBody, aiOff, known]);

  const currentServerResult = serverResult?.input === text ? serverResult.result : null;
  const result = account.status === "known"
    ? { label: account.label, reasons: account.reasons, signalGroups: account.signalGroups }
    : (currentServerResult ?? textResult);
  const level = result ? (result.label as keyof typeof TONE) : null;
  const positive = result?.reasons.filter((reason) => reason.points > 0) ?? [];
  const reported = keys.filter((k) => (community.counts[k] ?? 0) > 0).sort((a, b) => (community.counts[b] ?? 0) - (community.counts[a] ?? 0));
  // 계정 조회는 서버가 고른 문장 id(내부 코드 없이), 붙여넣은 글은 브라우저가 같은 함수로 고른다
  // 문장 id: 계정 조회·AI 재검토는 서버가 고른 것, 브라우저 판독만 같은 함수로 직접(공개 응답엔 code 가 없으므로)
  const signs = !level ? [] : signTexts(account.status === "known" ? account.signs : currentServerResult?.signs ?? signIds(level, positive, extractEntities(text).map((e) => e.type), text), t.result);
  const hasAnything = !!result || account.status === "paste" || account.status === "demoFail" || reported.length > 0 || community.similar > 0;

  function reset() {
    gen.current += 1;
    setServerResult(null); setAiStatus("idle"); setRegistry(NO_REGISTRY); setShareMsg("");
    setCommunity({ counts: {}, similar: 0 });
  }

  async function submit(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const value = input.trim();
    if (!value) return;
    reset();
    const h = accountFromInput(value);
    if (h) { setText(""); await lookup(h); }
    else { setAccount({ status: "idle" }); setText(value); }
    document.getElementById("result")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /** 합성 데모 계정을 한 번에 연다. 조회가 안 되면(DB 불통 등) 예시 글로 대신 보여 준다 */
  async function showDemo() {
    reset();
    setInput(`@${DEMO_HANDLE}`);
    const ok = await lookup(DEMO_HANDLE);
    if (!ok) { setText(SAMPLE); setAccount({ status: "demoFail" }); }
  }

  async function lookup(h: string): Promise<boolean> {
    // 새 대상 — 이전 글·서버 결과·공유 키를 먼저 비운다(새 핸들과 이전 글의 연락처가 한 신고로 섞이지 않게, 카이 ④ 검수 1)
    gen.current += 1;
    setText(""); setServerResult(null); setAiStatus("idle"); setRegistry(NO_REGISTRY);
    setAccount({ status: "loading", handle: h });
    try {
      const response = await fetch(`/api/accounts/${encodeURIComponent(h)}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (response.ok && data?.found) {
        const postText = Array.isArray(data.posts)
          ? data.posts.slice(0, 8).map((post: { text?: string }) => post.text?.trim()).filter(Boolean).join("\n\n")
          : "";
        setText(postText);
        setAccount({
          status: "known",
          handle: data.account.handle ?? h,
          label: (["LOW", "REVIEW", "HIGH"].includes(data.account.label) ? data.account.label : "LOW") as Label,
          reasons: Array.isArray(data.account.reasons) ? data.account.reasons : [],
          signalGroups: Array.isArray(data.account.signalGroups) ? data.account.signalGroups : [],
          signs: Array.isArray(data.account.signs) ? data.account.signs : [],
          postCount: Number(data.account.postTotal ?? data.posts?.length ?? 0),
        });
        return true;
      }
    } catch { /* 아래 "기록 없음" 과 같게 */ }
    setAccount({ status: "paste", handle: h, profileUrl: `https://www.threads.com/@${h}` });
    return false;
  }

  // 가족이 보낸 링크(?a=계정)로 들어오면 그 조회를 바로 연다. 연락처 키(?k=)는 링크에 싣지 않는다(카이 948d5a7)
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const q = new URLSearchParams(window.location.search);
      const a = q.get("a");
      if (a) {
        const c = classifyInput(a);
        if (c.kind === "handle") { setInput(`@${c.handle}`); void lookup(c.handle); }
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function sendToParents() {
    const r = await shareOrCopy("Scam Radar", t.family.text, shareUrl(window.location.origin, null));
    if (r !== "shared") { setFamilyMsg(r); window.setTimeout(() => setFamilyMsg(""), 4000); }
  }

  async function shareResult() {
    const r = await shareOrCopy("Scam Radar", t.family.text, shareUrl(window.location.origin, handle));
    if (r !== "shared") { setShareMsg(r); window.setTimeout(() => setShareMsg(""), 4000); }
  }

  async function submitRegistry(picked: string[], withText: boolean) {
    // AI 없이 확인 중이면 보내기 전에 한 번 묻는다 — 그 모드의 "브라우저 밖으로 나가지 않아요"가 사실이도록(테오 1791951462)
    if (aiOff && !window.confirm(t.community.aiOffConfirm)) return;
    const mine = gen.current;
    setRegistry({ status: "sending", picked, withText });
    try {
      const response = await fetch("/api/community", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ keys: picked.slice(0, 5), sig: withText && sig ? sig : undefined }),
      });
      if (gen.current !== mine) return;
      setRegistry({ status: response.status === 429 ? "limited" : response.ok ? "done" : "failed", picked, withText });
    } catch {
      if (gen.current !== mine) return;
      setRegistry({ status: "failed", picked, withText });
    }
  }

  return (
    <>
      <div className="family-bar">
        <p>{t.family.lead}</p>
        <button type="button" onClick={sendToParents}>{t.family.button}</button>
        {familyMsg && <small role="status">{t.family[familyMsg]}</small>}
      </div>

      <section id="check" className="checker" aria-labelledby="checker-title">
        <h1 id="checker-title">{t.hero.title}</h1>
        <form onSubmit={submit}>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={t.hero.placeholder}
            aria-label={t.hero.aria}
            rows={5}
          />
          <button type="submit" className="checker-go" disabled={account.status === "loading" || !input.trim()}>
            {account.status === "loading" ? t.hero.checking : t.hero.check}
          </button>
        </form>
        <div className="checker-links">
          <button type="button" onClick={() => setInput(SAMPLE)}>{t.hero.sample}</button>
          <button type="button" onClick={showDemo}>{t.hero.demo}</button>
          {input && <button type="button" onClick={() => setInput("")}>{t.hero.clear}</button>}
        </div>
        <p className="checker-scope">{t.hero.scope}</p>
        {aiOff ? (
          <p className="privacy-note ai-off">✓ {t.notice.aiOffOn} <button type="button" className="inline-link" onClick={() => toggleAiOff(false)}>{t.notice.aiOffUndo}</button></p>
        ) : (
          <details className="privacy-note">
            <summary>✓ {t.notice.lead} <button type="button" className="inline-link" onClick={(e) => { e.preventDefault(); toggleAiOff(true); }}>[{t.notice.aiOffButton}]</button>{t.notice.leadTail} <span className="more">{t.notice.more} ▸</span></summary>
            <dl>{t.notice.details.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
          </details>
        )}
      </section>

      <section id="result" className="result-area" aria-live="polite">
        {hasAnything && (
          <div className={`result-card ${level ? TONE[level] : "risk-none"}`}>
            {account.status === "known" && (
              <p className="result-account">{t.status.known(account.handle, account.postCount)} <a href={`/report/${encodeURIComponent(`threads:${account.handle.toLowerCase()}`)}`}>{t.status.report}</a></p>
            )}
            {account.status === "paste" && (
              <p className="result-account">{t.status.noRecord(account.handle)} <a href={account.profileUrl} target="_blank" rel="noreferrer">{t.status.open}</a></p>
            )}
            {account.status === "demoFail" && <p className="result-account">{t.status.demoFail}</p>}

            {level && (
              <>
                <div className="verdict-top">
                  <span>{t.result.level[level]}</span>
                  <span className="level-meter" role="img" aria-label={t.result.level[level]}>{[1, 2, 3].map((n) => <i key={n} data-on={n <= STEP[level]} />)}</span>
                  <span className="engine-state">{aiStatus === "checking" ? t.result.engine.checking : aiStatus === "applied" ? t.result.engine.applied : aiStatus === "error" ? t.result.engine.error : t.result.engine.rule}</span>
                </div>
                <div className="verdict">
                  <strong>{t.result.banner[level].title}</strong>
                  <span>{t.result.banner[level].sub}</span>
                </div>
              </>
            )}
            <p className="result-disclaimer">{t.result.disclaimer}</p>

            {!aiOff && !community.unavailable && (reported.length > 0 || community.similar > 0) && (
              <div className="community-warn" role="alert">
                <ul>
                  {reported.slice(0, 3).map((k) => <li key={k}><b>⚠ {t.community.warn(community.counts[k], k.slice(0, k.indexOf(":")))}</b><span>{keyLabel(k, t.community.kind)}</span></li>)}
                  {community.similar > 0 && <li><b>⚠ {t.result.similar(community.similar)}</b></li>}
                </ul>
                <small>{t.community.warnNote}</small>
              </div>
            )}

            {signs.length > 0 && (
              <div className="result-signs">
                <h3>{t.result.signsTitle}</h3>
                <ul>{signs.map(([fact, why]) => <li key={fact}><b>{fact}</b><span>{why}</span></li>)}</ul>
              </div>
            )}

            {level && (
              <div className="result-todo">
                <h3>{t.result.todoTitle}</h3>
                <ol>{t.result.todo[level].map((line) => <li key={line}>{line}</li>)}</ol>
                <p className="report-links"><b>{t.result.reportTo}</b> {t.result.reportLinks.map((l, i) => <span key={l.url}>{i > 0 && " · "}<a href={l.url} target="_blank" rel="noreferrer">{l.name}</a></span>)}</p>
              </div>
            )}

            <div className="stop-box">
              <h3>{t.result.stopTitle}</h3>
              <ul>{t.result.stop.map((line) => <li key={line}>{line}</li>)}</ul>
              {t.result.stopFooter && <p className="stop-footer">{t.result.stopFooter}</p>}
            </div>

            <div className="result-actions">
              <button type="button" className="act-share" onClick={shareResult}>{t.family.button}</button>
              {!community.unavailable && <button type="button" className="act-register" onClick={() => setRegistry({ status: "open", picked: aiOff ? [] : keys, withText: !!sig && !aiOff })}   /* AI 없이 확인: 아무것도 미리 고르지 않음(테오 1791952508) */>{t.community.button}</button>}
            </div>
            {shareMsg && <p className="act-msg" role="status">{t.family[shareMsg]}</p>}

            {registry.status !== "closed" && (
              <div className="side-panel">
                <h3>{t.community.title}</h3>
                {registry.status === "done" ? <p>{t.community.done}</p>
                  : registry.status === "limited" ? <p>{t.community.limited}</p>
                  : registry.status === "failed" ? <p>{t.community.failed}</p>
                  : !keys.length && !sig ? <p>{t.community.none}</p>
                  : (
                    <>
                      <p>{t.community.lead}</p>
                      <ul>
                        {keys.map((k) => (
                          <li key={k}>
                            <label>
                              <input type="checkbox" checked={registry.picked.includes(k)} disabled={registry.status === "sending"}
                                onChange={(e) => setRegistry({ ...registry, status: "open", picked: e.target.checked ? [...registry.picked, k] : registry.picked.filter((x) => x !== k) })} />
                              {keyLabel(k, t.community.kind)}
                            </label>
                          </li>
                        ))}
                        {sig && (
                          <li>
                            <label>
                              <input type="checkbox" checked={registry.withText} disabled={registry.status === "sending"}
                                onChange={(e) => setRegistry({ ...registry, status: "open", withText: e.target.checked })} />
                              {t.community.textOption}
                            </label>
                          </li>
                        )}
                      </ul>
                      <small>{t.community.privacy}</small>
                      <div className="panel-buttons">
                        <button type="button" disabled={(!registry.picked.length && !(registry.withText && sig)) || registry.status === "sending"} onClick={() => submitRegistry(registry.picked, registry.withText)}>
                          {registry.status === "sending" ? t.community.sending : t.community.submit}
                        </button>
                      </div>
                    </>
                  )}
                <button type="button" className="panel-close" onClick={() => setRegistry(NO_REGISTRY)}>{t.community.cancel}</button>
              </div>
            )}

            {/* 엔진 원문 라벨은 한국어 — 영어 화면에는 위의 쉬운 말 징후만 (테오 1791945676) */}
            {lang === "ko" && result && positive.length > 0 && (
              <details className="result-details">
                <summary>{t.result.details}</summary>
                <ul className="result-reasons">
                  {positive.slice(0, 6).map((reason, i) => (
                    <li key={i}><span aria-hidden="true">●</span><div><strong>{reason.label}</strong>{reason.evidence && <small>“{reason.evidence}”</small>}</div></li>
                  ))}
                </ul>
                <small>{t.result.detailsNote}</small>
              </details>
            )}
            {t.result.contactLine && <p className="contact-line">{t.result.contactLine}</p>}
          </div>
        )}
      </section>
    </>
  );
}
