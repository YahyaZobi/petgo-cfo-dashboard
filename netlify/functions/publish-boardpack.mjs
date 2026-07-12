/* POST /.netlify/functions/publish-boardpack
   Called by the app (while open) to publish:
     - the latest email-safe Board Pack HTML snapshot, and
     - the signed-in user's summary-email opt-in.
   Both are stored in Netlify Blobs for the weekly scheduled send to read.

   NOTE: this endpoint is unauthenticated — a purely static, backend-less app
   cannot hold a secret to sign requests. We mitigate by validating shape/size
   and restricting recipients to @petgo.ly. Worst case is a poisoned snapshot
   or roster entry, not data exfiltration (there is no private data server-side
   beyond what a browser already publishes). */
import { saveLatest, getRecipients, saveRecipients, validEmail, MAX_HTML, json } from './lib/boardpack.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const { html, dataAsOf, subscriber } = body || {};

  let storedArtifact = false, storedSubscriber = false;

  if (typeof html === 'string' && html.length > 0) {
    if (html.length > MAX_HTML) return json({ error: 'Snapshot too large' }, 413);
    await saveLatest({ html, dataAsOf: dataAsOf || new Date().toISOString(), updatedAt: new Date().toISOString() });
    storedArtifact = true;
  }

  if (subscriber && typeof subscriber.email === 'string') {
    if (!validEmail(subscriber.email)) return json({ error: 'Recipient must be a @petgo.ly address' }, 400);
    const email = subscriber.email.trim().toLowerCase();
    const cadence = subscriber.cadence || 'off';
    const recips = await getRecipients();
    if (cadence === 'off') { delete recips[email]; }
    else { recips[email] = { name: String(subscriber.name || '').slice(0, 80), cadence, updatedAt: new Date().toISOString() }; }
    await saveRecipients(recips);
    storedSubscriber = true;
  }

  return json({ ok: true, storedArtifact, storedSubscriber });
};
