/* GET  /.netlify/functions/tenders          → stored tenders + lastScan meta
   POST /.netlify/functions/tenders {scan:1} → run a scan now, return fresh data
   (POST covers first-run before the schedule has fired, and a manual
   "Scan now" in the Reports UI.)

   Unauthenticated, like the other functions of this backend-less app (see
   BOARDPACK_SETUP.md). The data is public tender listings, so reads leak
   nothing; POST is throttled so strangers cannot make us hammer noc.ly. */
import { getData, runScan, json } from './lib/tenders.mjs';

const MIN_SCAN_GAP_MS = 10 * 60 * 1000;

export default async (req) => {
  if (req.method === 'GET') return json(await getData());
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const data = await getData();
  const last = data.lastScan && Date.parse(data.lastScan.at);
  if (last && Date.now() - last < MIN_SCAN_GAP_MS) {
    return json({ ...data, throttled: true });
  }
  return json(await runScan('manual'));
};
