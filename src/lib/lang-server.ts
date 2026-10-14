import { cookies, headers } from "next/headers";
import { langFrom, type Lang } from "./strings";

/** 서버 컴포넌트의 언어 — 쿠키 `lang` → Accept-Language (layout·리포트가 같은 규칙) */
export async function serverLang(): Promise<Lang> {
  return langFrom((await cookies()).get("lang")?.value, (await headers()).get("accept-language"));
}
