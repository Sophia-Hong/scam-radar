/**
 * 라벨 코퍼스로 판정 엔진의 정확도를 측정한다.
 *
 *   npx tsx scripts/eval.ts            # 전체
 *   npx tsx scripts/eval.ts --fp-only  # 오탐만
 *
 * 헤드라인 지표는 **HIGH precision** 이다. HIGH 는 신고서에 실리고 명예훼손 리스크가 있으므로
 * "HIGH 라고 부른 것 중 실제 scam 비율" 이 다른 무엇보다 먼저다. REVIEW 는 HIGH 가 아니다.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { scoreText, type AccountFeatures } from "../src/engine/score";

type Row = {
  id: string;
  text: string;
  label: "scam" | "benign";
  note: string;
  author?: AccountFeatures;
};

const CORPUS = join(process.cwd(), "eval", "corpus.jsonl");
const rows: Row[] = readFileSync(CORPUS, "utf8")
  .split("\n")
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l));

const fpOnly = process.argv.includes("--fp-only");

type Scored = Row & { score: number; predHigh: boolean; pred: string; reasons: string[] };
const scored: Scored[] = rows.map((r) => {
  const res = scoreText(r.text, r.author ?? {});
  return {
    ...r,
    score: res.score,
    predHigh: res.label === "HIGH",
    pred: res.label,
    reasons: res.reasons.slice(0, 5).map((x) => `${x.label}(${x.points})`),
  };
});

// ── HIGH vs scam ────────────────────────────────────────────
const tp = scored.filter((s) => s.predHigh && s.label === "scam");
const fp = scored.filter((s) => s.predHigh && s.label === "benign");
const fn = scored.filter((s) => !s.predHigh && s.label === "scam");
const tn = scored.filter((s) => !s.predHigh && s.label === "benign");

const precision = tp.length / Math.max(1, tp.length + fp.length);
const recall = tp.length / Math.max(1, tp.length + fn.length);
const f1 = (2 * precision * recall) / Math.max(1e-9, precision + recall);

const pct = (x: number) => (x * 100).toFixed(1) + "%";
const f3 = (x: number) => x.toFixed(3);

console.log("=".repeat(72));
console.log(`코퍼스: ${rows.length}건  (scam ${rows.filter((r) => r.label === "scam").length} / benign ${rows.filter((r) => r.label === "benign").length})`);
console.log("=".repeat(72));
console.log();
console.log("── 혼동 행렬 (HIGH = positive, REVIEW/LOW = negative) ──");
console.log("                 실제 scam   실제 benign");
console.log(`  예측 HIGH      ${String(tp.length).padStart(9)}   ${String(fp.length).padStart(11)}`);
console.log(`  예측 not-HIGH  ${String(fn.length).padStart(9)}   ${String(tn.length).padStart(11)}`);
console.log();
console.log(`  HIGH precision : ${f3(precision)}   ← 헤드라인 지표`);
console.log(`  scam recall    : ${f3(recall)}`);
console.log(`  F1             : ${f3(f1)}`);
console.log(`  accuracy       : ${f3((tp.length + tn.length) / rows.length)}`);
console.log();

// 라벨 분포
const dist = (label: "scam" | "benign") => {
  const g = scored.filter((s) => s.label === label);
  const c = (l: string) => g.filter((s) => s.pred === l).length;
  return `HIGH ${c("HIGH")} / REVIEW ${c("REVIEW")} / LOW ${c("LOW")}`;
};
console.log("── 라벨 분포 ──");
console.log(`  scam   : ${dist("scam")}`);
console.log(`  benign : ${dist("benign")}`);
console.log();

// REVIEW 로 넘어가는 양 (LLM 비용과 직결)
const review = scored.filter((s) => s.pred === "REVIEW");
console.log(`  REVIEW 구간(LLM 재판정 대상): ${review.length}건 (${pct(review.length / rows.length)})`);
console.log();

const show = (title: string, list: Scored[]) => {
  console.log("─".repeat(72));
  console.log(`${title} — ${list.length}건`);
  console.log("─".repeat(72));
  for (const s of [...list].sort((a, b) => b.score - a.score)) {
    console.log(`  [${s.id}] score=${s.score} pred=${s.pred}  (${s.note})`);
    console.log(`     text: ${s.text.replace(/\s+/g, " ").slice(0, 90)}`);
    if (s.author?.bio) console.log(`     bio : ${s.author.bio.slice(0, 70)}`);
    console.log(`     why : ${s.reasons.join(", ")}`);
  }
  if (list.length === 0) console.log("  (없음)");
  console.log();
};

show("FALSE POSITIVE (benign → HIGH). 명예훼손 리스크, 0 에 가까워야 한다", fp);
if (!fpOnly) show("FALSE NEGATIVE (scam → not HIGH)", fn);

console.log("=".repeat(72));
console.log(`HIGH precision ${f3(precision)} | scam recall ${f3(recall)} | F1 ${f3(f1)}`);
console.log(`목표: HIGH precision ≥ 0.97, scam recall ≥ 0.75 → ${precision >= 0.97 && recall >= 0.75 ? "PASS" : "FAIL"}`);
console.log("=".repeat(72));

if (process.argv.includes("--strict") && !(precision >= 0.97 && recall >= 0.75)) process.exit(1);
