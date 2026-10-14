/** A non-scoring observation. The caller decides how, or whether, to display it. */
export interface InvestigationSignal {
  code: "inv:domain-new" | "inv:domain-young" | "inv:fss-unlisted-claim" | "inv:biz-closed" | "inv:biz-unregistered";
  /** Two short, plain-language lines, matching the result-view sign convention. */
  message: { ko: [string, string]; en: [string, string] };
  evidence: Record<string, string | number>;
}

export interface InvestigationInput {
  /** URLs already extracted from a post/profile. No target page is fetched. */
  urls?: readonly string[];
  /** Names explicitly claimed to be licensed financial firms/advisers in the post. */
  claimedFinancialNames?: readonly string[];
  /** Korean business registration numbers, with or without hyphens. */
  businessNumbers?: readonly string[];
}

export type DomainAgeResult = {
  domain: string | null;
  createdAt: string | null;
  ageDays: number | null;
  source: "rdap.org" | "kisa-rdap" | "none";
};

export type FssRegistrationResult = {
  normalizedName: string;
  /** null means the official local data has not been provisioned; it is not a miss. */
  registered: boolean | null;
  source: "local-fss-list" | "unavailable";
};

export type BizStatus = "active" | "closed" | "unregistered" | "unknown" | "unchecked";
export interface BizStatusResult {
  businessNumber: string;
  status: BizStatus;
  source: "nts-businessman" | "none";
}
