"use client";

import { useEffect, useMemo, useState } from "react";
import { scoreText, type Label, type SignalGroup } from "@/engine";
import type { ShownReason } from "./Reasons";
import { DEMO_HANDLE } from "@/lib/copy";
import { useLang } from "@/lib/i18n";
import { communityKeys, keyLabel, oneLineReason, shareUrl } from "@/lib/result-view";
import { HeroSample } from "./HeroSample";

const SAMPLE = "급등주 종목 무료로 공개합니다. 수익 인증 300%, 선착순 20명. ㅌㄹㄱㄹ @stock_king77";

const TONE = { HIGH: "risk-high", REVIEW: "risk-review", LOW: "risk-low" } as const;
const STEP = { LOW: 1, REVIEW: 2, HIGH: 3 } as const;

type AccountLookup =
  | { status: "idle" }
  | { status: "loading"; handle: string }
  | { status: "known"; handle: string; profileUrl: string; label: Label; reasons: ShownReason[]; signalGroups: SignalGroup[]; postCount: number; profileCountry?: string | null; sharedAccounts: number }
  | { status: "paste"; handle: string; profileUrl: string }
  | { status: "unsupported" }
  | { status: "error"; message: "invalid" | "demoFail" };

type LiveResult = {
  score: number;
  label: Label;
  reasons: ShownReason[];
  signalGroups: SignalGroup[];
  modelReview?: { verdict: "scam" | "benign" | "unsure"; confidence: number; rationale: string; model: string } | null;
};

