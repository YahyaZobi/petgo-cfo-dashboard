# Tenders & Bids — daily noc.ly scan (Netlify)

Adds a **Tenders & Bids** tab to Reports: a Netlify scheduled function scrapes
Libya NOC's tender listing daily, fuzzy-matches each tender to the tracked
company portfolio, and stores results in Netlify Blobs for the UI to read.
Same architecture as the Board Pack (see `BOARDPACK_SETUP.md`).

## Pieces
- **`netlify/functions/tender-scan.mjs`** — **scheduled** `30 5 * * *`
  (daily 07:30 Tripoli = 05:30 UTC). Fetches `https://noc.ly/en/tenders/`,
  parses the listing table, matches companies, merges into Blobs.
- **`netlify/functions/tenders.mjs`** — `GET` returns stored tenders +
  last-scan status; `POST {scan:1}` runs a scan on demand (the UI's
  **Scan now** button; throttled to one scan per 10 minutes).
- **`netlify/functions/lib/tenders.mjs`** — parser, fuzzy matcher, Blobs
  store, and the embedded company seed list (ids mirror the client's
  `RP_SEED_COMPANIES`).
- **Client** (`PETGO Vantage v3.html`): third segment in Reports.
  Re-matches tenders against the *live* company list (including user-added
  companies) with the same algorithm, caches the last fetch in
  `localStorage.petgo_rp_tenders_cache` for local-file mode, and surfaces
  an **Open Tenders (N)** chip on company detail + hover tooltip.

## Data model (per tender)
```
{ id, title, referenceNumber, companyId (null = unmatched), companyNameRaw,
  sourceUrl, tenderLinkUrl, publishDate (always null — noc.ly doesn't
  publish one), expiryDate (nullable), scannedDate (first seen),
  lastSeenDate, delisted, source: "noc" }
```
`scannedDate` orders the list (newest first). Tenders that drop off the
listing are kept and flagged `delisted`, shown under "Closed or delisted".

## Setup
Nothing beyond deploy: no env vars, no API keys; Netlify Blobs is
auto-provisioned. After deploy, confirm `tender-scan` appears under
**Functions → Scheduled**, then open Reports → Tenders & Bids → **Scan now**
to populate the first data without waiting for the schedule.

## Source notes (assessed 14 Jul 2026)
- **noc.ly** — static HTML table, cleanly parseable; robots.txt allows
  generic crawlers (`User-agent: * → Allow: /`) and the site serves an
  honest bot User-Agent without challenge. Cloudflare content signals are
  `ai-train=no, use=reference` — this feature is reference use (links back
  to each tender). Named AI-company crawlers (ClaudeBot, GPTBot…) are
  disallowed; this scanner is not one and does not impersonate a browser.
  Footprint: one page fetch per day.
- **tenders.gov.ly** — skipped: the domain has no DNS records (dead).
  If it comes back, add a second parser in `lib/tenders.mjs` with
  `source: "tenders_gov_ly"`.
- If NOC redesigns the page, the scan fails visibly: the tab's Last Scan
  KPI and note line show the error rather than silently going stale.
