import { afterEach, describe, expect, it } from "vitest";
import { adminValueOk } from "./auth";
import { scoreText } from "@/engine";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { canView, decodeParam, isSyntheticAccountId, isSyntheticHandle, onlyVisible, publicReasons, redactSharedContact, signalGroupsFromReasons, reportApiHref } from "./visibility";
import { SYNTHETIC_ACCOUNT_IDS } from "./synthetic-accounts";

describe("공개 경계 — 합성 데모 계정만 공개", () => {
  it("고정 목록의 계정만 공개 — 접두어만 같은 계정은 아님 (카이 5808c65 검수 1)", () => {
    for (const h of ["sample_vipstock77", "demo_lead_a", "SAMPLE_VIPSTOCK77", "@demo_kko_x"]) expect(isSyntheticHandle(h), h).toBe(true);
    for (const h of ["sample_unknown", "demo_x", "syn_001", "vipstock77", "", null, undefined]) expect(isSyntheticHandle(h as string), String(h)).toBe(false);
    expect(isSyntheticAccountId("threads:sample_vipstock77")).toBe(true);
    expect(isSyntheticAccountId("threads:sample_real_person")).toBe(false);     // 같은 접두어의 실계정
    expect(isSyntheticAccountId("instagram:demo_lead_a")).toBe(false);          // 다른 플랫폼의 같은 핸들
    expect(isSyntheticAccountId("evil:threads:sample_vipstock77")).toBe(false);
    expect(isSyntheticAccountId(null)).toBe(false);
  });

  it("목록 = collector/fixtures 의 계정", () => {
    const handles = new Set<string>();
    for (const f of readdirSync(join(process.cwd(), "collector/fixtures")).filter((f) => f.endsWith(".json"))) {
      for (const it of JSON.parse(readFileSync(join(process.cwd(), "collector/fixtures", f), "utf8"))) if (it.author?.handle) handles.add(`threads:${it.author.handle.toLowerCase()}`);
    }
    expect([...SYNTHETIC_ACCOUNT_IDS].sort()).toEqual([...handles].sort());
  });

  it("열람 가능 여부: 관리자는 전부, 공개는 목록만", () => {
    expect(canView("threads:real_user", false)).toBe(false);
    expect(canView("real_user", false)).toBe(false);
    expect(canView("threads:sample_vipstock77", false)).toBe(true);
    expect(canView("demo_lead_a", false)).toBe(true);
    expect(canView("threads:sample_x", false)).toBe(false);
    expect(canView("threads:real_user", true)).toBe(true);
  });

  it("목록 걸러내기", () => {
    const rows = [{ id: "threads:sample_vipstock77" }, { id: "threads:real_b" }, { id: "threads:demo_lead_a" }];
    expect(onlyVisible(rows, (r) => r.id, false).map((r) => r.id)).toEqual(["threads:sample_vipstock77", "threads:demo_lead_a"]);
    expect(onlyVisible(rows, (r) => r.id, true)).toHaveLength(3);
  });
});

describe("근거 문장 속 실계정 가리기 (shared-contact)", () => {
  const reason = (evidence: string, label = "다른 계정 3개와 동일 연락처 사용") => ({ code: "shared-contact", label, points: 16, evidence });

  it("실계정 id 와 개수를 걸러낸다", () => {
    const [r] = redactSharedContact([reason("텔레그램 vip → threads:real_a, threads:sample_daily_gain, threads:demo_lead_a")]);
    expect(r.evidence).toBe("텔레그램 vip → threads:sample_daily_gain, threads:demo_lead_a");
    expect(r.label).toBe("다른 계정 2개와 동일 연락처 사용");
    expect(JSON.stringify(r)).not.toContain("real_a");
  });

  it("보이는 계정이 하나도 없으면 연락처 이름만 남기고 실계정은 개수도 말하지 않는다", () => {
    const [r] = redactSharedContact([reason("텔레그램 vip → threads:real_a, threads:real_b")]);
    expect(r.evidence).toBe("텔레그램 vip");
    expect(r.label).toBe("공개 범위 밖 계정과 동일 연락처 사용");
    expect(JSON.stringify(r)).not.toMatch(/real_|2개/);
  });

  it("전부 합성이거나 다른 근거면 그대로", () => {
    const same = reason("텔레그램 vip → threads:sample_vipstock77, threads:demo_lead_b");
    expect(redactSharedContact([same])[0]).toBe(same);
    const other = { code: "combo:contact+invest", label: "x", points: 1, evidence: "threads:real_z" };
    expect(redactSharedContact([other])[0]).toBe(other);
  });
});

