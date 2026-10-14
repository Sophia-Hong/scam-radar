import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import { LEARN_CARDS } from "./learn-cards";
import { STRINGS } from "./strings";

/** 문구 = 율 대조 v3 원문 그대로(테오 1791955209). 원문 파일이 이 컴퓨터에 있으면 KR 문장이 그 안에 그대로 있는지 대조한다 */
const DRAFT = `${process.env.HOME}/theo-workspace/reports/scam-radar/2026-10-14-info-cards-draft.md`;

describe("/learn 정보 카드", () => {
  it("한영 8장씩, 사례 없는 카드(1 수익 인증·2 위조 신분증·8 대출)는 사례 줄 없음", () => {
    expect(LEARN_CARDS.ko).toHaveLength(8);
    expect(LEARN_CARDS.en).toHaveLength(8);
    for (const i of [0, 1, 7]) { expect(LEARN_CARDS.ko[i].example).toBeUndefined(); expect(LEARN_CARDS.ko[i].source).toBeUndefined(); }
  });
  it("관계부처 합동 출처는 링크 없음(사본 링크 — 정부 원본 확인 전), 외부 링크는 정부 원 도메인만", () => {
    for (const c of [...LEARN_CARDS.ko, ...LEARN_CARDS.en]) {
      if (c.example) expect(c.source).toBeDefined();
      if (c.source?.org === "관계부처 합동") expect(c.source.url).toBeUndefined();
      if (c.source?.url) expect(new URL(c.source.url).hostname).toMatch(/(^|\.)(ftc\.gov|uspis\.gov)$/);
    }
  });
  it.skipIf(!existsSync(DRAFT))("KR 문장이 v3 원문에 그대로 있다", () => {
    const doc = readFileSync(DRAFT, "utf8");
    for (const c of LEARN_CARDS.ko) {
      for (const s of [c.looks, c.todo, ...(c.example ?? [])]) expect(doc).toContain(s);
    }
    for (const c of LEARN_CARDS.en) for (const s of [c.looks, c.todo]) expect(doc).toContain(s);
  });
  it("링크 문구 한영", () => {
    expect(STRINGS.ko.result.learnLink).toMatch(/^이렇게 속여요/);
    expect(STRINGS.en.learn.title).toBe("How these scams work");
  });
});

describe("/learn 실제 사례 화면 (율 O 1791962248)", () => {
  it("한국어 카드에만, 파일이 있고 출처가 붙는다. 영어 카드는 글만. 수익 인증 대표 = 06", () => {
    const { existsSync } = require("fs") as typeof import("fs");
    for (const c of LEARN_CARDS.ko) for (const im of c.images ?? []) {
      expect(existsSync(`${process.cwd()}/public${im.src}`)).toBe(true);
      expect(im.source.org && im.source.title && im.source.date).toBeTruthy();
    }
    for (const c of LEARN_CARDS.en) expect(c.images).toBeUndefined();
    expect(LEARN_CARDS.ko[0].images?.[0].src).toBe("/learn/06-profit-proof-lotto.jpg");
  });
});
