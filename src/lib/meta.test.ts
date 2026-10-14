import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { STRINGS } from "./strings";

// 공유 미리보기·title 에 계정·핸들·링크·'사기/scam'(브랜드명 제외)이 들어가지 않는다 (율 1791946996)
describe("공유 미리보기", () => {
  it("title·설명은 일반 문구", () => {
    for (const L of [STRINGS.ko, STRINGS.en]) {
      const text = (L.meta.title + " " + L.meta.description).replace(/Scam Radar/g, "");
      expect(text).not.toMatch(/@|https?:|t\.me|사기|scam/i);
    }
  });
  it("페이지별 generateMetadata·metadata·og 이미지 파일이 없다(전부 layout 공통)", () => {
    const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
    const pages = walk(join(process.cwd(), "src/app")).filter((f) => !f.endsWith("src/app/layout.tsx"));
    for (const f of pages) {
      expect(f, f).not.toMatch(/opengraph-image|twitter-image/);
      if (/\.(tsx?|jsx?)$/.test(f)) expect(readFileSync(f, "utf8"), f).not.toMatch(/generateMetadata|export const metadata/);
    }
  });
});
