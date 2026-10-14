import { describe, expect, it } from "vitest";
import { insertTextAtomically, KEY_DAILY_LIMIT } from "./community";
import { minhash } from "@/engine/minhash";

// DB 가 있을 때만(로컬 Postgres: DATABASE_URL=postgres://… npx vitest run src/lib/community.db.test.ts). 운영 DB 로 돌리지 말 것
describe.skipIf(!process.env.DATABASE_URL || /neon\.tech|vercel-storage/.test(process.env.DATABASE_URL ?? ""))("서명 등록 원자성 (카이 392ac60, 테오 1791950099)", () => {
  it("상한까지 ok, 넘으면 limited, 같은 id 는 duplicate — 실패는 할당량을 남기지 않음", async () => {
    const tag = `t${Date.now()}`;
    const sig = minhash(`원자성 db 시험 ${tag} 원금보장 무료 텔레그램 t.me/${tag}`);
    const day = `test-${tag}`;
    const out: string[] = [];
    for (let i = 0; i <= KEY_DAILY_LIMIT; i++) out.push(await insertTextAtomically(`${tag}-r${i}`, `${tag}-id${i}`, sig, day, new Date()));
    expect(out.slice(0, KEY_DAILY_LIMIT).every((x) => x === "ok")).toBe(true);
    expect(out[KEY_DAILY_LIMIT]).toBe("limited");
    const sig2 = minhash(`중복 db 시험 ${tag} 확정수익 오픈채팅`);
    expect(await insertTextAtomically(`${tag}-d`, `${tag}-dup`, sig2, day, new Date())).toBe("ok");
    expect(await insertTextAtomically(`${tag}-d`, `${tag}-dup`, sig2, day, new Date())).toBe("duplicate");
  });
});
