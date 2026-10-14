/**
 * English eval data prep — Mendeley "Multimodal Dataset for Investment-Related Deceptive Content
 * Detection on Social Platforms" v2 (Kong, 2026, CC BY 4.0, DOI 10.17632/6wnd7jrt6z.2).
 *
 *   npx tsx eval/en/prepare.ts
 *
 * Reads  eval/en/data/raw/mendeley_6wnd7jrt6z_v2.csv  (download command in eval/en/RESULTS.md)
 * Writes eval/en/data/dev.jsonl, eval/en/data/test.jsonl  (gitignored)
 *        eval/en/data/manifest.json                       (committed)
 *
 * Why not the dataset's own train/validation/test column: in the `fake_profile_post` source
 * 1,162 of 1,259 "test" texts appear verbatim in train/validation (the posts are slot-filled
 * templates). Tuning on dev would then be tuning on test. So we re-split by **near-duplicate group**:
 * texts are clustered (word-bigram Jaccard >= 0.5 after lowercasing and digit masking, union-find,
 * within each source) and every group goes wholly to dev or wholly to test, chosen by a hash of the
 * group key. No label or engine output is used to make the split.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fnv1a64 } from "../../src/engine/normalize";

const DIR = join(process.cwd(), "eval", "en", "data");
const RAW = join(DIR, "raw", "mendeley_6wnd7jrt6z_v2.csv");
const RAW_SHA256 = "a4b336074176efb5746d1981506c1f1faba19a1b0a20f3b9e95dc8be94ea2504";
/** % of groups that go to dev. Fixed before any engine run. */
const DEV_PCT = 40;
const JACCARD_GROUP = 0.5;

/** Sources whose label describes the *message text* (scam/phishing/spam vs not). */
export const IN_SCOPE = ["phishing", "spam_email", "fake_profile_post"];
/** Sources whose label describes the *account* (bot vs human) — reported separately, never headline. */
export const OUT_OF_SCOPE = ["twitter_bot_detection", "cresci_stock_2018"];

function parseCsv(s: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else q = false;
      } else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field); field = "";
      rows.push(row); row = [];
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1);
}

