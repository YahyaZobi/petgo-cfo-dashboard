/* Netlify SCHEDULED function — emails the latest Board Pack snapshot to every
   opted-in recipient. Runs Sundays 09:00 Tripoli (Libya is UTC+2, no DST → 07:00 UTC).

   Fires on Netlify's cron; it does NOT read anyone's browser. It can only send
   the most recent snapshot a browser published via publish-boardpack — see
   BOARDPACK_SETUP.md for the freshness tradeoff. */
import { getLatest, getRecipients, sendEmail, subjectFor } from './lib/boardpack.mjs';

export default async () => {
  const latest = await getLatest();
  if (!latest || !latest.html) {
    console.log('[boardpack] no snapshot published yet — nothing to send');
    return;
  }
  const recips = await getRecipients();
  // Weekly send goes to anyone opted in (both "weekly" and "daily" cadences).
  const emails = Object.keys(recips).filter((e) => recips[e] && recips[e].cadence && recips[e].cadence !== 'off');
  if (!emails.length) {
    console.log('[boardpack] no opted-in recipients');
    return;
  }
  const subject = subjectFor(latest.dataAsOf);
  let sent = 0;
  for (const to of emails) {
    try { await sendEmail({ to, subject, html: latest.html }); sent++; }
    catch (e) { console.error('[boardpack] send failed for', to, '-', e.message); }
  }
  console.log(`[boardpack] weekly send complete: ${sent}/${emails.length} delivered (snapshot ${latest.dataAsOf})`);
};

/* Sunday 09:00 Tripoli = 07:00 UTC. */
export const config = { schedule: '0 7 * * 0' };
