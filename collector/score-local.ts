/**
 * 서버·DB 없이 수집 JSON 을 바로 채점한다 — "리딩방이 잡히는지" 첫 확인용.
 *   npx tsx collector/score-local.ts                       # collector/inbox 전체
 *   npx tsx collector/score-local.ts collector/inbox/0920  # 특정 폴더 또는 파일
 *   npx tsx collector/score-local.ts ... --all             # LOW 까지 전부 출력
 * 출력: 점수 순 표 + 연락처 엔티티 + 같은 연락처를 쓰는 계정 묶음 + 같은 문구를 쓰는 계정 묶음.
 * 결과는 <폴더>/scored.json 에도 저장.
 *
 * 문구 묶음은 계정 경계를 넘어 전체 항목을 MinHash/LSH 로 묶고(실제 Jaccard ≥ 0.75 재검증),
 * 각 글에 "같은 묶음에 있는 서로 다른 계정 수"(clusterAccounts) 와 "같은 계정의 반복 수"(clusterSize) 를 넘긴다.
 */
import fs from "node:fs";
import path from "node:path";
import { scoreText, extractEntities, entityId, isStrongEntity, normalize, LshIndex, JACCARD_THRESHOLD } from "../src/engine";
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

// ── 계정 경계를 넘는 근사 중복 묶음 (union-find) ──
const handleOf = (it: CollectedItem) => it.author.handle.replace(/^@/, "").toLowerCase();
const idx = new LshIndex<{ id: string; text: string }>();
const parent = new Map<string, string>();
const find = (x: string): string => { const p = parent.get(x) ?? x; if (p === x) return x; const r = find(p); parent.set(x, r); return r; };
const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
items.forEach((it, i) => {
  const id = String(i);
  const text = normalize(it.text).text;
  parent.set(id, id);
  for (const { item } of idx.query(text, JACCARD_THRESHOLD)) union(id, item.id);
  idx.add({ id, text });
});
const clusterOf = new Map<string, string[]>(); // root → item ids
items.forEach((_, i) => { const r = find(String(i)); (clusterOf.get(r) ?? clusterOf.set(r, []).get(r)!).push(String(i)); });
/** item index → { accounts: 서로 다른 계정 수, mine: 같은 계정의 글 수, root } */
const clusterInfo = (i: number) => {
  const members = clusterOf.get(find(String(i))) ?? [String(i)];
  const h = handleOf(items[i]);
  const accounts = new Set(members.map((m) => handleOf(items[Number(m)]))).size;
  const mine = members.filter((m) => handleOf(items[Number(m)]) === h).length;
  return { accounts, mine, root: find(String(i)) };
};

type Row = { handle: string; score: number; label: string; posts: number; targets: number; clusterAccounts: number; reasons: string[]; entities: string[]; text: string };
const rows: Row[] = [];
const holders = new Map<string, Set<string>>(); // entityId → handles

for (const [handle, posts] of byAccount) {
  const targets = new Set(posts.map((p) => p.parentUrl).filter(Boolean)).size;
  let best: Row | null = null;
  const ents = new Set<string>();
  for (const p of posts) {
    const a = p.author;
    const ci = clusterInfo(items.indexOf(p));
    const r = scoreText(p.text, { bio: a.bio, externalUrl: a.externalUrl, followers: a.followers, following: a.following, createdAt: a.createdAt, clusterSize: ci.mine, clusterAccounts: ci.accounts, distinctTargets: targets });
    for (const e of extractEntities(p.text, { bio: a.bio, externalUrl: a.externalUrl })) {
      const id = entityId(e.type, e.value);
      ents.add(id);
      if (isStrongEntity(e.type)) (holders.get(id) ?? holders.set(id, new Set()).get(id)!).add(handle);
    }
    if (!best || r.score > best.score) best = { handle, score: r.score, label: r.label, posts: posts.length, targets, clusterAccounts: ci.accounts, reasons: r.reasons.slice(0, 4).map((x) => `${x.points > 0 ? "+" : ""}${x.points} ${x.label}`), entities: [], text: p.text.replace(/\s+/g, " ").slice(0, 90) };
  }
  best!.entities = [...ents];
  rows.push(best!);
}
rows.sort((a, b) => b.score - a.score);

const pad = (s: string, n: number) => { const w = [...s].reduce((acc, ch) => acc + (/[가-힣]/.test(ch) ? 2 : 1), 0); return s + " ".repeat(Math.max(0, n - w)); };
console.log(`\n${items.length}건 / 계정 ${rows.length}개  (${root})\n`);
console.log(pad("점수", 6) + pad("판정", 8) + pad("계정", 24) + pad("글", 4) + pad("살포", 5) + pad("묶음", 5) + "본문");
for (const r of rows) {
  if (!showAll && r.label === "LOW") continue;
  console.log(pad(String(r.score), 6) + pad(r.label, 8) + pad("@" + r.handle, 24) + pad(String(r.posts), 4) + pad(String(r.targets), 5) + pad(String(r.clusterAccounts), 5) + r.text);
  console.log("      " + r.reasons.join(" · ") + (r.entities.length ? "\n      연락처: " + r.entities.join(", ") : ""));
}
const low = rows.filter((r) => r.label === "LOW").length;
console.log(`\nHIGH ${rows.filter((r) => r.label === "HIGH").length} · REVIEW ${rows.filter((r) => r.label === "REVIEW").length} · LOW ${low}${!showAll && low ? " (LOW 는 --all 로 표시)" : ""}`);

const shared = [...holders].filter(([, s]) => s.size > 1);
if (shared.length) {
  console.log("\n같은 연락처를 쓰는 계정 묶음:");
  for (const [id, s] of shared) console.log(`  ${id}  ←  ${[...s].map((h) => "@" + h).join(", ")}`);
}

// 같은 문구를 쓰는 계정 묶음 — 서로 다른 계정이 2개 이상인 클러스터만
const textClusters = [...clusterOf.values()]
  .map((members) => {
    const handles = [...new Set(members.map((m) => handleOf(items[Number(m)])))];
    return { handles, posts: members.length, sample: items[Number(members[0])].text.replace(/\s+/g, " ").slice(0, 100) };
  })
  .filter((c) => c.handles.length >= 2)
  .sort((a, b) => b.handles.length - a.handles.length);
if (textClusters.length) {
  console.log("\n같은 문구를 쓰는 계정 묶음 (Jaccard ≥ 0.75):");
  for (const c of textClusters) {
    console.log(`  계정 ${c.handles.length}개 · 글 ${c.posts}건  ←  ${c.handles.map((h) => "@" + h).join(", ")}`);
    console.log(`      "${c.sample}"`);
  }
}

const out = path.join(fs.statSync(root).isFile() ? path.dirname(root) : root, "scored.json");
fs.writeFileSync(out, JSON.stringify({
  scoredAt: new Date().toISOString(), rows,
  shared: shared.map(([id, s]) => ({ entity: id, handles: [...s] })),
  textClusters,
}, null, 1));
console.log(`\n저장: ${out}`);
