import type { Entity } from "@/engine/entities";
import { bizStatus } from "./biz-status";
import { domainAge } from "./domain-age";
import { fssRegistered } from "./fss";
import type { InvestigationInput, InvestigationSignal } from "./types";

export * from "./types";
export { bizStatus } from "./biz-status";
export { domainAge, registrableDomain } from "./domain-age";
export { fssRegistered, normalizeFssName } from "./fss";

function days(n: number) { return `${n}일`; }
function inputFrom(value: InvestigationInput | readonly Entity[]): InvestigationInput {
  if (Array.isArray(value)) return { urls: value.filter((entity) => entity.type === "url").map((entity) => entity.value) };
  // Array.isArray does not narrow a readonly array union in TypeScript.
  return value as InvestigationInput;
}

/**
 * Optional, non-scoring investigation layer. Callers must explicitly pass claimed
 * licensed names; extracted contact entities alone cannot establish that a name was claimed.
 */
export async function investigate(entities: InvestigationInput | readonly Entity[]): Promise<InvestigationSignal[]> {
  const input = inputFrom(entities);
  const signals: InvestigationSignal[] = [];
  const domains = await Promise.all([...new Set(input.urls ?? [])].map(domainAge));
  for (const domain of domains) {
    if (domain.ageDays === null || !domain.domain) continue;
    if (domain.ageDays < 30) signals.push({ code: "inv:domain-new", evidence: { domain: domain.domain, ageDays: domain.ageDays }, message: {
      ko: [`이 사이트 도메인은 만든 지 ${days(domain.ageDays)} 됐어요.`, "새로 만든 도메인만으로 판단할 수는 없지만, 돈을 보내기 전에는 운영 주체를 더 확인하세요."],
      en: [`This site's domain was registered ${domain.ageDays} days ago.`, "A new domain alone proves nothing, but check who operates it before sending money."],
    } });
    else if (domain.ageDays < 180) signals.push({ code: "inv:domain-young", evidence: { domain: domain.domain, ageDays: domain.ageDays }, message: {
      ko: [`이 사이트 도메인은 만든 지 ${days(domain.ageDays)} 됐어요.`, "비교적 새 도메인이에요. 돈을 보내기 전에는 등록 정보와 연락처를 더 확인하세요."],
      en: [`This site's domain was registered ${domain.ageDays} days ago.`, "It is a relatively new domain. Check registration details and contact information before sending money."],
    } });
  }
  for (const name of [...new Set(input.claimedFinancialNames ?? [])]) {
    const result = await fssRegistered(name);
    if (result.registered === false) signals.push({ code: "inv:fss-unlisted-claim", evidence: { name: result.normalizedName }, message: {
      ko: [`‘${name}’ 이름을 현재 등록 목록에서 찾지 못했어요.`, "목록의 갱신 시점이나 이름 표기가 다를 수 있으니, 파인에서 직접 한 번 더 확인하세요."],
      en: [`“${name}” was not found in the currently loaded registration lists.`, "Lists and name spellings can differ, so verify it directly on FINE as well."],
    } });
  }
  for (const number of [...new Set(input.businessNumbers ?? [])]) {
    const result = await bizStatus(number);
    if (result.status === "closed" || result.status === "unregistered") signals.push({ code: result.status === "closed" ? "inv:biz-closed" : "inv:biz-unregistered", evidence: { businessNumber: result.businessNumber }, message: result.status === "closed" ? {
      ko: ["이 사업자번호는 국세청 상태조회에서 폐업으로 표시됐어요.", "표시가 최신이 아닐 수도 있으니, 돈을 보내기 전에는 업체에 직접 확인하세요."],
      en: ["This business number is shown as closed by the NTS status service.", "Records can lag, so confirm directly with the business before sending money."],
    } : {
      ko: ["이 사업자번호는 국세청 상태조회에서 등록 정보를 찾지 못했어요.", "번호 입력 오류일 수도 있으니, 돈을 보내기 전에는 업체에 직접 확인하세요."],
      en: ["The NTS status service did not find registration information for this business number.", "It may be a typing error, so confirm directly with the business before sending money."],
    } });
  }
  return signals;
}

/** Feature-flagged entry point for the analysis pipeline. It does not alter scoring. */
export async function investigateIfEnabled(input: InvestigationInput | readonly Entity[]): Promise<InvestigationSignal[]> {
  return process.env.INVESTIGATE === "1" ? investigate(input) : [];
}
