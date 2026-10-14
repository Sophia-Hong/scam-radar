import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { minhash } from "@/engine/minhash";

/**
 * 시험용 DB 에서만(카이 d6ac20e, 테오 1791951037): TEST_DATABASE_URL 이 있고 그 호스트가 localhost/127.0.0.1 일 때.
 * DATABASE_URL·POSTGRES_URL 은 쓰지 않는다 — 이 파일 안에서만 둘 다 TEST_DATABASE_URL 로 덮고 DB 모듈을 그 뒤에 불러온다.
 *   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/postgres npx vitest run src/lib/community.db.test.ts
 * 시험이 만든 행(고유 접두어의 신고 서명·할당량)은 afterAll 에서 지운다.
 */
const testUrl = process.env.TEST_DATABASE_URL ?? "";
const localTestDb = /^postgres(ql)?:\/\/([^@/]*@)?(localhost|127\.0\.0\.1)(:\d+)?\//.test(testUrl);
const tag = `dbtest${Date.now()}`;
type Community = typeof import("./community");
let c: Community;
let dbm: typeof import("@/db");

describe.skipIf(!localTestDb)("서명 등록 원자성 (카이 392ac60, 테오 1791950099)", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testUrl;
    process.env.DATABASE_URL = testUrl;
    dbm = await import("@/db");
    c = await import("./community");
  });
  afterAll(async () => {
    if (!dbm) return;
    await dbm.db().execute(sql`DELETE FROM community_texts WHERE id LIKE ${tag + "%"}`);
    await dbm.db().execute(sql`DELETE FROM community_quota WHERE bucket = ${`d:${tag}`}`);
  });
  it("상한까지 ok, 넘으면 limited, 같은 id 는 duplicate — 실패는 할당량을 남기지 않음", async () => {
    const sig = minhash(`원자성 db 시험 ${tag} 원금보장 무료 텔레그램 t.me/${tag}`);
    const out: string[] = [];
    for (let i = 0; i <= c.KEY_DAILY_LIMIT; i++) out.push(await c.insertTextAtomically(`${tag}-r${i}`, `${tag}-id${i}`, sig, tag, new Date()));
    expect(out.slice(0, c.KEY_DAILY_LIMIT).every((x) => x === "ok")).toBe(true);
    expect(out[c.KEY_DAILY_LIMIT]).toBe("limited");
    const sig2 = minhash(`중복 db 시험 ${tag} 확정수익 오픈채팅`);
    expect(await c.insertTextAtomically(`${tag}-d`, `${tag}-dup`, sig2, tag, new Date())).toBe("ok");
    expect(await c.insertTextAtomically(`${tag}-d`, `${tag}-dup`, sig2, tag, new Date())).toBe("duplicate");
  });
});

describe.skipIf(!localTestDb)("AI 하루 상한 — 호출을 시도하면 실패해도 1회로 셈 (카이 cf53ba8, 테오 1791952082)", () => {
  it("호출 후 예외 → 카운터 유지(돌려주지 않음), 캐시에 없으면 다음에도 다시 셈", async () => {
    process.env.POSTGRES_URL = testUrl;
    process.env.DATABASE_URL = testUrl;
    const llm = await import("./llm");
    const { db } = await import("@/db");
    const bucket = `d:${new Date().toISOString().slice(0, 10)}`;
    const n = async () => Number(((await db().execute(sql`SELECT n FROM community_quota WHERE reporter = 'ai-call' AND bucket = ${bucket}`)) as unknown as { rows: { n: number }[] }).rows?.[0]?.n ?? 0);
    const before = await n();
    await expect(llm.cached("dbtest", `${tag}-boom`, async () => { throw new Error("provider timeout after billing"); })).rejects.toThrow("provider timeout");
    expect(await n()).toBe(before + 1);
    await expect(llm.cached("dbtest", `${tag}-boom`, async () => { throw new Error("again"); })).rejects.toThrow("again");
    expect(await n()).toBe(before + 2);
    await c.release("ai-call", bucket, 2);   // 시험이 쓴 2회는 정리
  });
});
