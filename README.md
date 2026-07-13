# Suhail WhatsApp Service

**The messaging arm of the Suhail safety system.**

A small Node.js microservice that delivers the emergency WhatsApp alerts for the [Suhail iOS app](https://github.com/ArwaAlkadi/Suhail). When a traveler is overdue, the Suhail backend calls this service, which sends the emergency contacts a WhatsApp message containing the last known location and a tracking link — straight to an app everyone already has.

<br>

## How It Works

The service runs a persistent WhatsApp session using `whatsapp-web.js` on top of headless Chromium (Puppeteer). A real WhatsApp account is linked once by scanning a QR code, and the session is stored locally so it survives restarts.

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /send` | `x-api-key` header | Sends a message: `{ phone, message }` — called by the Suhail Cloud Functions |
| `GET /qr` | — | Renders the QR code to link the WhatsApp account on first setup |
| `GET /health` | — | Reports client readiness, last successful send, and failure count for monitoring |

<br>

## Reliability & Self-Healing

WhatsApp Web sessions are fragile by nature, so the service is built to recover on its own:

- **Auto-restart on failure** — on `disconnected` or `auth_failure`, the client is destroyed and recreated from scratch
- **Failure threshold** — 3 consecutive send failures trigger a full client restart
- **Periodic health check** — client readiness is verified every 5 minutes

### Maintenance Mode Sync
The service keeps the rest of the system honest about its own state: it writes a maintenance flag to Firestore (`remoteConfig/maintenance`) — raised on startup and whenever the WhatsApp session drops, cleared the moment the client is ready. The iOS app reads this flag, so users are never promised alert delivery that the messaging layer can't currently fulfill.

<br>

## Tech Stack

- Node.js · Express
- `whatsapp-web.js` + Puppeteer (headless Chromium)
- Firebase Admin SDK (Firestore maintenance flag)
- Ships with Docker and Nixpacks configs; deployed on Railway
<br>

## Related Repositories

- **[Suhail](https://github.com/ArwaAlkadi/Suhail)** — the iOS app and the overdue-detection backend that calls this service
- **[SuhailWebsite](https://github.com/ArwaAlkadi/SuhailWebsite)** — the public tracking page that alert recipients open
