/**
 * 서버·DB 없이 수집 JSON 을 바로 채점한다 — "리딩방이 잡히는지" 첫 확인용.
 *   npx tsx collector/score-local.ts                       # collector/inbox 전체
 *   npx tsx collector/score-local.ts collector/inbox/0920  # 특정 폴더 또는 파일
 *   npx tsx collector/score-local.ts ... --all             # LOW 까지 전부 출력
 * 출력: 점수 순 표 + 연락처 엔티티 + 같은 연락처를 쓰는 계정 묶음. 결과는 <폴더>/scored.json 에도 저장.
 */
import fs from "node:fs";
import path from "node:path";
import { scoreText, extractEntities, entityId, isStrongEntity } from "../src/engine";
import type { CollectedItem } from "./schema";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const showAll = process.argv.includes("--all");
const root = args[0] ?? path.join("collector", "inbox");

function walk(p: string): string[] {
  if (!fs.existsSync(p)) return [];
  if (fs.statSync(p).isFile()) return p.endsWith(".json") && !p.endsWith("scored.json") ? [p] : [];
  return fs.readdirSync(p, { withFileTypes: true }).flatMap((e) => walk(path.join(p, e.name)));
}

const items: CollectedItem[] = walk(root).flatMap((f) => {
  const raw = JSON.parse(fs.readFileSync(f, "utf8"));
  return Array.isArray(raw) ? raw : [raw];
});
if (!items.length) { console.log(`JSON 없음: ${root}\n→ collector/aside-task.md 의 프롬프트를 Aside 에 넣어 먼저 수집하세요.`); process.exit(0); }

// 계정 단위로 묶어 반복·살포 특성 계산
const byAccount = new Map<string, CollectedItem[]>();
for (const it of items) {
  const k = it.author.handle.replace(/^@/, "").toLowerCase();
  (byAccount.get(k) ?? byAccount.set(k, []).get(k)!).push(it);
}

type Row = { handle: string; score: number; label: string; posts: number; targets: number; reasons: string[]; entities: string[]; text: string };
const rows: Row[] = [];
const holders = new Map<string, Set<string>>(); // entityId → handles

for (const [handle, posts] of byAccount) {
  const targets = new Set(posts.map((p) => p.parentUrl).filter(Boolean)).size;
  let best: Row | null = null;
  const ents = new Set<string>();
  for (const p of posts) {
    const a = p.author;
    const r = scoreText(p.text, { bio: a.bio, externalUrl: a.externalUrl, followers: a.followers, following: a.following, createdAt: a.createdAt, clusterSize: posts.length, distinctTargets: targets });
    for (const e of extractEntities(p.text, { bio: a.bio, externalUrl: a.externalUrl })) {
      const id = entityId(e.type, e.value);
      ents.add(id);
      if (isStrongEntity(e.type)) (holders.get(id) ?? holders.set(id, new Set()).get(id)!).add(handle);
    }
    if (!best || r.score > best.score) best = { handle, score: r.score, label: r.label, posts: posts.length, targets, reasons: r.reasons.slice(0, 4).map((x) => `${x.points > 0 ? "+" : ""}${x.points} ${x.label}`), entities: [], text: p.text.replace(/\s+/g, " ").slice(0, 90) };
  }
  best!.entities = [...ents];
  rows.push(best!);
}
rows.sort((a, b) => b.score - a.score);

const pad = (s: string, n: number) => { const w = [...s].reduce((acc, ch) => acc + (/[가-힣]/.test(ch) ? 2 : 1), 0); return s + " ".repeat(Math.max(0, n - w)); };
console.log(`\n${items.length}건 / 계정 ${rows.length}개  (${root})\n`);
console.log(pad("점수", 6) + pad("판정", 8) + pad("계정", 24) + pad("글", 4) + pad("살포", 5) + "본문");
for (const r of rows) {
  if (!showAll && r.label === "LOW") continue;
  console.log(pad(String(r.score), 6) + pad(r.label, 8) + pad("@" + r.handle, 24) + pad(String(r.posts), 4) + pad(String(r.targets), 5) + r.text);
  console.log("      " + r.reasons.join(" · ") + (r.entities.length ? "\n      연락처: " + r.entities.join(", ") : ""));
}
const low = rows.filter((r) => r.label === "LOW").length;
console.log(`\nHIGH ${rows.filter((r) => r.label === "HIGH").length} · REVIEW ${rows.filter((r) => r.label === "REVIEW").length} · LOW ${low}${!showAll && low ? " (LOW 는 --all 로 표시)" : ""}`);

const shared = [...holders].filter(([, s]) => s.size > 1);
if (shared.length) {
  console.log("\n같은 연락처를 쓰는 계정 묶음:");
  for (const [id, s] of shared) console.log(`  ${id}  ←  ${[...s].map((h) => "@" + h).join(", ")}`);
}

const out = path.join(fs.statSync(root).isFile() ? path.dirname(root) : root, "scored.json");
fs.writeFileSync(out, JSON.stringify({ scoredAt: new Date().toISOString(), rows, shared: shared.map(([id, s]) => ({ entity: id, handles: [...s] })) }, null, 1));
console.log(`\n저장: ${out}`);
