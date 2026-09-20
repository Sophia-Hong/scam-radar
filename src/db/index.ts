import * as schema from "./schema";

/**
 * 프로덕션: Vercel Postgres(Neon) HTTP 드라이버 — 서버리스에서 연결 풀 불필요, 요청당 비용 최소.
 * 로컬 개발: 일반 Postgres (pg 드라이버). URL 에 neon.tech 가 없으면 자동으로 pg 를 쓴다.
 * 환경변수: POSTGRES_URL (Vercel Postgres 통합이 자동 주입) 또는 DATABASE_URL
 */
const url = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
export const hasDb = !!url;

type Db = ReturnType<typeof import("drizzle-orm/neon-http").drizzle<typeof schema>>;
let _db: Db | null = null;

export function db(): Db {
  if (_db) return _db;
  if (!url) throw new Error("POSTGRES_URL / DATABASE_URL 이 설정되지 않았습니다");
  if (/neon\.tech|vercel-storage\.com/.test(url)) {
    const { drizzle } = require("drizzle-orm/neon-http") as typeof import("drizzle-orm/neon-http");
    const { neon } = require("@neondatabase/serverless") as typeof import("@neondatabase/serverless");
    _db = drizzle(neon(url), { schema });
  } else {
    const { drizzle } = require("drizzle-orm/node-postgres") as typeof import("drizzle-orm/node-postgres");
    const { Pool } = require("pg") as typeof import("pg");
    _db = drizzle(new Pool({ connectionString: url, max: 3 }), { schema }) as unknown as Db;
  }
  return _db!;
}
export { schema };