type Registry = { status: "closed" } | { status: "open"; picked: string[] } | { status: "sending"; picked: string[] } | { status: "done" } | { status: "limited" } | { status: "failed" };

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
  const { t } = useLang();
  const [text, setText] = useState("");
  const [accountQuery, setAccountQuery] = useState("");
  const [account, setAccount] = useState<AccountLookup>({ status: "idle" });
  const [manualOverride, setManualOverride] = useState(false);
  const textResult = useMemo(() => text.trim() ? scoreText(text) : null, [text]);
  const [serverResult, setServerResult] = useState<{ input: string; result: LiveResult } | null>(null);
  const [aiStatus, setAiStatus] = useState<"idle" | "checking" | "applied" | "error">("idle");
  const [sharedKeys, setSharedKeys] = useState<string[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [registry, setRegistry] = useState<Registry>({ status: "closed" });
  const [shareMsg, setShareMsg] = useState<"" | "copied" | "failed">("");

  useEffect(() => {
    if (!textResult || !textResult.needsLlmReview || (account.status === "known" && !manualOverride)) {
      return;
    }

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
        setAiStatus("applied");
      } catch (error) {
        if ((error as Error).name !== "AbortError") setAiStatus("error");
      }
    }, 900);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [text, textResult, account.status, manualOverride]);

  const handle = account.status === "known" || account.status === "paste" ? account.handle : null;
  const keys = useMemo(() => {
    const own = communityKeys(handle, text);
    return [...own, ...sharedKeys.filter((k) => !own.includes(k))].slice(0, 6);
  }, [handle, text, sharedKeys]);
  const keysParam = keys.join("\n");

  // 이용자 신고 수 — 키가 바뀌면 잠깐 기다렸다 한 번 조회
  useEffect(() => {
    if (!keysParam) return;   // 화면은 지금 키의 수만 읽으므로 지난 값은 비우지 않아도 된다
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const q = new URLSearchParams();
        for (const k of keysParam.split("\n")) q.append("k", k);
        const response = await fetch(`/api/community?${q}`, { cache: "no-store", signal: controller.signal });
        const data = await response.json().catch(() => null);
        if (response.ok && data?.counts) setCounts(data.counts as Record<string, number>);
      } catch { /* 신고 수는 보조 정보 — 실패해도 판독은 그대로 */ }
    }, 500);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [keysParam]);

  const currentServerResult = serverResult?.input === text ? serverResult.result : null;
  const result = account.status === "known" && !manualOverride
    ? { label: account.label, reasons: account.reasons, signalGroups: account.signalGroups }
    : (currentServerResult ?? textResult);
  const level = result ? (result.label as keyof typeof TONE) : null;
  const positive = result?.reasons.filter((reason) => reason.points > 0) ?? [];
  const reported = keys.filter((k) => (counts[k] ?? 0) > 0).sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0));

  async function checkAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = classifyInput(accountQuery);
    if (input.kind === "unsupported") {
      setAccount({ status: "unsupported" });
      return;
    }
    if (input.kind === "invalid") {
      setAccount({ status: "error", message: "invalid" });
      return;
    }
    await lookup(input.handle);
  }

  /** 합성 데모 계정을 한 번에 연다. 조회가 안 되면(DB 불통 등) 예시 문구로 대신 보여 준다 */
  async function showDemo() {
    setAccountQuery(`@${DEMO_HANDLE}`);
    const ok = await lookup(DEMO_HANDLE);
    if (!ok) {
      setText(SAMPLE);
      setManualOverride(true);
      setAccount({ status: "error", message: "demoFail" });
    }
  }

  async function lookup(h: string): Promise<boolean> {
    setAccount({ status: "loading", handle: h });
    setManualOverride(false);
    setRegistry({ status: "closed" });
    try {
      const response = await fetch(`/api/accounts/${encodeURIComponent(h)}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (response.ok && data?.found) {
        const postText = Array.isArray(data.posts)
          ? data.posts.slice(0, 8).map((post: { text?: string }) => post.text?.trim()).filter(Boolean).join("\n\n")
          : "";
        if (postText) setText(postText);
        setAccount({
          status: "known",
          handle: data.account.handle ?? h,
          profileUrl: data.account.profileUrl ?? `https://www.threads.com/@${h}`,
          label: (["LOW", "REVIEW", "HIGH"].includes(data.account.label) ? data.account.label : "LOW") as Label,
          reasons: Array.isArray(data.account.reasons) ? data.account.reasons : [],
          signalGroups: Array.isArray(data.account.signalGroups) ? data.account.signalGroups : [],
          postCount: Number(data.account.postTotal ?? data.posts?.length ?? 0),
          profileCountry: data.account.profileCountry,
          sharedAccounts: Array.isArray(data.sharedWith) ? data.sharedWith.length : 0,
        });
        return true;
      }
      setAccount({ status: "paste", handle: h, profileUrl: `https://www.threads.com/@${h}` });
    } catch {
      setAccount({ status: "paste", handle: h, profileUrl: `https://www.threads.com/@${h}` });
    }
    return false;
  }

  // 가족이 보낸 링크(?a=계정 · ?k=연락처)로 들어오면 그 조회를 바로 연다
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const q = new URLSearchParams(window.location.search);
      const a = q.get("a");
      const ks = q.getAll("k").slice(0, 3);
      if (a) {
        const input = classifyInput(a);
        if (input.kind === "handle") { setAccountQuery(`@${input.handle}`); void lookup(input.handle); }
      } else if (ks.length) setSharedKeys(ks);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function editText(value: string) {
    setText(value); setManualOverride(true); setServerResult(null); setAiStatus("idle");
    if (registry.status !== "closed") setRegistry({ status: "closed" });
  }

  async function submitRegistry(picked: string[]) {
    setRegistry({ status: "sending", picked });
    try {
      const response = await fetch("/api/community", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ keys: picked }) });
      const data = await response.json().catch(() => null);
      if (response.status === 429) { setRegistry({ status: "limited" }); return; }
      if (!response.ok) { setRegistry({ status: "failed" }); return; }
      if (data?.counts) setCounts((c) => ({ ...c, ...(data.counts as Record<string, number>) }));
      setRegistry({ status: "done" });
    } catch {
      setRegistry({ status: "failed" });
    }
  }

  async function share() {
    const url = shareUrl(window.location.origin, handle, keys);
    const shareText = handle || keys.length ? t.share.text : t.share.textGeneric;
    if (typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches) {
      try { await navigator.share({ title: "Scam Radar", text: shareText, url }); return; } catch (e) { if ((e as Error).name === "AbortError") return; }
    }
    try {
      await navigator.clipboard.writeText(`${shareText} ${url}`);
      setShareMsg("copied");
    } catch {
      setShareMsg("failed");
    }
    window.setTimeout(() => setShareMsg(""), 4000);
  }

  return (
    <section id="check" className="analyzer-shell" aria-labelledby="analyzer-title">
      <header className="analyzer-hero">
        <div className="analyzer-hero-copy">
          <div className="hero-label">{t.hero.label}</div>
          <h1>{t.hero.title1}<br />{t.hero.title2}<br /><em>{t.hero.title3}</em></h1>
          <p>{t.hero.lead}</p>
          <form className="account-form" onSubmit={checkAccount}>
            <label htmlFor="account-query">{t.hero.formLabel}</label>
            <div>
              <input
                id="account-query"
                value={accountQuery}
                onChange={(event) => setAccountQuery(event.target.value)}
                placeholder={t.hero.placeholder}
                autoComplete="off"
              />
              <button type="submit" disabled={account.status === "loading"}>
                {account.status === "loading" ? t.hero.checking : t.hero.check}
              </button>
            </div>
            <small>{t.scope} {t.hero.scopeTail}</small>
            <button type="button" className="demo-link" onClick={showDemo} disabled={account.status === "loading"}>{t.hero.demo}</button>
          </form>
        </div>
        <HeroSample />
      </header>

      {account.status !== "idle" && account.status !== "loading" && (
        <div className={`account-status account-status-${account.status}`} aria-live="polite">
          {account.status === "known" && (
            <>
              <div><b>@{account.handle}</b><span>{t.status.known(account.postCount, account.sharedAccounts, account.profileCountry)}</span></div>
              <div className="status-actions"><a href={`/report/${encodeURIComponent(`threads:${account.handle.toLowerCase()}`)}`}>{t.status.report}</a></div>
            </>
          )}
          {account.status === "paste" && (
            <>
              <div>
                <b>@{account.handle}</b>
                <div>
                  <span>{t.status.noRecord} {t.notice.account}</span>
                  <ol>{t.status.steps.map((s) => <li key={s}>{s}</li>)}</ol>
                </div>
              </div>
              <div className="status-actions">
                <a href={account.profileUrl} target="_blank" rel="noreferrer">{t.status.open}</a>
                <button type="button" onClick={showDemo}>{t.status.demo}</button>
              </div>
            </>
          )}
          {account.status === "unsupported" && (
            <>
              <div><b>{t.status.unsupportedTitle}</b><span>{t.scope} {t.status.unsupportedTail}</span></div>
              <div className="status-actions"><button type="button" onClick={showDemo}>{t.status.demo}</button></div>
            </>
          )}
          {account.status === "error" && <span>{t.status[account.message]}</span>}
        </div>
      )}

      {reported.length > 0 && (
        <div className="community-warn" role="alert">
          <ul>
            {reported.slice(0, 3).map((k) => (
              <li key={k}><b>⚠ {t.community.warn(counts[k])}</b><span>{keyLabel(k, t.community.kind)}</span></li>
            ))}
          </ul>
          <small>{t.community.warnNote}</small>
        </div>
      )}

      <div className="analyzer-body">
        <div className="analyzer-input">
          <div className="section-kicker"><span /> {t.input.kicker}</div>
          <h2 id="analyzer-title">{t.input.title}</h2>
          <p>{account.status === "known" ? t.input.leadKnown(account.handle) : t.input.lead}</p>
          <div className="textarea-wrap">
            <textarea
              value={text}
              onChange={(event) => editText(event.target.value)}
              placeholder={t.input.placeholder}
              aria-label={t.input.aria}
              rows={9}
            />
            <div className="textarea-meta">
              <span>{t.input.chars(text.length)}</span>
              <div>
                <button type="button" onClick={() => editText(SAMPLE)}>{t.input.sample}</button>
                {text && <button type="button" onClick={() => editText("")}>{t.input.clear}</button>}
              </div>
            </div>
          </div>
          <p className="privacy-note"><span aria-hidden="true">✓</span> {t.notice.home}</p>
        </div>

        <div className={`analyzer-result ${level ? TONE[level] : "risk-empty"}`} aria-live="polite">
        {!result || !level ? (
          <div className="empty-result">
            <div className="radar-mark" aria-hidden="true"><span /><i /></div>
            <div>
              <strong>{account.status === "paste" ? t.result.emptyPaste : t.result.emptyTitle}</strong>
              <p>{account.status === "paste" ? t.result.emptyPasteLead(account.handle) : t.result.emptyLead}</p>
            </div>
          </div>
        ) : (
          <>
            <div className="result-topline"><span>{t.result.eyebrow}</span><span>{aiStatus === "checking" ? t.result.engine.checking : aiStatus === "applied" ? t.result.engine.applied : aiStatus === "error" ? t.result.engine.error : t.result.engine.rule}</span></div>
            <div className="result-level">
              <strong>{t.result.level[level]}</strong>
              <div className="level-meter" role="img" aria-label={t.result.level[level]}>
                {[1, 2, 3].map((n) => <i key={n} data-on={n <= STEP[level]} />)}
              </div>
            </div>
            <p className="result-why"><b>{t.result.why}</b> {oneLineReason(level, result.signalGroups, positive.length > 0, t.result)}</p>

            <div className="result-todo">
              <h3>{t.result.todoTitle}</h3>
              <ol>{t.result.todo[level].map((line) => <li key={line}>{line}</li>)}</ol>
              {level !== "LOW" && (
                <p className="report-links"><b>{t.result.reportTo}</b> {t.result.reportLinks.map((l, i) => <span key={l.url}>{i > 0 && " · "}<a href={l.url} target="_blank" rel="noreferrer">{l.name}</a></span>)}</p>
              )}
            </div>

            <div className="result-actions">
              <button type="button" className="act-register" onClick={() => setRegistry({ status: "open", picked: keys })}>{t.community.button}</button>
              <button type="button" className="act-share" onClick={share}>{t.share.button}</button>
            </div>
            {shareMsg && <p className="act-msg" role="status">{t.share[shareMsg]}</p>}

            {registry.status !== "closed" && (
              <div className="registry-panel">
                <h3>{t.community.title}</h3>
                {registry.status === "done" ? <p>{t.community.done}</p>
                  : registry.status === "limited" ? <p>{t.community.limited}</p>
                  : registry.status === "failed" ? <p>{t.community.failed}</p>
                  : !keys.length ? <p>{t.community.none}</p>
                  : (
                    <>
                      <p>{t.community.lead}</p>
                      <ul>
                        {keys.map((k) => (
                          <li key={k}>
                            <label>
                              <input type="checkbox" checked={registry.picked.includes(k)} disabled={registry.status === "sending"}
                                onChange={(e) => setRegistry({ status: "open", picked: e.target.checked ? [...registry.picked, k] : registry.picked.filter((x) => x !== k) })} />
                              {keyLabel(k, t.community.kind)}
                            </label>
                          </li>
                        ))}
                      </ul>
                      <small>{t.community.privacy}</small>
                      <div className="registry-buttons">
                        <button type="button" disabled={!registry.picked.length || registry.status === "sending"} onClick={() => submitRegistry(registry.picked.slice(0, 5))}>
                          {registry.status === "sending" ? t.community.sending : t.community.submit}
                        </button>
                      </div>
                    </>
                  )}
                <button type="button" className="registry-close" onClick={() => setRegistry({ status: "closed" })}>{t.community.cancel}</button>
              </div>
            )}

            <details className="result-details">
              <summary>{t.result.details}</summary>
              <div className="signal-groups" aria-hidden="true">
                {result.signalGroups.map((group) => <span key={group.code} data-active={group.active}>{t.result.groups[group.code] ?? group.label}</span>)}
              </div>
              <ul className="result-reasons">
                {positive.slice(0, 6).map((reason, i) => (
                  <li key={i}><span aria-hidden="true">●</span><div><strong>{reason.label}</strong>{reason.evidence && <small>“{reason.evidence}”</small>}</div></li>
                ))}
              </ul>
              <small>{t.result.detailsNote}</small>
            </details>

            <p className="result-caution">{t.result.disclaimer}</p>
          </>
        )}
        </div>
      </div>
    </section>
  );
}
