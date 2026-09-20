import { accountIdOf } from "@/lib/ids";

/** 입력을 accountId 로 정규화: "threads:foo" | "@foo" | "foo" | "https://www.threads.net/@foo/post/…" */
export function resolveAccountId(input: string): { id: string | null; handle: string } {
  const s = decodeURIComponent(input).trim();
  const url = s.match(/https?:\/\/(?:www\.)?(threads\.(?:net|com)|instagram\.com|x\.com|twitter\.com)\/@?([A-Za-z0-9_.]+)/);
  if (url) {
    const platform = url[1].startsWith("threads") ? "threads" : url[1].startsWith("instagram") ? "instagram" : "x";
    return { id: accountIdOf(platform, url[2]), handle: url[2].toLowerCase() };
  }
  if (s.includes(":")) return { id: s.toLowerCase(), handle: s.split(":")[1].replace(/^@/, "").toLowerCase() };
  return { id: null, handle: s.replace(/^@/, "").toLowerCase() };
}