const keyOf = (t: string) => t.toLowerCase().replace(/\d+/g, "#").replace(/[^\p{L}\p{N}#]+/gu, " ").trim();
function shingles(key: string): Set<string> {
  const w = key.split(" ").filter(Boolean);
  if (w.length < 2) return new Set(w);
  const out = new Set<string>();
  for (let i = 0; i < w.length - 1; i++) out.add(w[i] + " " + w[i + 1]);
  return out;
}
function jac(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 1;
  const [s, l] = a.size < b.size ? [a, b] : [b, a];
  let inter = 0;
  for (const x of s) if (l.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export interface EvalRow {
  id: string;
  source: string;
  /** 1 = dataset says deceptive/suspicious, 0 = not */
  label: 0 | 1;
  text: string;
  group: string;
  origPartition: string;
  inScope: boolean;
}

function main() {
  const buf = readFileSync(RAW);
  const sha = createHash("sha256").update(buf).digest("hex");
  if (sha !== RAW_SHA256) throw new Error(`raw CSV sha256 mismatch: ${sha}`);
  const [header, ...body] = parseCsv(buf.toString("utf8").replace(/^﻿/, ""));
  const col = (name: string) => header.indexOf(name);
  const [cId, cSrc, cText, cLabel, cPart] = ["record_id", "source_dataset", "text_content", "label", "partition"].map(col);
  if ([cId, cSrc, cText, cLabel, cPart].some((c) => c < 0)) throw new Error("unexpected header " + header.join(","));

  const recs = body.map((r) => ({ id: r[cId], source: r[cSrc], text: r[cText], label: Number(r[cLabel]) as 0 | 1, part: r[cPart] }));
  if (recs.length !== 16202) throw new Error(`expected 16202 rows, got ${recs.length}`);

  // near-duplicate grouping per source over unique keys
  const groupOfKey = new Map<string, string>();
  for (const src of [...new Set(recs.map((r) => r.source))]) {
    const keys = [...new Set(recs.filter((r) => r.source === src).map((r) => keyOf(r.text)))].sort();
    const sh = keys.map(shingles);
    const parent = keys.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (let i = 0; i < keys.length; i++)
      for (let j = i + 1; j < keys.length; j++) {
        // size filter: Jaccard >= t requires min/max >= t
        const a = sh[i].size, b = sh[j].size;
        if (Math.min(a, b) < JACCARD_GROUP * Math.max(a, b)) continue;
        if (find(i) !== find(j) && jac(sh[i], sh[j]) >= JACCARD_GROUP) parent[find(j)] = find(i);
      }
    keys.forEach((k, i) => groupOfKey.set(src + "\u0000" + k, `${src}:${fnv1a64(keys[find(i)])}`));
  }

  const rows: (EvalRow & { split: "dev" | "test" })[] = recs.map((r) => {
    const group = groupOfKey.get(r.source + "\u0000" + keyOf(r.text))!;
    const bucket = parseInt(fnv1a64(group).slice(0, 8), 16) % 100;
    return {
      id: r.id, source: r.source, label: r.label, text: r.text, group, origPartition: r.part,
      inScope: IN_SCOPE.includes(r.source), split: bucket < DEV_PCT ? "dev" : "test",
    };
  });

  const write = (split: "dev" | "test") => {
    const out = rows.filter((r) => r.split === split).map(({ split: _s, ...r }) => JSON.stringify(r)).join("\n") + "\n";
    writeFileSync(join(DIR, `${split}.jsonl`), out);
    return createHash("sha256").update(out).digest("hex");
  };
  const devSha = write("dev");
  const testSha = write("test");

  const counts: Record<string, Record<string, { n: number; pos: number; neg: number; groups: number; uniqueTexts: number }>> = {};
  for (const split of ["dev", "test"] as const)
    for (const src of [...IN_SCOPE, ...OUT_OF_SCOPE]) {
      const xs = rows.filter((r) => r.split === split && r.source === src);
      (counts[split] ??= {})[src] = {
        n: xs.length, pos: xs.filter((r) => r.label === 1).length, neg: xs.filter((r) => r.label === 0).length,
        groups: new Set(xs.map((r) => r.group)).size, uniqueTexts: new Set(xs.map((r) => keyOf(r.text))).size,
      };
    }
  // leakage check: no group on both sides
  const devGroups = new Set(rows.filter((r) => r.split === "dev").map((r) => r.group));
  const shared = new Set(rows.filter((r) => r.split === "test" && devGroups.has(r.group)).map((r) => r.group)).size;
  const devKeys = new Set(rows.filter((r) => r.split === "dev").map((r) => r.source + keyOf(r.text)));
  const testKeyInDev = rows.filter((r) => r.split === "test" && devKeys.has(r.source + keyOf(r.text))).length;

  const manifest = {
    dataset: "Multimodal Dataset for Investment-Related Deceptive Content Detection on Social Platforms",
    version: 2,
    author: "Yi Xuan Kong (Multimedia University)",
    doi: "10.17632/6wnd7jrt6z.2",
    landingPage: "https://data.mendeley.com/datasets/6wnd7jrt6z/2",
    fileUrl: "https://data.mendeley.com/public-files/datasets/6wnd7jrt6z/files/71fde40c-a8bd-4217-9e77-1ea5de74675f/file_downloaded",
    licence: "CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)",
    downloaded: "2026-10-14",
    rawSha256: sha,
    rawRows: recs.length,
    labelDefinition:
      "Binary label from the dataset author: 1 = 'investment-related deceptive or suspicious behaviour derived from harmonised source annotations after filtering'; 0 = not. The author states labels 'should not be interpreted as verified ground-truth investment scam status for every individual record'. Contact details in text were replaced by the author with [PHONE]/[EMAIL]/[URL]/[HANDLE]/[ID] placeholders.",
    inScopeSources: IN_SCOPE,
    outOfScopeSources: OUT_OF_SCOPE,
    outOfScopeReason: "label marks the account as a bot, not the text as a scam; twitter_bot_detection text is random filler words",
    split: {
      method: `near-duplicate groups (word-bigram Jaccard >= ${JACCARD_GROUP} after lowercase+digit masking, per source, union-find); group -> dev if fnv1a64(groupKey) % 100 < ${DEV_PCT}, else test`,
      datasetPartitionIgnoredBecause: "fake_profile_post: 1162/1259 test texts occur verbatim in the dataset's train/validation",
      groupsOnBothSides: shared,
      testRowsWhoseTextAppearsInDev: testKeyInDev,
    },
    counts,
    outputs: { "dev.jsonl": devSha, "test.jsonl": testSha },
  };
  writeFileSync(join(DIR, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(JSON.stringify({ counts, groupsOnBothSides: shared, testRowsWhoseTextAppearsInDev: testKeyInDev }, null, 1));
}

main();
