import { domainAgeDays, type Fetcher as AgeFetcher } from "./domain-age";
import { hashExpressions, type ParsedSite, type UrlSign } from "./url";
import { webRiskCheck, type ThreatType, type WebRiskResult, type Fetcher as RiskFetcher, type Reserve } from "./webrisk";

/** 새 주소 기준 — 30일 안이면 '조심'으로 올린다, 180일 안이면 징후로만 */
export const NEW_DAYS = 30;
export const YOUNG_DAYS = 180;

export type SiteSign = { kind: "google"; threat: ThreatType } | { kind: "age"; days: number } | { kind: "url"; sign: UrlSign };

export interface WebsiteVerdict {
  domain: string | null;
  level: "HIGH" | "REVIEW" | "LOW";
  signs: SiteSign[];
  /** Google 확인을 했는지 — "skipped"면 화면이 '오늘은 Google 확인 못 함'을 따로 말한다 */
  google: WebRiskResult["status"];
  googleReason?: "no-key" | "limit" | "no-db" | "error";
  ageDays: number | null;
}

/**
 * 판정: Google Web Risk 일치 → HIGH(문구는 단정하지 않는다, 율 1791986341) · 30일 안에 만든 주소, 또는 주소 모양 징후 2개 이상 → REVIEW · 그 밖 → LOW(그래도 놓칠 수 있다고 말함).
 * 단축 주소는 목적지를 모르니 혼자서도 REVIEW.
 */
export async function checkWebsite(site: ParsedSite, deps: { now?: Date; ageFetcher?: AgeFetcher; riskFetcher?: RiskFetcher; reserve?: Reserve; key?: string; dbAvailable?: boolean } = {}): Promise<WebsiteVerdict> {
  const [risk, ageDays] = await Promise.all([
    webRiskCheck(hashExpressions(site), { now: deps.now, fetcher: deps.riskFetcher, reserve: deps.reserve, key: deps.key, dbAvailable: deps.dbAvailable }),
    site.domain ? domainAgeDays(site.domain, { now: deps.now, fetcher: deps.ageFetcher }) : Promise.resolve(null),
  ]);
  const signs: SiteSign[] = [];
  if (risk.status === "match") for (const threat of risk.threats) signs.push({ kind: "google", threat });
  if (ageDays !== null && ageDays < YOUNG_DAYS) signs.push({ kind: "age", days: ageDays });
  for (const sign of site.signs) signs.push({ kind: "url", sign });
  const urlCount = site.signs.length;
  const level = risk.status === "match" ? "HIGH"
    : (ageDays !== null && ageDays < NEW_DAYS) || urlCount >= 2 || site.signs.includes("shortener") || site.signs.includes("userinfo") ? "REVIEW"
    : "LOW";
  return { domain: site.domain ?? site.host, level, signs, google: risk.status, ...(risk.status === "skipped" ? { googleReason: risk.reason } : {}), ageDays };
}