describe("리포트 JSON 링크", () => {
  it("이미 디코딩된 id 를 한 번만 인코딩한다 (이중 인코딩 %253A 금지)", () => {
    expect(reportApiHref("threads:sample_vipstock77")).toBe("/api/reports/threads%3Asample_vipstock77");
    expect(reportApiHref("threads:sample_vipstock77")).not.toContain("%25");
  });

  it("경로 파라미터는 한 번·두 번 인코딩돼 와도, 이미 풀려 있어도 같은 id", () => {
    for (const raw of ["threads:sample_x", "threads%3Asample_x", "threads%253Asample_x"]) expect(decodeParam(raw), raw).toBe("threads:sample_x");
    expect(decodeParam("  threads:sample_x ")).toBe("threads:sample_x");
    expect(decodeParam("100%")).toBe("100%");                                     // 잘못된 인코딩도 던지지 않는다
  });
});

describe("관리자 값 검사", () => {
  const env = process.env as Record<string, string | undefined>;
  const saved = { token: env.ADMIN_TOKEN, node: env.NODE_ENV };
  afterEach(() => { env.ADMIN_TOKEN = saved.token; env.NODE_ENV = saved.node; });

  it("프로덕션에서 토큰이 비어 있으면 누구도 관리자가 아니다 (잠김)", () => {
    delete env.ADMIN_TOKEN; env.NODE_ENV = "production";
    expect(adminValueOk("anything")).toBe(false);
    expect(adminValueOk(undefined)).toBe(false);
  });

  it("토큰이 있으면 값이 정확히 같아야 한다", () => {
    env.ADMIN_TOKEN = "s3cret"; env.NODE_ENV = "production";
    expect(adminValueOk("s3cret")).toBe(true);
    expect(adminValueOk("s3cre")).toBe(false);
    expect(adminValueOk("")).toBe(false);
    expect(adminValueOk(null)).toBe(false);
  });

  it("비프로덕션 + 토큰 없음은 로컬 개발이라 통과", () => {
    delete env.ADMIN_TOKEN; env.NODE_ENV = "development";
    expect(adminValueOk(undefined)).toBe(true);
  });
});

// 공개 응답에는 내부 규칙 코드·가점 크기가 실리지 않는다 (카이 GASA 검수, 테오 10-14)
describe("publicReasons", () => {
  const r = scoreText("급등주 종목 무료로 공개합니다. 수익 인증 300%, 선착순 20명. ㅌㄹㄱㄹ @stock_king77", { followers: 500000 });

  it("code 를 싣지 않고 순번 id·방향·설명만 싣는다", () => {
    const pub = publicReasons(r.reasons);
    expect(pub.length).toBe(r.reasons.length);
    for (const [i, p] of pub.entries()) {
      expect(p).not.toHaveProperty("code");
      expect(p.id).toBe(`s${i + 1}`);
      expect([-1, 0, 1]).toContain(p.points);
      expect(p.what && p.why && p.example && p.benign).toBeTruthy();
    }
    expect(JSON.stringify(pub)).not.toMatch(/\b(gate|veto|combo|impersonate|term|pattern|acct|llm):/);
  });

  it("신호군은 서버에서 계산한 이름·켜짐만", () => {
    const groups = signalGroupsFromReasons(r.reasons);
    expect(groups).toHaveLength(7);
    expect(groups.find((g) => g.code === "infrastructure")?.active).toBe(true);
    expect(groups.every((g) => g.evidence.length === 0)).toBe(true);
  });
});
