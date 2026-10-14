import { afterEach, describe, expect, it, vi } from "vitest";
import { bizStatus } from "./biz-status";
import { domainAge, registrableDomain } from "./domain-age";
import { fssRegistered, normalizeFssName, setFssListsForTests } from "./fss";
import { resetInvestigationRuntimeForTests } from "./runtime";

const originalFetch = global.fetch;
const originalKey = process.env.NTS_API_KEY;

afterEach(() => {
  global.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.NTS_API_KEY;
  else process.env.NTS_API_KEY = originalKey;
  setFssListsForTests(undefined);
  resetInvestigationRuntimeForTests();
});

describe("domainAge", () => {
  it("uses RDAP metadata for a new registrable .co.kr domain without fetching the target", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ events: [{ eventAction: "registration", eventDate: new Date(Date.now() - 12 * 86_400_000).toISOString() }] }), { status: 200 }));
    const result = await domainAge("https://offers.example.co.kr/path");
    expect(result.domain).toBe("example.co.kr");
    expect(result.ageDays).toBe(12);
    expect(result.source).toBe("rdap.org");
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("rdap.org/domain/example.co.kr"), expect.any(Object));
  });

  it("returns an old domain", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ events: [{ eventAction: "registration", eventDate: "2020-01-01T00:00:00Z" }] }), { status: 200 }));
    expect((await domainAge("example.com")).ageDays).toBeGreaterThan(180);
  });

  it("returns unknown on a failed or timed-out lookup", async () => {
    global.fetch = vi.fn().mockRejectedValue(new DOMException("timeout", "AbortError"));
    await expect(domainAge("unknown.example")).resolves.toMatchObject({ domain: "unknown.example", createdAt: null, ageDays: null, source: "none" });
  });

  it("does not request social-media domains", async () => {
    global.fetch = vi.fn();
    await expect(domainAge("https://www.instagram.com/a_profile")).resolves.toMatchObject({ source: "none" });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("extracts common Korean registrable domains", () => {
    expect(registrableDomain("https://a.b.example.or.kr/x")).toBe("example.or.kr");
    expect(registrableDomain("https://a.example.com/x")).toBe("example.com");
  });
});

describe("fssRegistered", () => {
  it("normalizes spaces and Korean corporate-form spelling for local FSS hits", async () => {
    setFssListsForTests({ financialCompanies: ["주식회사 미래 증권"], similarInvestmentAdvisers: ["가나다 투자자문"] });
    await expect(fssRegistered("(주) 미래증권")).resolves.toMatchObject({ registered: true, source: "local-fss-list" });
    await expect(fssRegistered("없는 투자자문")).resolves.toMatchObject({ registered: false });
    expect(normalizeFssName("㈜ 미래 증권")).toBe("미래증권");
  });

  it("does not call an absent official local list an unlisted company", async () => {
    await expect(fssRegistered("어느회사")).resolves.toMatchObject({ registered: null, source: "unavailable" });
  });
});

describe("bizStatus", () => {
  it("is unchecked without NTS_API_KEY", async () => {
    delete process.env.NTS_API_KEY;
    global.fetch = vi.fn();
    await expect(bizStatus("123-45-67890")).resolves.toMatchObject({ status: "unchecked", source: "none" });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("maps the mocked NTS closed response without exposing the key in source", async () => {
    process.env.NTS_API_KEY = "test-key";
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ b_no: "1234567890", b_stt: "폐업자", b_stt_cd: "03" }] }), { status: 200 }));
    await expect(bizStatus("123-45-67890")).resolves.toMatchObject({ businessNumber: "1234567890", status: "closed", source: "nts-businessman" });
  });
});
