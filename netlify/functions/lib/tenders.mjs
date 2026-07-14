/* Shared helpers for the Tenders & Bids monitoring feature.
   Same architecture as boardpack.mjs: Netlify Blobs for persistence,
   a scheduled function for the recurring work, an HTTP function for reads.

   Source: https://noc.ly/en/tenders/ — a static WordPress (YOOtheme) table.
   Verified 14 Jul 2026: rows are `tr.el-item.fs-table-row` with
     .el-title  → "Company Name …. REFERENCE" (ellipsis-separated)
     .el-text-1 → expiry date like "Aug 2, 2026" (cell may be EMPTY)
     .el-link   → absolute link to the tender detail page
   The page duplicates every row for a mobile layout — dedup by link.
   There is NO publish date anywhere (listing or detail page), only an
   expiry date; publishDate stays in the schema as null for honesty.

   tenders.gov.ly was evaluated and skipped: the domain has no DNS records.

   robots.txt: `User-agent: * → Allow: /` (only /wp-admin/ disallowed), with
   Cloudflare content signals ai-train=no,use=reference. We fetch ONE page,
   once a day, with an honest User-Agent, and every UI row links back to the
   source — squarely "reference" use. Named AI-crawler UAs (ClaudeBot, GPTBot…)
   are disallowed; this function is none of those and does not pretend to be. */
import { getStore } from '@netlify/blobs';

export const SOURCE_URL = 'https://noc.ly/en/tenders/';
export const USER_AGENT =
  'PETGO-Vantage-TenderScan/1.0 (internal tender monitor; contact: finance@petgo.ly)';

const STORE_NAME = 'tenders';
const DATA_KEY = 'data'; // { tenders: [...], lastScan: { at, ok, found, error } }

/* Mirror of the client's RP_SEED_COMPANIES (id + name only). The scheduled
   function cannot read any browser's localStorage, so it matches against this
   stable NOC-ecosystem list; the client re-runs the SAME algorithm against its
   live company list (including user-added ones) and its result wins when the
   server left a tender unmatched. Keep ids identical to the client seed. */
export const KNOWN_COMPANIES = [
  { id: 'co-noc', name: 'National Oil Corporation (NOC)' },
  { id: 'co-agoco', name: 'Arabian Gulf Oil Company (AGOCO)' },
  { id: 'co-waha', name: 'Waha Oil Company' },
  { id: 'co-zoc', name: 'Zueitina Oil Company (ZOC)' },
  { id: 'co-soc', name: 'Sirte Oil Company (SOC)' },
  { id: 'co-harouge', name: 'Harouge Oil Operations' },
  { id: 'co-mellitah', name: 'Mellitah Oil & Gas B.V.' },
  { id: 'co-akakus', name: 'Akakus Oil Operations' },
  { id: 'co-mabrouk', name: 'Mabrouk Oil Company' },
  { id: 'co-sarir', name: 'Sarir Oil Operations Company' },
  { id: 'co-nafusah', name: 'Nafusah Oil Operations Company' },
  { id: 'co-murzuq-svc', name: 'Murzuq Oil Services Ltd' },
  { id: 'co-zallaf', name: 'Zallaf Libya Company' },
  { id: 'co-jowfe', name: 'Jowfe Oil Technology' },
  { id: 'co-nwd', name: 'National Drilling & Workover Company (NWD)' },
  { id: 'co-nageco', name: 'North African Geophysical Exploration Co. (NAGECO)' },
  { id: 'co-eni', name: 'Eni North Africa B.V.' },
  { id: 'co-sonatrach', name: 'Sonatrach' },
  { id: 'co-arc', name: 'Zawia Oil Refining Company (ARC)' },
  { id: 'co-rasco', name: 'Ras Lanuf Oil & Gas Processing Company (RASCO)' },
  { id: 'co-brega', name: 'Brega Petroleum Marketing Company' },
  { id: 'co-lerco', name: 'Libyan Emirates Refining Company (LERCO)' },
  { id: 'co-lifeco', name: 'Libyan Fertilizer Company (LIFECO)' },
  { id: 'co-ola', name: 'OLA Energy' },
  { id: 'co-tamoil', name: 'Tamoil' },
  { id: 'co-npcc', name: 'National Petroleum Construction Company (NPCC)' },
  { id: 'co-taknia', name: 'Taknia Libya Engineering' },
  { id: 'co-nofcat', name: 'National Catering Company for Oil Fields & Terminals (NOFCAT)' },
  { id: 'co-petroair', name: 'Petro Air Company' },
];

