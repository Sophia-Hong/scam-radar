# English engine: held-out evaluation

Measured 2026-10-14 on branch `theo/en-engine`. The engine is deterministic: lexicon, regex and scoring only, with no network calls and no model. It was frozen before the single test-split run, and nothing was changed after seeing test results.

## Headline (held-out test split, in-scope sources, positive = engine label `HIGH`)

| unit | n | TP | FP | FN | TN | precision | recall | F1 |
|---|---|---|---|---|---|---|---|---|
| **records** | **5,955** | 1,134 | 0 | 3,353 | 1,468 | **1.0000** (1134/1134; 95% Wilson 0.9966–1.0000) | **0.2527** (1134/4487; 0.2402–0.2657) | **0.4035** |
| unique texts* | 1,289 | 21 | 0 | 625 | 643 | 1.0000 (21/21; 0.8454–1.0000) | 0.0325 (21/646; 0.0214–0.0492) | 0.0630 |

\*Unique texts: one row per distinct text after lowercasing, punctuation collapse and digit masking. This matters because one source is slot-filled templates (see below). The unique-text row is the more honest view of how far the engine generalises.

**Plain reading:**
- When the English engine says HIGH on this data, it was right every time: 0 false positives at HIGH out of 1,468 negatives.
- It catches about a quarter of the labelled-deceptive records and about 3% of distinct deceptive texts.
- Recall is low because most positives in this dataset are not the kind of post the engine is built to flag (see per-source results), and because the test templates were genuinely unseen.

### Per source (test, records, positive = HIGH)

| source | n | label=1 / label=0 | TP | FP | FN | TN | precision | recall | F1 |
|---|---|---|---|---|---|---|---|---|---|
| fake_profile_post | 4,675 | 3,869 / 806 | 1,131 | 0 | 2,738 | 806 | 1.0000 | 0.2923 | 0.4524 |
| spam_email | 599 | 169 / 430 | 3 | 0 | 166 | 430 | 1.0000 | 0.0178 | 0.0349 |
| phishing | 681 | 449 / 232 | 0 | 0 | 449 | 232 | n/a (0 predicted) | 0.0000 | 0.0000 |

By unique texts, fake_profile_post has 128 texts (115 positive / 13 negative): TP 18, FP 0, FN 97, so recall is 0.1565.

### Secondary views (test, in-scope records)

| view | n | TP | FP | FN | TN | precision | recall | F1 |
|---|---|---|---|---|---|---|---|---|
| positive = HIGH **or REVIEW** | 5,955 | 1,167 | 12 | 3,320 | 1,456 | 0.9898 | 0.2601 | 0.4119 |
| placeholders restored†, positive = HIGH | 5,955 | 1,144 | 4 | 3,343 | 1,464 | 0.9965 | 0.2550 | 0.4060 |
| placeholders restored†, HIGH or REVIEW | 5,955 | 1,188 | 145 | 3,299 | 1,323 | 0.8912 | 0.2648 | 0.4082 |
| all 5 sources incl. bot-labelled (raw, HIGH) | 8,040 | 1,134 | 0 | 4,464 | 2,442 | 1.0000 | 0.2026 | 0.3369 |

†The dataset author replaced contact details with `[PHONE]`, `[EMAIL]`, `[URL]`, `[HANDLE]` and `[ID]`. That removes the engine's strongest signal family: "go to this number or chat". The *restored* variant swaps in neutral stand-ins (`+1 202 555 0143`, `contact@example.com`, `https://example.com/page`, `@user_handle`, `1234567`) as a sensitivity check. It is not the headline, because the stand-ins put a phone number into every business email that originally had one. Its 4 HIGH false positives are exactly that case (see below).

Label distribution on the test set (raw, in-scope records):
- label=1: HIGH 1,134 / REVIEW 33 / LOW 3,320
- label=0: HIGH 0 / REVIEW 12 / LOW 1,456

### Dev split (used for tuning; not a result)

In-scope records: n=6,819, TP 5,162, FP 0, FN 385, TN 1,272. Precision 1.0000, recall 0.9306, F1 0.9640.

The gap between dev recall (0.93) and test recall (0.25) is the main finding. Dev and test contain disjoint template groups, and lexicon rules tuned on one set of scam templates did not carry over to unseen ones. Precision did carry over.

## Dataset

