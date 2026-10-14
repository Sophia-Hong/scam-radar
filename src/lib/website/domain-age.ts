/**
 * 도메인 만든 날 — RDAP(등록 정보 공개 표준)만 읽는다. 대상 웹사이트에는 접속하지 않는다. theo/investigate 4a23078의 domain-age를 옮겨 왔다(시간 제한·캐시 추가).
 * rdap.org가 도메인 이름을 해당 등록 기관 RDAP로 넘긴다(.kr은 KISA RDAP로 한 번 더). 보내는 것은 도메인 이름뿐 — 경로·쿼리는 안 보낸다.
 */
const DAY = 86_400_000;
const cache = new Map<string, { createdAt: string | null; until: number }>();

export type Fetcher = (url: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

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

/** -> 만든 지 며칠(모르면 null). 실패는 null — "새 주소 아님"으로 읽지 않는다 */
export async function domainAgeDays(domain: string, opts: { now?: Date; fetcher?: Fetcher } = {}): Promise<number | null> {
  const now = opts.now ?? new Date();
  const hit = cache.get(domain);
  let createdAt: string | null;
  if (hit && hit.until > now.getTime()) createdAt = hit.createdAt;
  else {
    const fetcher: Fetcher = opts.fetcher ?? ((u) => fetch(u, { signal: AbortSignal.timeout(3500), headers: { accept: "application/rdap+json" } }));
    let data = await get(fetcher, `https://rdap.org/domain/${encodeURIComponent(domain)}`);
    if (!data && domain.endsWith(".kr")) data = await get(fetcher, `https://rdap.nic.or.kr/domain/${encodeURIComponent(domain)}`);
    createdAt = registrationDate(data);
    cache.set(domain, { createdAt, until: now.getTime() + (createdAt ? 7 * DAY : 3600_000) });
    if (cache.size > 5000) for (const [k, v] of cache) if (v.until <= now.getTime()) cache.delete(k);
  }
  return createdAt ? Math.max(0, Math.floor((now.getTime() - Date.parse(createdAt)) / DAY)) : null;
}

export function _clearDomainAgeCache() { cache.clear(); }