/* ── fuzzy company matching ──────────────────────────────────────────
   Real-world variance this must absorb (all seen on noc.ly):
     "Mabruk Oil Operations"      → "Mabrouk Oil Company"    (spelling + suffix)
     "Nafusah Oil Operations B.V" → "Nafusah Oil Operations Company"
     "Arabian Gulf Oil Company"   → "… (AGOCO)"              (acronym suffix)
   Strategy: compare only DISTINCTIVE tokens (generic industry words carry no
   identity), allow edit-distance 1 on tokens ≥5 chars, and treat ambiguous
   results (two companies tying) as unmatched — a wrong match is worse than
   an "Unmatched" bucket entry. Any change here must be mirrored in the
   client's rpTenderMatch (PETGO Vantage v3.html). */
const GENERIC = new Set([
  'oil', 'gas', 'company', 'co', 'corporation', 'operations', 'operation',
  'petroleum', 'national', 'ltd', 'limited', 'inc', 'plc', 'bv', 'b', 'v',
  'the', 'of', 'for', 'and', 'amp', 'libya', 'libyan', 'branch', 'holding', 'group',
]);

export function tnNorm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function tnTokens(s) {
  return tnNorm(s).split(' ').filter((t) => t && !GENERIC.has(t));
}
function tnLev(a, b) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 3;
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}
function tokenHit(raw, key) {
  if (raw === key) return 2;
  if (raw.length >= 5 && key.length >= 5 && tnLev(raw, key) <= 1) return 1;
  return 0;
}

/* Returns { id, name, score } or null. `companies` = [{id, name}]. */
export function matchCompany(rawName, companies) {
  const rawFull = tnNorm(rawName);
  if (!rawFull) return null;
  const rawToks = tnTokens(rawName);
  let best = null, second = null;
  for (const c of companies) {
    const keyToks = tnTokens(c.name);
    const nameNoParen = tnNorm(String(c.name).replace(/\([^)]*\)/g, ''));
    let score = 0;
    for (const rt of rawToks) {
      let hit = 0;
      for (const kt of keyToks) hit = Math.max(hit, tokenHit(rt, kt));
      score += hit;
    }
    // whole-name containment (handles all-generic names like the NOC itself)
    if (rawFull.length >= 8 && (nameNoParen.includes(rawFull) || rawFull.includes(nameNoParen))) {
      score += 3;
    }
    if (!score) continue;
    const cand = { id: c.id, name: c.name, score };
    if (!best || cand.score > best.score) { second = best; best = cand; }
    else if (cand.score === best.score) { second = cand; }
  }
  if (!best) return null;
  if (second && second.score === best.score) return null; // ambiguous → Unmatched
  const singleDistinctive = rawToks.length <= 1;
  if (best.score >= 2 || (best.score >= 1 && singleDistinctive)) return best;
  return null;
}

