/* Shared helpers for the Board Pack scheduled-email feature.
   Storage = Netlify Blobs (auto-configured inside deployed functions).
   Email   = Resend (API key from the RESEND_API_KEY env var).
   Files under lib/ are NOT registered as endpoints — only top-level
   files in netlify/functions/ become callable functions. */
import { getStore } from '@netlify/blobs';
import { Resend } from 'resend';

const STORE_NAME = 'boardpack';
const LATEST_KEY = 'latest';       // { html, dataAsOf, updatedAt }
const RECIPIENTS_KEY = 'recipients'; // { [email]: { name, cadence, updatedAt } }

/* Sender identity. Override with the BOARDPACK_FROM env var once a domain is
   verified in Resend, e.g. "PETGO Vantage <reports@petgo.ly>". The default
   uses Resend's shared onboarding sender so a first test works with zero DNS. */
export const FROM = process.env.BOARDPACK_FROM || 'PETGO Vantage <onboarding@resend.dev>';

/* Keep artifacts small — email clients clip large bodies and Blobs is not a
   file host. ~380KB comfortably fits our inline-styled summary. */
export const MAX_HTML = 380 * 1024;

function store() { return getStore(STORE_NAME); }

export async function getLatest() {
  try { return await store().get(LATEST_KEY, { type: 'json' }); }
  catch { return null; }
}
export async function saveLatest(obj) { await store().setJSON(LATEST_KEY, obj); }

export async function getRecipients() {
  try { return (await store().get(RECIPIENTS_KEY, { type: 'json' })) || {}; }
  catch { return {}; }
}
export async function saveRecipients(map) { await store().setJSON(RECIPIENTS_KEY, map); }

/* Access is restricted to PETGO work emails (the app's own login rule). */
export function validEmail(e) {
  return typeof e === 'string' && /^[^@\s]+@petgo\.ly$/i.test(e.trim());
}

export async function sendEmail({ to, subject, html }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not configured on this site');
  const resend = new Resend(key);
  const { data, error } = await resend.emails.send({ from: FROM, to, subject, html });
  if (error) throw new Error(error.message || 'Resend send failed');
  return data;
}

export function subjectFor(dataAsOf) {
  let d = 'latest';
  try { d = new Date(dataAsOf || Date.now()).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); } catch {}
  return `PETGO Board Pack — Finance Overview (${d})`;
}

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
