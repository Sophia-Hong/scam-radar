import { readFile } from "node:fs/promises";
import path from "node:path";
import type { FssRegistrationResult } from "./types";

type FssList = readonly string[];
let testLists: { financialCompanies: FssList; similarInvestmentAdvisers: FssList } | undefined;

/** Removes common Korean legal-form spelling before a local exact comparison. */
export function normalizeFssName(name: string): string {
  return name.normalize("NFKC").toLowerCase().replace(/\(\s*주\s*\)|㈜|주식회사|\s+/g, "").trim();
}

function names(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => typeof item === "string" ? [item] : item && typeof item === "object" && "name" in item && typeof item.name === "string" ? [item.name] : []);
}

async function localLists() {
  if (testLists) return testLists;
  try {
    const root = process.cwd();
    const [companies, advisers] = await Promise.all([
      readFile(path.join(root, "data/fss/financial-companies.json"), "utf8"),
      readFile(path.join(root, "data/fss/similar-investment-advisers.json"), "utf8"),
    ]);
    return { financialCompanies: names(JSON.parse(companies)), similarInvestmentAdvisers: names(JSON.parse(advisers)) };
  } catch { return undefined; }
}

/** Local-only lookup. An unavailable list returns null, never an unlisted conclusion. */
export async function fssRegistered(name: string): Promise<FssRegistrationResult> {
  const normalizedName = normalizeFssName(name);
  const lists = await localLists();
  if (!lists) return { normalizedName, registered: null, source: "unavailable" };
  const registered = [...lists.financialCompanies, ...lists.similarInvestmentAdvisers].some((item) => normalizeFssName(item) === normalizedName);
  return { normalizedName, registered, source: "local-fss-list" };
}

/** Test seam and future official-import seam. */
export function setFssListsForTests(lists: { financialCompanies: FssList; similarInvestmentAdvisers: FssList } | undefined) { testLists = lists; }