/* ── page parsing ──────────────────────────────────────────────────── */
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function parseListDate(s) {
  const m = /([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(String(s || ''));
  if (!m) return null;
  const mo = MONTHS[m[1].slice(0, 3).toLowerCase()];
  if (!mo) return null;
  return `${m[3]}-${String(mo).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
}
function stripTags(s) {
  return String(s || '').replace(/<[^>]+>/g, ' ')
    .replace(/&#8230;/g, '…').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/\s+/g, ' ').trim();
}

/* Title → { companyNameRaw, referenceNumber }.
   Titles are "Company …. rest" — the separator is an ellipsis entity and/or
   runs of dots (seen: "….", "…", ".."). Reference numbers look like
   PQC-06/2026, NOO-NHF-HSE-ITT-14-2026, CFT/LOG/614/2024/AJF. */
export function splitTitle(title) {
  const t = String(title || '').trim();
  const sep = /(?:…|\.{2,})+/;
  const m = sep.exec(t);
  const companyNameRaw = m ? t.slice(0, m.index).trim().replace(/[.,;:]+$/, '') : null;
  const rest = m ? t.slice(m.index + m[0].length) : t;
  // a reference must contain a digit — else words like "Pre-qualification" match
  const refs = rest.match(/[A-Z]{2,}[A-Z0-9]*(?:[-\/][A-Z0-9]+)+/gi) || [];
  const ref = refs.find((x) => /\d/.test(x)) || null;
  return { companyNameRaw: companyNameRaw || null, referenceNumber: ref };
}

/* HTML → [{ title, expiryDate, tenderLinkUrl }], deduped by link. */
export function parseNocTenders(html) {
  const out = new Map();
  const rowRe = /<tr class="el-item fs-table-row[^"]*">([\s\S]*?)<\/tr>/g;
  let r;
  while ((r = rowRe.exec(html))) {
    const row = r[1];
    const link = /href="(https?:\/\/noc\.ly\/en\/tenders\/[^"]+)"/.exec(row);
    if (!link) continue;
    const titleM = /<div class="el-title[^"]*">([\s\S]*?)<\/div>/.exec(row);
    let title = titleM ? stripTags(titleM[1]) : '';
    title = title.replace(/^Title:\s*/i, ''); // mobile-layout duplicate rows carry labels
    if (!title) continue;
    const dateM = /<div class="el-text-1[^"]*">([\s\S]*?)<\/div>/.exec(row);
    const expiryDate = dateM ? parseListDate(stripTags(dateM[1])) : null;
    const url = link[1];
    const prev = out.get(url);
    if (!prev || (!prev.expiryDate && expiryDate)) out.set(url, { title, expiryDate, tenderLinkUrl: url });
  }
  return [...out.values()];
}

/* ── scan + merge ──────────────────────────────────────────────────── */
function idFromUrl(url) {
  const slug = String(url).replace(/\/+$/, '').split('/').pop() || '';
  return 'tn-' + slug.slice(0, 80);
}

/* Merge freshly scraped rows into the stored list. Records are keyed by the
   tender's detail URL: scannedDate is the FIRST time we saw it (that is the
   list's "newest first" ordering key, since NOC publishes no publish date),
   lastSeenDate tracks presence, and rows that drop off the page are kept but
   flagged delisted (a tender vanishing early is itself signal). */
export function mergeScan(existing, scraped, nowIso, companies) {
  const today = nowIso.slice(0, 10);
  const byUrl = new Map((existing || []).map((t) => [t.tenderLinkUrl, t]));
  const seen = new Set();
  for (const s of scraped) {
    seen.add(s.tenderLinkUrl);
    const { companyNameRaw, referenceNumber } = splitTitle(s.title);
    const match = matchCompany(companyNameRaw || s.title, companies);
    const prev = byUrl.get(s.tenderLinkUrl);
    byUrl.set(s.tenderLinkUrl, {
      id: prev ? prev.id : idFromUrl(s.tenderLinkUrl),
      title: s.title,
      referenceNumber,
      companyId: match ? match.id : null,
      companyNameRaw,
      sourceUrl: SOURCE_URL,
      tenderLinkUrl: s.tenderLinkUrl,
      publishDate: null, // noc.ly does not publish one — see header note
      expiryDate: s.expiryDate,
      scannedDate: prev ? prev.scannedDate : today,
      lastSeenDate: today,
      delisted: false,
      source: 'noc',
    });
  }
  for (const t of byUrl.values()) {
    if (!seen.has(t.tenderLinkUrl)) t.delisted = true;
  }
  return [...byUrl.values()].sort((a, b) =>
    a.scannedDate === b.scannedDate
      ? String(a.title).localeCompare(String(b.title))
      : a.scannedDate > b.scannedDate ? -1 : 1
  );
}

export async function fetchSource() {
  const res = await fetch(SOURCE_URL, {
    headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`noc.ly responded ${res.status}`);
  return res.text();
}

function store() { return getStore(STORE_NAME); }
export async function getData() {
  try { return (await store().get(DATA_KEY, { type: 'json' })) || { tenders: [], lastScan: null }; }
  catch { return { tenders: [], lastScan: null }; }
}
export async function saveData(data) { await store().setJSON(DATA_KEY, data); }

/* One full scan cycle; always records lastScan so failures are visible in the UI. */
export async function runScan(trigger) {
  const now = new Date().toISOString();
  const data = await getData();
  try {
    const html = await fetchSource();
    const scraped = parseNocTenders(html);
    data.tenders = mergeScan(data.tenders, scraped, now, KNOWN_COMPANIES);
    data.lastScan = { at: now, ok: true, found: scraped.length, trigger, error: null };
  } catch (e) {
    data.lastScan = { at: now, ok: false, found: 0, trigger, error: e.message || String(e) };
  }
  await saveData(data);
  return data;
}

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
