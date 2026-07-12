# Board Pack — automated weekly email (Netlify)

Turns the dashboard's **Board Pack** button into a scheduled report: the app
publishes an email-safe snapshot + each user's opt-in to Netlify Blobs, and a
scheduled function emails the latest snapshot to opted-in users every week.

## The one tradeoff to understand
This app has **no backend data store** — data lives in each browser's
`localStorage`. A scheduled function runs on Netlify's servers and cannot read
a browser. So the weekly email contains **the most recent snapshot a browser
published while the app was open**, not a freshly-computed Sunday-morning
report. The email is stamped **“Data as of <date>”** for honesty. If nobody
opens the app for a week, the email repeats the last snapshot. For a dashboard
the exec team opens regularly this is fine; if you need always-live figures you
must move the data to a real store (out of scope here).

## Pieces
- **Client** (`PETGO Vantage v3.html`): `pvBuildBoardPackEmail()` builds the
  inline-styled summary; `pvPublishBoardPack()` POSTs it + the opt-in on login,
  on opening the Board Pack modal, and when the summary-email setting changes.
- **`netlify/functions/publish-boardpack.mjs`** — stores latest snapshot +
  upserts the recipient roster in Netlify Blobs.
- **`netlify/functions/send-boardpack.mjs`** — **scheduled** `0 7 * * 0`
  (Sunday 09:00 Tripoli = 07:00 UTC); emails the latest snapshot to opted-in
  recipients via Resend.
- **`netlify/functions/send-boardpack-test.mjs`** — "Send me a test now".
- Recipients = users with **“Send me a summary email”** ≠ Off (Settings →
  Notifications). Because that pref is per-browser, the roster accumulates as
  users visit while signed in.

## One-time setup
1. **Deploy on Netlify** (functions only run on the deployed site, not from a
   local file). This repo's `netlify.toml` already sets the functions dir and
   serves the app at `/`.
2. **Resend account** → create an API key. Optionally verify a domain so the
   sender can be `reports@petgo.ly`.
3. **Netlify → Site settings → Environment variables:**
   - `RESEND_API_KEY` = your Resend key *(server-side only — never in the HTML)*
   - `BOARDPACK_FROM` *(optional)* = `PETGO Vantage <reports@petgo.ly>`
     (defaults to Resend's shared `onboarding@resend.dev` so a first test works
     with no DNS).
4. **Netlify Blobs** needs no setup — it's auto-provisioned for functions.
5. Deploy. Confirm `send-boardpack` appears under **Functions → Scheduled**.

## Verify
- Open the deployed app → **Board Pack** → **Send me a test now** → check inbox.
- The weekly run fires Sundays; trigger a one-off from the Netlify Functions UI
  to test without waiting.

## Security notes
- `RESEND_API_KEY` lives only in Netlify env vars (same pattern the Groq
  function will use). It is never shipped in the client HTML.
- `publish-boardpack` / `send-boardpack-test` are **unauthenticated** — a static
  backend-less app can't hold a request-signing secret. Mitigations: recipients
  restricted to `@petgo.ly`, snapshot size capped (~380 KB), and no private
  server-side data exists beyond what a browser already publishes. If you later
  add auth (e.g. Netlify Identity / a shared server), gate these endpoints.