- **Name:** *Multimodal Dataset for Investment-Related Deceptive Content Detection on Social Platforms*, v2
- **Author:** Yi Xuan Kong (Multimedia University), Mendeley Data, published 2026-05-13. DOI [10.17632/6wnd7jrt6z.2](https://doi.org/10.17632/6wnd7jrt6z.2)
- **URL:** https://data.mendeley.com/datasets/6wnd7jrt6z/2 (one CSV, 9,445,762 bytes, sha256 `a4b33607…ea2504`)
- **Licence:** CC BY 4.0. Research use and redistribution are allowed with attribution. Changes made here: re-split and source filtering, done by `eval/en/prepare.ts`. Raw and derived files are gitignored, and only `eval/en/data/manifest.json` is committed.
- **Size:** 16,202 English records in 5 sources. In scope here: 12,774 records (phishing 1,057, spam_email 1,110, fake_profile_post 10,607).
- **Why this one:**
  - It is the only public, licence-clear, labelled English set I found that is explicitly filtered for *investment-related* deceptive content.
  - No public labelled set of real "free stock tips → Telegram/WhatsApp" social posts was found.
  - It is the closest credible substitute, not a match for the product's target distribution.

**Label definition (from the author):**
- `label = 1` means "investment-related deceptive or suspicious behaviour derived from harmonised source annotations after filtering".
- `label = 0` means not.
- The author warns that labels "should not be interpreted as verified ground-truth investment scam status for every individual record".
- In practice, label=1 means a phishing email, a spam email, or a fake-profile post, each from its source dataset. The positives therefore include credential phishing ("verify your eBay account"), generic spam (SEO, OEM software) and stock-pump spam, as well as investment-lure posts.

**Source scope (decided from label semantics, before any engine run):**

| source | what label=1 means | used for headline? |
|---|---|---|
| fake_profile_post | post from a fake/scam profile. Short social-media posts that look synthetic and template-generated ("DM me", "link in bio", "$10K daily") | yes |
| phishing | phishing email (mostly bank/eBay credential phishing; a few HYIP investment scams) vs non-phishing mail | yes |
| spam_email | Enron-corpus spam vs ham (ham is mostly Enron finance/energy business mail, which makes useful hard negatives) | yes |
| twitter_bot_detection | **account is a bot**. Text is random filler words ("Treat the central paper fund serious.") | no: the label is not about the text |
| cresci_stock_2018 | **account is a bot** (cashtag-spam bot study). Text is profile bios | no: the label is not about the text |

The out-of-scope sources are still reported in the "all 5 sources" row. The engine predicts 0 HIGH on them, so they only lower recall.

## How the split was made

The dataset ships its own `train/validation/test` column. **It was not used**, because in `fake_profile_post` 1,162 of the 1,259 published-test texts appear verbatim in its train/validation. These posts are slot-filled templates: 10,607 records collapse to 515 distinct digit-masked texts. Tuning on its dev split would have been tuning on its test split.

Instead, `eval/en/prepare.ts` does the following:
1. Within each source, it clusters texts into near-duplicate groups (word-bigram Jaccard ≥ 0.5 after lowercasing and digit masking, union-find).
2. It sends each whole group to dev or test by a fixed hash of the group key: `fnv1a64(groupKey) % 100 < 40` goes to dev, everything else to test.

Labels and engine output play no part in the split. Checks recorded in `manifest.json`:
- 0 groups on both sides.
- 0 test rows whose normalised text appears in dev.
- fake_profile_post ends up as 14 template groups in dev and 11 in test, so test fake-profile templates are unseen.

**Disclosure:** before the split existed, I looked at 4 random texts per source × label from the full file (40 texts, some of them test) to understand what the sources contain. All tuning after that used `--split dev` only. The test split was run once, after the engine and unit tests were final.

## Qualitative errors (test)

**False positives.** There are none at HIGH in the headline run. Three REVIEW-level false positives (the "HIGH or REVIEW" view):
1. Snapchat board-consent email ("Series E Stock Purchase Agreement…"): the name *Snapchat* fires the other-messenger signal, alongside stock vocabulary.
2. Energy-conference marketing email ("only 1 week left to register… don't miss your chance… $875"): urgency, price, "call us at" and investment words, but it is a legitimate event.
3. Enron "MBA career opportunity" email: contains "contact me at" and finance vocabulary.

Restored-placeholder variant, HIGH false positives (4/4 are Enron finance mail). For example, "using a **risk-free rate** is not appropriate…" plus a restored phone number. The finance term *risk-free rate* reads as a "no risk" promise.

**False negatives (not HIGH, label 1):**
1. "This investment opportunity is changing lives! Turn $100 into $50000 in a week! securelogin.info/auth". The lure goes to a bare look-alike domain, not a messenger or contact, so there is no off-platform signal. This template group is test-only.
2. "My Bitcoin investment just paid off BIG TIME! $25K in pure profit! Want to know my secret? Drop a 'YES' below!" The "comment YES" engagement bait has no contact channel. It reaches LOW.
3. "Dear valued customer… your eBay account could be suspended… click here and re-enter your account information". This is credential phishing. It is labelled positive here, but it is not an investment lure, and the engine deliberately does not score account-verification phishing.

Accidental true positives are also worth knowing about. Several stock-pump spam emails reach HIGH through the impersonation path because their legal disclaimer ("…is not a registered investment advisor…", "SEC") reads as a credential claim. They are counted as correct here, but the reason is wrong.

## Caveats (read before quoting numbers)

1. **Distribution mismatch.**
   - The product flags social posts that pull people into investment chats.
   - The closest available labelled set is mostly email phishing/spam plus synthetic template posts.
   - Recall here says little about recall on real Threads/X lure posts, in either direction.
2. **Precision 1.0 is on easy negatives for the biggest source.** The 806 fake_profile_post negatives are hobby, news and promo templates ("Pro tip for fellow hiking enthusiasts…"). The hard negatives are the email sources: Enron finance/energy business mail (spam_email, 430 negatives) and news/Enron-style mail (phishing, 232 negatives). The engine also made 0 HIGH errors there. That is encouraging but not proof.
3. **Contact info was anonymised**, so the strongest signal family (phone, WhatsApp, Telegram, links) is mostly invisible. The restored variant shows the sensitivity: precision 0.9965, with 4 FPs.
4. **Record-level numbers are dominated by template repetition** (4,675 test fake-profile records but only 128 distinct texts). Quote the unique-text row alongside them.
5. **Label noise:** the author explicitly disclaims per-record ground truth.
6. **By design, HIGH requires** an off-platform contact lure, an impersonation structure, or multi-account spreading. Posts that only brag or hype a stock stay at REVIEW or LOW. On this dataset that costs recall, and it is the intended trade-off for a system whose HIGH output goes into reports.
7. **Text only.** The dataset's account metadata (followers, account age) was not passed to the engine.

## Reproduce

```bash
# 1. data (CC BY 4.0, ~9 MB)
mkdir -p eval/en/data/raw
curl -L -o eval/en/data/raw/mendeley_6wnd7jrt6z_v2.csv \
  "https://data.mendeley.com/public-files/datasets/6wnd7jrt6z/files/71fde40c-a8bd-4217-9e77-1ea5de74675f/file_downloaded"
shasum -a 256 eval/en/data/raw/mendeley_6wnd7jrt6z_v2.csv   # a4b336074176efb5746d1981506c1f1faba19a1b0a20f3b9e95dc8be94ea2504

# 2. split (verifies the hash, writes dev/test jsonl + manifest.json; deterministic)
npx tsx eval/en/prepare.ts

# 3. evaluate
npx tsx eval/en/run.ts --split test                       # headline
npx tsx eval/en/run.ts --split test --variant restored    # sensitivity
npx tsx eval/en/run.ts --split dev --errors 15            # tuning view

# 4. unit tests
npx vitest run
```

The expected output hashes of `dev.jsonl` and `test.jsonl` are in `eval/en/data/manifest.json`.

## What the English engine covers (signal families)

These mirror the Korean families. Weights and rules stay in code, not here or in UI strings.

- **Lure to contact / off-platform chat:**
  - WhatsApp (also spaced, homoglyph or `wh@tsapp` forms; `wa.me`, `chat.whatsapp.com`), Telegram (`t.me`), Signal
  - "DM/message/text me", "link in bio", "join my private/VIP group", other messengers
  - phone numbers (international and North American), email
- **Investment offer:** stock/crypto/forex tips and signals, "trading secret/system", managed accounts and copy-trading, mining/staking/presale, investment plans, side-hustle framing.
- **Guaranteed or unrealistic returns:** guaranteed returns, risk-free, "double your money", "X% daily", money-made claims, financial-freedom promises.
- **Fake proof of profit:** withdrawal/payout proof, screenshots of profits, "I've helped N people", testimonials.
- **Impersonation:** firm, regulator and celebrity names combined with employment/licence/endorsement/insider claims and an offer. Credential-document claims are included.
- **Urgency / scarcity, free bait, recruitment of members.**
- **Counter-context:** victim and warning posts ("got scammed", "beware", "report and block"), risk disclaimers, news wire, public-agency campaigns.
