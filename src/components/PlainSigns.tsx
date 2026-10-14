"use client";

import { useLang } from "@/lib/i18n";

/** 쉬운 말 징후 목록(두 줄) — 영어 화면에서 엔진 원문(한국어) 라벨 대신 쓴다 */
export function PlainSigns({ signs, note }: { signs: [string, string][]; note?: string }) {
  const t = useLang().t.result;
  // 찾은 징후가 없으면 "흔한 표현" 문장이 아니라 "뚜렷한 징후 없음"(카이 2a57d8a — 낮음·무징후에 일반 문장이 나가던 것)
  if (!signs.length) return <p className="text-sm text-zinc-500">{t.noSigns}</p>;
  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {signs.map(([fact, why]) => (
          <li key={fact} className="rounded-md bg-red-50 px-3 py-2 text-sm"><b className="block">{fact}</b><span className="text-zinc-600">{why}</span></li>
        ))}
      </ul>
      {note && <p className="text-xs text-zinc-500">{note}</p>}
    </div>
  );
}
