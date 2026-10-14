import { cached, fetchJson } from "./runtime";
import type { DomainAgeResult } from "./types";

const DAY = 86_400_000;
const SOCIAL_HOSTS = ["threads.net", "x.com", "twitter.com", "instagram.com", "facebook.com", "tiktok.com"];
const KOREAN_SECOND_LEVEL = new Set(["co.kr", "or.kr", "ne.kr", "re.kr", "go.kr", "ac.kr", "pe.kr", "mil.kr"]);

export function registrableDomain(input: string): string | null {
  try {
    const value = /^https?:\/\//i.test(input) ? input : `https://${input}`;
    const host = new URL(value).hostname.toLowerCase().replace(/\.$/, "");
    if (!host || host === "localhost" || /^\d+(?:\.\d+){3}$/.test(host) || host.includes(":")) return null;
    const labels = host.split(".");
    if (labels.length < 2) return null;
    const tail = labels.slice(-2).join(".");
    return KOREAN_SECOND_LEVEL.has(tail) && labels.length >= 3 ? labels.slice(-3).join(".") : tail;
  } catch { return null; }
}

function isSocial(domain: string) {
  return SOCIAL_HOSTS.some((host) => domain === host || domain.endsWith(`.${host}`));
}

function registrationDate(payload: unknown): string | null {
  const events = (payload as { events?: Array<{ eventAction?: string; eventDate?: string }> } | null)?.events;
  const event = events?.find((item) => /registr(?:ation|y)/i.test(item.eventAction ?? ""));
  if (!event?.eventDate || Number.isNaN(Date.parse(event.eventDate))) return null;
  return new Date(event.eventDate).toISOString();
}

async function lookup(url: string): Promise<DomainAgeResult> {
  const domain = registrableDomain(url);
  if (!domain || isSocial(domain)) return { domain, createdAt: null, ageDays: null, source: "none" };
  let data = await fetchJson(`https://rdap.org/domain/${encodeURIComponent(domain)}`);
  let source: DomainAgeResult["source"] = data ? "rdap.org" : "none";
  if (!data && domain.endsWith(".kr")) {
    data = await fetchJson(`https://rdap.nic.or.kr/domain/${encodeURIComponent(domain)}`);
    source = data ? "kisa-rdap" : "none";
  }
  const createdAt = registrationDate(data);
  return { domain, createdAt, ageDays: createdAt ? Math.max(0, Math.floor((Date.now() - Date.parse(createdAt)) / DAY)) : null, source };
}

/** Resolves registration metadata only through RDAP; it never requests the target website. */
export async function domainAge(url: string): Promise<DomainAgeResult> {
  const domain = registrableDomain(url);
  if (!domain || isSocial(domain)) return { domain, createdAt: null, ageDays: null, source: "none" };
  return cached(`rdap:${domain}`, 7 * DAY, () => lookup(domain));
}
