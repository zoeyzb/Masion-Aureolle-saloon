# Maison Aurelle

A static salon website with a server-side appointment **request** form. Requests are not confirmed appointments and do not reserve availability.

## Run locally

- Node.js 24 or later
- Set `RESEND_API_KEY` in the server process environment (never in frontend code or Git).
- Run `npm run dev` and open `http://localhost:3000`.
- Run `npm test` for validation, delivery-acceptance, and failure-path tests.

## Front-end structure

- `index.html` — markup only.
- `styles.css` — all styling. CSS animations own `transform`; the motion engine only writes the individual `translate`, `scale` and `rotate` properties so the two never fight.
- `main.js` — navigation, scroll reveals, the depth engine (`data-hero-*`, `data-speed`, `data-media`, `data-sheet`, `data-lean`, documented at the top of `initDepth`), pointer tilt (`data-tilt`), the atelier comparison slider, client notes, and the booking form.
- All motion is disabled under `prefers-reduced-motion`.
- The atelier comparison uses one slider for every look. Photo pairs and their honest labels live in `LOOKS` in `main.js`; each look's frame ratio and focal point live in `.compare[data-look]` in `styles.css`.

## Booking integration

The modal sends JSON to `POST /api/booking`. The backend validates the service, preferred date/time, name, and email; rejects cross-origin submissions and a hidden honeypot field; and forwards an email through Resend.

Notifications:
- From: `bookings@recoverrevenue.company` (verified sending domain)
- To: `sierra@recoverrevenue.company`
- Reply-To: the customer's email

The API returns success only if the email provider accepts the message. This does **not** prove mailbox delivery or confirm an appointment. Delivery failures and missing configuration keep the form open, display an error, and offer the contact email as a fallback.

Set `RESEND_API_KEY` as a secret environment variable in the Vercel `saloon-2` project for production and preview. Changing it requires a new deployment. Never store this credential in the repository.

The in-memory limiter is a light first layer against abuse, not a distributed rate limiter. For a high-traffic production salon, add managed rate limiting and bot verification.
