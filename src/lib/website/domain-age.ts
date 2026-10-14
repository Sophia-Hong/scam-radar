/**
 * 도메인 만든 날 — RDAP(등록 정보 공개 표준)만 읽는다. 대상 웹사이트에는 접속하지 않는다. theo/investigate 4a23078의 domain-age에서 가져왔다.
 * 공개 입력으로 시작되는 서버 요청이라 목적지를 묶는다(카이 db5385f HOLD 4): IANA RDAP 부트스트랩(data.iana.org/rdap/dns.json)에 그 끝자리의
 * 공식 RDAP 서버로 *등록된 HTTPS 주소*로만, 리다이렉트는 따라가지 않는다(redirect: "error"). 보내는 것은 도메인 이름뿐 — 경로·쿼리·이용자 IP는 안 보낸다.
 */
const DAY = 86_400_000;
export const BOOTSTRAP_URL = "https://data.iana.org/rdap/dns.json";
const cache = new Map<string, { createdAt: string | null; until: number }>();
let bootstrap: { services: [string[], string[]][]; until: number } | null = null;

export type Fetcher = (url: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;
const defaultFetcher: Fetcher = (u) => fetch(u, { signal: AbortSignal.timeout(3500), redirect: "error", headers: { accept: "application/rdap+json, application/json" } });

function registrationDate(payload: unknown): string | null {
  const events = (payload as { events?: Array<{ eventAction?: string; eventDate?: string }> } | null)?.events;
  const event = events?.find((item) => /^registration$/i.test(item.eventAction ?? "")) ?? events?.find((item) => /registr/i.test(item.eventAction ?? ""));
  if (!event?.eventDate || Number.isNaN(Date.parse(event.eventDate))) return null;
  return new Date(event.eventDate).toISOString();
}

async function get(fetcher: Fetcher, url: string): Promise<unknown | null> {
  try {
    const r = await fetcher(url);
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

/** 부트스트랩에 등록된 RDAP 기본 주소가 쓸 만한가: https · 이름(IP·localhost 아님) · 쿼리·조각 없음 */
export function safeRdapBase(base: string): string | null {
  try {
    const u = new URL(base);
    if (u.protocol !== "https:" || u.username || u.password || u.search || u.hash || u.port) return null;
    const h = u.hostname.toLowerCase();
    if (!h.includes(".") || h === "localhost" || h.endsWith(".localhost") || /^[\d.]+$/.test(h) || h.includes(":")) return null;
    return u.toString().endsWith("/") ? u.toString() : `${u.toString()}/`;
  } catch { return null; }
}

/** 끝자리(tld) → IANA에 등록된 RDAP 기본 주소(https만). 모르면 null */
export async function rdapBaseFor(domain: string, opts: { now?: Date; fetcher?: Fetcher } = {}): Promise<string | null> {
  const now = opts.now ?? new Date();
  if (!bootstrap || bootstrap.until <= now.getTime()) {
    const data = (await get(opts.fetcher ?? defaultFetcher, BOOTSTRAP_URL)) as { services?: [string[], string[]][] } | null;
    if (!Array.isArray(data?.services)) return null;
    bootstrap = { services: data.services, until: now.getTime() + DAY };
  }
  const tld = domain.toLowerCase().split(".").pop() ?? "";
  for (const [tlds, urls] of bootstrap.services) {
    if (!Array.isArray(tlds) || !Array.isArray(urls) || !tlds.map((x) => String(x).toLowerCase()).includes(tld)) continue;
    for (const url of urls) { const base = safeRdapBase(String(url)); if (base) return base; }
  }
  return null;
}

/** -> 만든 지 며칠(모르면 null). 실패는 null — "새 주소 아님"으로 읽지 않는다 */
export async function domainAgeDays(domain: string, opts: { now?: Date; fetcher?: Fetcher } = {}): Promise<number | null> {
  const now = opts.now ?? new Date();
  const hit = cache.get(domain);
  let createdAt: string | null;
  if (hit && hit.until > now.getTime()) createdAt = hit.createdAt;
  else {
    const fetcher = opts.fetcher ?? defaultFetcher;
    const base = /^[a-z0-9.-]+$/i.test(domain) ? await rdapBaseFor(domain, { now, fetcher }) : null;
    createdAt = base ? registrationDate(await get(fetcher, `${base}domain/${encodeURIComponent(domain)}`)) : null;
    cache.set(domain, { createdAt, until: now.getTime() + (createdAt ? 7 * DAY : 3600_000) });
    if (cache.size > 5000) for (const [k, v] of cache) if (v.until <= now.getTime()) cache.delete(k);
  }
  return createdAt ? Math.max(0, Math.floor((now.getTime() - Date.parse(createdAt)) / DAY)) : null;
}

export function _clearDomainAgeCache() { cache.clear(); bootstrap = null; }
