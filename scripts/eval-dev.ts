/** Offline DEV check only. Missing source text is never reconstructed from a summary.
 * node --import tsx scripts/eval-dev.ts [jsonl] [--engine /path/to/score.ts]
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { scoreText as currentScore, type AccountFeatures } from "../src/engine/score";

type Row = { id: string; text: string | null; label: "lure" | "benign" | "scam"; author?: AccountFeatures; note?: string };
async function main() {
  const file = process.argv[2] ?? "eval/dev-redteam-v1.jsonl";
  if (!existsSync(file)) throw new Error(`Missing DEV input: ${file}`);
  const engineArg = process.argv.indexOf("--engine");
  const score: typeof currentScore = engineArg < 0 ? currentScore : (await import(pathToFileURL(resolve(process.argv[engineArg + 1])).href)).scoreText;
  const rows: Row[] = readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const missing = rows.filter(row => typeof row.text !== "string" || !row.text.trim());
  const results = rows.filter(row => typeof row.text === "string" && row.text.trim()).map(row => {
    const result = score(row.text!, { ...row.author, asOf: Date.parse("2026-09-20T12:00:00+09:00") });
    return { id: row.id, label: row.label, score: result.score, prediction: result.label };
  });
  const lures = results.filter(r => r.label !== "benign");
  const benign = results.filter(r => r.label === "benign");
  console.log(JSON.stringify({ input: file, engine: engineArg < 0 ? "working-tree" : process.argv[engineArg + 1], scored: results.length,
    missingText: missing.map(r => r.id),
    lure: { total: lures.length, missedLow: lures.filter(r => r.prediction === "LOW").length, notHigh: lures.filter(r => r.prediction !== "HIGH").length },
    benign: { total: benign.length, high: benign.filter(r => r.prediction === "HIGH").length }, results }, null, 2));
  if (missing.length) process.exitCode = 2;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
