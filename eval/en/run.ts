/**
 * English eval — runs scoreText() on the prepared split and prints exact metrics.
 *
 *   npx tsx eval/en/run.ts --split dev                 # tuning set (look at errors here only)
 *   npx tsx eval/en/run.ts --split test                # held-out, report only
 *   npx tsx eval/en/run.ts --split test --variant restored   # sensitivity: placeholders -> neutral stand-ins
 *   npx tsx eval/en/run.ts --split dev --errors 20     # print FP/FN examples
 *
 * Positive = engine label HIGH (same definition as the Korean eval, scripts/eval.ts).
 * Secondary = HIGH or REVIEW ("flagged at all").
 * Text only: dataset metadata (followers etc.) is NOT passed to the engine.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { scoreText } from "../../src/engine/score";

type Row = { id: string; source: string; label: 0 | 1; text: string; group: string; inScope: boolean };

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const split = arg("split", "dev");
const variant = arg("variant", "raw");
const errors = Number(arg("errors", "0"));
if (!["dev", "test"].includes(split)) throw new Error("--split dev|test");

/** Neutral stand-ins for the author's anonymisation placeholders (sensitivity analysis only). */
const RESTORE: [RegExp, string][] = [
  [/\[PHONE\]/g, "+1 202 555 0143"],
  [/\[EMAIL\]/g, "contact@example.com"],
  [/\[URL\]/g, "https://example.com/page"],
  [/\[HANDLE\]/g, "@user_handle"],
  [/\[ID\]/g, "1234567"],
];
const prep = (t: string) => (variant === "restored" ? RESTORE.reduce((s, [re, r]) => s.replace(re, r), t) : t);
const keyOf = (t: string) => t.toLowerCase().replace(/\d+/g, "#").replace(/[^\p{L}\p{N}#]+/gu, " ").trim();

const rows: Row[] = readFileSync(join(process.cwd(), "eval", "en", "data", `${split}.jsonl`), "utf8")
  .split("\n").filter(Boolean).map((l) => JSON.parse(l));

const scored = rows.map((r) => {
  const res = scoreText(prep(r.text));
  return { ...r, score: res.score, pred: res.label, reasons: res.reasons.filter((x) => x.points > 0).slice(0, 5).map((x) => `${x.code}(${x.points})`) };
});
type S = (typeof scored)[number];

function metrics(xs: S[], pos: (s: S) => boolean) {
  const tp = xs.filter((s) => pos(s) && s.label === 1).length;
  const fp = xs.filter((s) => pos(s) && s.label === 0).length;
  const fn = xs.filter((s) => !pos(s) && s.label === 1).length;
  const tn = xs.filter((s) => !pos(s) && s.label === 0).length;
  const precision = tp + fp ? tp / (tp + fp) : NaN;
  const recall = tp + fn ? tp / (tp + fn) : NaN;
  const f1 = tp ? (2 * tp) / (2 * tp + fp + fn) : 0;
  return { n: xs.length, tp, fp, fn, tn, precision, recall, f1 };
}
const dedupe = (xs: S[]) => {
  const seen = new Set<string>();
  return xs.filter((s) => { const k = s.source + "\u0000" + keyOf(s.text); if (seen.has(k)) return false; seen.add(k); return true; });
};
const isHigh = (s: S) => s.pred === "HIGH";
const isFlag = (s: S) => s.pred !== "LOW";

const f = (x: number) => (Number.isNaN(x) ? "  n/a " : x.toFixed(4));
const line = (name: string, m: ReturnType<typeof metrics>) =>
  `${name.padEnd(34)} n=${String(m.n).padStart(5)}  TP=${String(m.tp).padStart(5)} FP=${String(m.fp).padStart(4)} FN=${String(m.fn).padStart(5)} TN=${String(m.tn).padStart(4)}  P=${f(m.precision)} R=${f(m.recall)} F1=${f(m.f1)}`;

const inScope = scored.filter((s) => s.inScope);
const sources = [...new Set(scored.map((s) => s.source))];
const report: Record<string, unknown> = { split, variant };

for (const [posName, pos] of [["HIGH", isHigh], ["HIGH+REVIEW", isFlag]] as const) {
  console.log(`\n== split=${split} variant=${variant} positive=${posName} ==`);
  const blocks: [string, S[]][] = [
    ["IN-SCOPE (records)", inScope],
    ["IN-SCOPE (unique texts)", dedupe(inScope)],
    ...sources.map((src) => [`  ${src} (records)`, scored.filter((s) => s.source === src)] as [string, S[]]),
    ...sources.map((src) => [`  ${src} (unique texts)`, dedupe(scored.filter((s) => s.source === src))] as [string, S[]]),
    ["ALL 5 SOURCES incl. bot-label (records)", scored],
  ];
  const out: Record<string, unknown> = {};
  for (const [name, xs] of blocks) {
    const m = metrics(xs, pos);
    out[name.trim()] = m;
    console.log(line(name, m));
  }
  report[posName] = out;
}

const dist = (xs: S[], lab: 0 | 1) => {
  const d = { HIGH: 0, REVIEW: 0, LOW: 0 };
  for (const s of xs) if (s.label === lab) d[s.pred]++;
  return d;
};
console.log(`\nlabel distribution (in-scope records): label=1 ${JSON.stringify(dist(inScope, 1))}  label=0 ${JSON.stringify(dist(inScope, 0))}`);
report.labelDistribution = { label1: dist(inScope, 1), label0: dist(inScope, 0) };

if (errors > 0) {
  const short = (t: string) => t.replace(/\s+/g, " ").slice(0, 220);
  const pick = (xs: S[]) => dedupe(xs).sort((a, b) => a.id.localeCompare(b.id)).slice(0, errors);
  console.log(`\n-- false positives (HIGH, label 0), in-scope, first ${errors} unique by id --`);
  for (const s of pick(inScope.filter((s) => isHigh(s) && s.label === 0))) console.log(`[${s.source} ${s.id} ${s.score}] ${short(s.text)}\n    ${s.reasons.join(" ")}`);
  console.log(`\n-- false negatives (not HIGH, label 1), in-scope, first ${errors} unique by id --`);
  for (const s of pick(inScope.filter((s) => !isHigh(s) && s.label === 1))) console.log(`[${s.source} ${s.id} ${s.score} ${s.pred}] ${short(s.text)}\n    ${s.reasons.join(" ")}`);
}

mkdirSync(join(process.cwd(), "eval", "en", "out"), { recursive: true });
writeFileSync(join(process.cwd(), "eval", "en", "out", `${split}-${variant}.json`), JSON.stringify(report, null, 2));
