#!/bin/zsh
# 30분 주기 수집 → 채점 → 서버 등록.  launchd: collector/com.scamradar.collect.plist
# 전제: 이 머신에 Aside 브라우저가 Threads 수집용 계정으로 로그인돼 있고, .env 에 API_BASE·INGEST_TOKEN 이 있다.
set -u
cd "$(dirname "$0")/.." || exit 1

# ── 폴라잇 크롤 가드 (2026-10-14, 소현 "폴라잇 크롤 강제해 내 계정이 날아갈 거 같아") ──
# 1) 소현 O 없이는 안 돈다: ~/.config/scam-radar/collect-approved-until 에 미래 epoch 가 있어야 함.
# 2) 하루 최대 4회, 실행 간 최소 2시간.  3) 직전 실행에서 429/차단 흔적이 있으면 다음날 09시(KST)까지 정지.
GUARD_DIR="$HOME/.config/scam-radar"; mkdir -p "$GUARD_DIR"
APPROVED_UNTIL=$(cat "$GUARD_DIR/collect-approved-until" 2>/dev/null || echo 0)
NOW=$(date +%s)
if (( NOW >= APPROVED_UNTIL )); then echo "[$(date '+%F %T')] guard: 소현 O 없음 — 수집 안 함" >> logs/collect.log; exit 0; fi
STOP_UNTIL=$(cat "$GUARD_DIR/collect-blocked-until" 2>/dev/null || echo 0)
if (( NOW < STOP_UNTIL )); then echo "[$(date '+%F %T')] guard: 차단 감지 후 정지 중" >> logs/collect.log; exit 0; fi
TODAY=$(TZ=Asia/Seoul date +%F); RUNS="$GUARD_DIR/collect-runs-$TODAY"
COUNT=$(wc -l < "$RUNS" 2>/dev/null | tr -d ' ' || echo 0); [[ -z "$COUNT" ]] && COUNT=0
LAST=$(tail -1 "$RUNS" 2>/dev/null || echo 0); [[ -z "$LAST" ]] && LAST=0
if (( COUNT >= 4 )) || (( NOW - LAST < 7200 )); then echo "[$(date '+%F %T')] guard: 하루 4회/2시간 간격 초과" >> logs/collect.log; exit 0; fi
echo "$NOW" >> "$RUNS"
export PATH="/opt/homebrew/bin:$HOME/.local/bin:/usr/local/bin:$PATH"
BATCH="collector/inbox/$(date +%Y%m%d-%H%M)"
mkdir -p "$BATCH" logs
RAW="$BATCH/raw.jsonl"; : > "$RAW"
LOG="logs/collect.log"
LOG_START=$(wc -l < "$LOG" | tr -d ' ')
echo "[$(date '+%F %T')] start $BATCH" >> "$LOG"

while IFS= read -r kw; do
  [[ -z "$kw" || "$kw" == \#* ]] && continue
  for mode in recent default; do
    sed -e "s|__KW__|$kw|" -e "s|__MODE__|$mode|" collector/aside-collect.js > "$BATCH/.cur.js"
    aside repl "$(cat "$BATCH/.cur.js")" 2>>"$LOG" | grep -E '^(ITEM|DONE)' | sed 's/^ITEM //' >> "$RAW"
  done
done < collector/keywords.txt
rm -f "$BATCH/.cur.js"
if tail -n +$((LOG_START+1)) "$LOG" | grep -qiE '\b429\b|too many requests|rate limit|try again later|challenge'; then
  TZ=Asia/Seoul date -v+1d -v9H -v0M -v0S +%s > "$GUARD_DIR/collect-blocked-until"
  echo "[$(date '+%F %T')] guard: 차단 신호 — 다음날 09시까지 정지" >> "$LOG"; exit 2
fi

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
