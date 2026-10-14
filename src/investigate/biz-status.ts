import { cached, fetchJson } from "./runtime";
import type { BizStatusResult } from "./types";

const DAY = 86_400_000;
const ENDPOINT = "https://api.odcloud.kr/api/nts-businessman/v1/status";

function normalizeBizNo(value: string) { return value.replace(/\D/g, ""); }

function statusFrom(payload: unknown): BizStatusResult["status"] {
  const row = (payload as { data?: Array<{ b_stt?: string; b_stt_cd?: string; tax_type?: string }> } | null)?.data?.[0];
  if (!row) return "unknown";
  const text = `${row.b_stt ?? ""} ${row.tax_type ?? ""}`;
  if (row.b_stt_cd === "03" || /폐업/.test(text)) return "closed";
  if (/등록되지 않은|미등록/.test(text)) return "unregistered";
  if (row.b_stt_cd === "01" || /계속사업자/.test(text)) return "active";
  return "unknown";
}

/** Calls the official NTS status API only when NTS_API_KEY exists; all failure paths are non-blocking. */
export async function bizStatus(bizNo: string): Promise<BizStatusResult> {
  const businessNumber = normalizeBizNo(bizNo);
  const key = process.env.NTS_API_KEY;
  if (!key || businessNumber.length !== 10) return { businessNumber, status: "unchecked", source: "none" };
  return cached(`biz:${businessNumber}`, DAY, async () => {
    const payload = await fetchJson(`${ENDPOINT}?serviceKey=${encodeURIComponent(key)}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ b_no: [businessNumber] }),
    });
    return { businessNumber, status: statusFrom(payload), source: payload ? "nts-businessman" : "none" };
  });
}
