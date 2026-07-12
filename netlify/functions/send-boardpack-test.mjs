/* POST /.netlify/functions/send-boardpack-test
   Sends the Board Pack immediately to ONE @petgo.ly address (the "Send me a
   test now" button). Uses the posted HTML if present, else the latest stored
   snapshot. Lets a user confirm delivery without waiting for Sunday. */
import { getLatest, sendEmail, validEmail, MAX_HTML, json } from './lib/boardpack.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const to = String((body && body.to) || '').trim().toLowerCase();
  if (!validEmail(to)) return json({ error: 'Recipient must be a @petgo.ly address' }, 400);

  let html = (typeof body.html === 'string' && body.html.length > 0 && body.html.length <= MAX_HTML) ? body.html : null;
  if (!html) {
    const latest = await getLatest();
    html = latest && latest.html;
  }
  if (!html) return json({ error: 'No Board Pack available yet — open the Dashboard first' }, 400);

  try { await sendEmail({ to, subject: 'PETGO Board Pack — test send', html }); }
  catch (e) { return json({ error: e.message }, 500); }

  return json({ ok: true, sentTo: to });
};
