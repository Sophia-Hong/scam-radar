/**
 * collector/inbox 의 JSON(+캡처)을 /api/ingest 로 밀어 넣고 done/ 으로 옮긴다.
 *   npx tsx collector/push.ts                # inbox 전체
 *   npx tsx collector/push.ts collector/fixtures   # 특정 폴더 (시드용, 이동 안 함)
 * 환경변수: API_BASE (기본 http://localhost:3000), INGEST_TOKEN
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import type { CollectedItem } from "./schema";
import { partition, type IngestItemResult } from "../src/lib/ingest-outcome";

const API_BASE = process.env.API_BASE ?? "http://localhost:3000";
const TOKEN = process.env.INGEST_TOKEN ?? "";
const BATCH = Number(process.env.PUSH_BATCH ?? 20); // 서버리스 30초 제한에 걸리면 PUSH_BATCH=3 처럼 줄인다
const MAX_SHOT_BYTES = 3.5 * 1024 * 1024; // Vercel 요청 본문 4.5MB 제한 고려

const root = process.argv[2] ?? path.join("collector", "inbox");
const move = !process.argv[2];
/** 시드 폴더 *정확히* collector/fixtures 를 올릴 때만 fixture 표식 — 접두어(fixtures-temp 등)는 아님(카이 a40a047, 테오 1791950541) */
const realOrSelf = (p: string) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
const FIXTURE = realOrSelf(root) === realOrSelf(path.join("collector", "fixtures"));

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  if (fs.statSync(dir).isFile()) return dir.endsWith(".json") ? [dir] : [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : e.name.endsWith(".json") ? [p] : [];
  });
}

function dataUrl(file: string | null | undefined, base: string): string | null {
  if (!file) return null;
  if (/^(data:|https?:)/.test(file)) return file;
  const p = path.isAbsolute(file) ? file : path.join(base, file);
  if (!fs.existsSync(p)) return null;
  const buf = fs.readFileSync(p);
  if (buf.length > MAX_SHOT_BYTES) { console.warn(`skip large screenshot ${p} (${buf.length} bytes)`); return null; }
  const mime = p.endsWith(".jpg") || p.endsWith(".jpeg") ? "image/jpeg" : "image/png";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

function load(file: string): CollectedItem | CollectedItem[] {
  const base = path.dirname(file);
  const stem = file.replace(/\.json$/, "");
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const items: CollectedItem[] = Array.isArray(raw) ? raw : [raw];
  return items.map((it, i) => {
    const s = items.length > 1 ? `${stem}.${i}` : stem;
    const shot = it.screenshot ?? [".png", ".jpg", ".jpeg"].map((e) => s + e).find(fs.existsSync) ?? null;
    const pshot = it.author.profileScreenshot ?? [".profile.png", ".profile.jpg"].map((e) => s + e).find(fs.existsSync) ?? null;
    return {
      platform: "threads", kind: "post", capturedAt: new Date(fs.statSync(file).mtime).toISOString(),
      ...it,
      screenshot: dataUrl(shot, base),
      author: { ...it.author, profileScreenshot: dataUrl(pshot, base) },
    };
  });
}

async function send(batch: CollectedItem[]) {
  const res = await fetch(`${API_BASE}/api/ingest`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}), ...(FIXTURE ? { "x-ingest-source": "fixture" } : {}) },
    body: JSON.stringify(batch),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as IngestItemResult[];
}

async function main() {
  const files = walk(root);
  if (!files.length) { console.log(`no json in ${root}`); return; }
  const all = files.flatMap((f) => ({ file: f, items: load(f) })).flatMap((x) => (Array.isArray(x.items) ? x.items : [x.items]).map((it) => ({ file: x.file, it })));
  console.log(`${all.length} items from ${files.length} files → ${API_BASE}`);
  let ok = 0, dup = 0, high = 0;
  const rejected: { file: string; item: CollectedItem; error: unknown }[] = [];
  for (let i = 0; i < all.length; i += BATCH) {
    const chunk = all.slice(i, i + BATCH);
    const results = await send(chunk.map((c) => c.it));
    results.forEach((r, j) => {
      if (!chunk[j]) return;
      const label = r.error ? `REJECTED ${JSON.stringify(r.error).slice(0, 120)}` : `${r.duplicate ? "dup " : ""}${r.label} ${r.score} → account ${r.accountId} ${r.accountLabel}`;
      console.log(`  ${chunk[j].it.author.handle.padEnd(24)} ${label}`);
      if (!r.error) { ok++; if (r.duplicate) dup++; if (r.accountLabel === "HIGH") high++; }
    });
    for (const x of partition(chunk, results).rejected) rejected.push({ file: x.item.file, item: x.item.it, error: x.error });
  }
  console.log(`done: ${ok} ok (${dup} dup), ${high} HIGH accounts, ${rejected.length} rejected`);
  if (rejected.length) {
    // 거부된 항목은 보존하고, 원본 배치는 done/ 으로 옮기지 않는다 — 충돌한 실제 글이 재처리 대기열에서 사라지지 않게(카이 a40a047)
    const rejDir = path.join("collector", "rejected");
    fs.mkdirSync(rejDir, { recursive: true });
    const out = path.join(rejDir, `${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.jsonl`);
    fs.writeFileSync(out, rejected.map((r) => JSON.stringify({ file: r.file, error: r.error, item: { ...r.item, screenshot: undefined, author: { ...r.item.author, profileScreenshot: undefined } } })).join("\n") + "\n");
    console.error(`${rejected.length} rejected → ${out} (원본 배치는 그대로 둠)`);
    process.exit(2);
  }
  if (move) {
    const doneDir = path.join("collector", "done", new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-"));
    fs.mkdirSync(doneDir, { recursive: true });
    for (const f of files) {
      const stem = f.replace(/\.json$/, "");
      for (const p of fs.readdirSync(path.dirname(f))) {
        const full = path.join(path.dirname(f), p);
        if (full === f || full.startsWith(stem + ".")) fs.renameSync(full, path.join(doneDir, path.basename(full)));
      }
    }
    console.log(`moved to ${doneDir}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
