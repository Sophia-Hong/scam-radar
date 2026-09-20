#!/bin/zsh
# 30분 주기 수집 → 채점 → 서버 등록.  launchd: collector/com.scamradar.collect.plist
# 전제: 이 머신에 Aside 브라우저가 Threads 수집용 계정으로 로그인돼 있고, .env 에 API_BASE·INGEST_TOKEN 이 있다.
set -u
cd "$(dirname "$0")/.." || exit 1
export PATH="/opt/homebrew/bin:$HOME/.local/bin:/usr/local/bin:$PATH"
BATCH="collector/inbox/$(date +%Y%m%d-%H%M)"
mkdir -p "$BATCH" logs
RAW="$BATCH/raw.jsonl"; : > "$RAW"
LOG="logs/collect.log"
echo "[$(date '+%F %T')] start $BATCH" >> "$LOG"

while IFS= read -r kw; do
  [[ -z "$kw" || "$kw" == \#* ]] && continue
  for mode in recent default; do
    sed -e "s|__KW__|$kw|" -e "s|__MODE__|$mode|" collector/aside-collect.js > "$BATCH/.cur.js"
    aside repl "$(cat "$BATCH/.cur.js")" 2>>"$LOG" | grep -E '^(ITEM|DONE)' | sed 's/^ITEM //' >> "$RAW"
  done
done < collector/keywords.txt
rm -f "$BATCH/.cur.js"

# raw.jsonl → 스키마 JSON 배열 (본문 8자 미만·중복 URL 제외)
node -e '
const fs=require("fs");const raw=fs.readFileSync(process.argv[1],"utf8").split("\n").filter(l=>l.startsWith("{")).map(l=>JSON.parse(l));
const by=new Map();for(const it of raw){if(!by.has(it.postUrl)&&it.text&&it.text.trim().length>=8)by.set(it.postUrl,it);}
const out=[...by.values()].map(it=>({platform:"threads",postUrl:it.postUrl,parentUrl:null,kind:"post",text:it.text,postedAt:it.postedAt||null,
 author:{handle:it.handle,displayName:null,profileUrl:"https://www.threads.net/@"+it.handle,bio:null,externalUrl:(it.links||[null])[0]||null,followers:null,following:null,postCount:null}}));
fs.writeFileSync(process.argv[2],JSON.stringify(out,null,1));console.log("items",out.length);
' "$RAW" "$BATCH/batch.json" >> "$LOG" 2>&1

npx tsx collector/score-local.ts "$BATCH/batch.json" >> "$LOG" 2>&1
npx tsx collector/push.ts "$BATCH/batch.json" >> "$LOG" 2>&1
echo "[$(date '+%F %T')] done $BATCH" >> "$LOG"
