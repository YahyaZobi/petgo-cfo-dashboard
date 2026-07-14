/* Netlify SCHEDULED function — daily scan of https://noc.ly/en/tenders/.
   Scrapes the listing, fuzzy-matches each tender to the tracked NOC-ecosystem
   companies, and merges the results into Netlify Blobs for the Reports UI
   (read via the `tenders` function). tenders.gov.ly was assessed and skipped:
   the domain has no DNS records. See lib/tenders.mjs for parsing/matching. */
import { runScan } from './lib/tenders.mjs';

export default async () => {
  const data = await runScan('schedule');
  const s = data.lastScan;
  if (s.ok) {
    const matched = data.tenders.filter((t) => t.companyId && !t.delisted).length;
    console.log(`[tenders] scan ok: ${s.found} listed, ${data.tenders.length} stored, ${matched} matched`);
  } else {
    console.error(`[tenders] scan FAILED: ${s.error}`);
  }
};

/* Daily 07:30 Tripoli (UTC+2, no DST) = 05:30 UTC — before the workday. */
export const config = { schedule: '30 5 * * *' };
