# Investigation layer

This module performs optional, non-scoring checks on already extracted information. It reports observations and general caution only; it never concludes that a person, company, or site is a scam.

## Checks

- `domainAge(url)` derives a registrable domain (`example.co.kr`, `example.or.kr`, or `example.com`) and asks RDAP for its registration event. It never requests the investigated website. It tries [rdap.org](https://rdap.org/) first and, when that fails for `.kr`, [KISA RDAP](https://rdap.nic.or.kr/) second. Social-media hosts (Threads, X/Twitter, Instagram, Facebook, TikTok) are blocked outright.
- `fssRegistered(name)` normalizes spaces, `(주)`/`㈜`, and `주식회사`, then compares a name only against local JSON snapshots in `data/fss/`. A missing local snapshot yields `registered: null`, not an unlisted result.
- `bizStatus(bizNo)` uses the official [NTS business-registration status API](https://www.data.go.kr/data/15081808/openapi.do) when `NTS_API_KEY` is configured. Its status API is provided through the Korean Public Data Portal; use is subject to that portal’s [terms](https://www.data.go.kr/ugs/ntc/selectDataTermsView.do). Missing keys, timeouts, and source failures return a non-blocking result.
- `investigate(input)` combines the observations into signals. `investigateIfEnabled(input)` is the pipeline-ready opt-in entry point and returns `[]` unless `INVESTIGATE=1`. Neither function changes engine scores or weights.

## Network and cache rules

All public-data requests have a four-second timeout, are limited to one request per host per two seconds, and use `ScamRadarBot/0.1 (+contact: sophia.hong@legalfriend.ai)`. RDAP values are cached for seven days and NTS values for one day. An in-memory LRU cache is always used. If the optional `investigate_cache` database table has been applied, it is used as a best-effort shared TTL cache; a missing table safely falls back to memory.

## FSS research outcome

Research found the official [FINE “regulated financial company” lookup](https://fine.fss.or.kr/) and official FSS information about similar-investment advisers, but no no-login official downloadable file or official API for the two requested registries. Accordingly, this branch intentionally does **not** scrape FINE search pages and does **not** include `scripts/update-fss-lists.ts`: a downloader would need a stable, official downloadable URL and terms to honor. When such a source is confirmed, provision `data/fss/financial-companies.json` and `data/fss/similar-investment-advisers.json` as arrays of names (or `{ "name": "..." }` rows), then add the one-request updater with that source’s robots/terms constraints.

## Enable

Set `INVESTIGATE=1` to enable the exported wrapper. Set `NTS_API_KEY` only in the deployment environment after obtaining it from the Public Data Portal; no key is stored in code. The current text-analysis route is deliberately not wired, so its existing public scoring and behavior remain unchanged. A future pipeline caller should pass:

```ts
await investigateIfEnabled({
  urls: ["https://example.co.kr"],
  claimedFinancialNames: ["예시투자자문"],
  businessNumbers: ["123-45-67890"],
});
```

## Changed files

- `src/investigate/types.ts`
- `src/investigate/runtime.ts`
- `src/investigate/domain-age.ts`
- `src/investigate/fss.ts`
- `src/investigate/biz-status.ts`
- `src/investigate/index.ts`
- `src/investigate/investigate.test.ts`
- `src/investigate/README.md`
- `src/db/schema.ts` (optional shared cache table only)
