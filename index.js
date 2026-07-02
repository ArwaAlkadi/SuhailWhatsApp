const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const express = require('express');
const admin = require("firebase-admin");

const app = express();
app.use(express.json());

admin.initializeApp({
    credential: admin.credential.cert(
        JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    )
});

const db = admin.firestore();

setMaintenance(true);

async function setMaintenance(enabled) {
    try {
        await db.collection("remoteConfig")
            .doc("maintenance")
        .set(
            { isEnabled_whatsapp: enabled },
            { merge: true }
        );

        console.log(`Maintenance mode: ${enabled}`);
    } catch (err) {
        console.error("Failed to update maintenance:", err);
    }
}

let latestQR = null;
let isReady = false;
let lastSuccessfulSend = Date.now();

// MARK: - API Key Middleware
const API_KEY = process.env.API_KEY;

const requireApiKey = (req, res, next) => {
    const key = req.headers["x-api-key"];
    if (!key || key !== API_KEY) {
        console.warn(`Unauthorized request from ${req.ip}`);
        return res.status(401).json({ success: false, error: "Unauthorized" });
    }
    next();
};

// MARK: - Client Factory
// Extracted so we can recreate the client on session failure.
function createClient() {
    const c = new Client({
        authStrategy: new LocalAuth({
            dataPath: './session'
        }),
        puppeteer: {
            headless: true,
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox'
            ]
        }
    });

    c.on('qr', async (qr) => {
        console.log('QR RECEIVED');
        isReady = false;
        qrcodeTerminal.generate(qr, { small: true });
        latestQR = await QRCode.toDataURL(qr);
        console.log('Open /qr to scan the QR code');
    });

    c.on('ready', async () => {
        latestQR = null;
        isReady = true;
        lastSuccessfulSend = Date.now();

        await setMaintenance(false);

        console.log('WhatsApp ready!');
    });

    c.on('disconnected', async (reason) => {
        console.warn(`WhatsApp disconnected: ${reason} — restarting client...`);

        isReady = false;

        await setMaintenance(true);

        await restartClient();
    });

    c.on('auth_failure', async (msg) => {
        console.error(`Auth failure: ${msg} — restarting client...`);

        isReady = false;

        await setMaintenance(true);

        await restartClient();
    });
    
    return c;
}

let client = createClient();

// MARK: - Restart Client
async function restartClient() {
    console.log('Restarting WhatsApp client...');
    try {
        await client.destroy();
    } catch (e) {
        console.warn('Error during destroy:', e.message);
    }
    client = createClient();
    client.initialize();
}

// MARK: - Health Check (every 5 minutes)
let consecutiveFailures = 0;
const MAX_FAILURES = 3;

setInterval(() => {
    if (!isReady) {
        console.log('[health] Client not ready — waiting for QR or reconnect...');
        return;
    }
    console.log('[health] Client is ready ✅');
    consecutiveFailures = 0;
}, 5 * 60 * 1000);

// MARK: - Routes

app.get('/qr', (req, res) => {
    if (!latestQR) {
        return res.send('No QR available. WhatsApp may already be ready.');
    }
    res.send(`
        <html>
            <body style="display:flex;justify-content:center;align-items:center;height:100vh;">
                <img src="${latestQR}" />
            </body>
        </html>
    `);
});

// Shows current client status — useful for monitoring
app.get('/health', (req, res) => {
    res.json({
        ready: isReady,
        lastSuccessfulSend: new Date(lastSuccessfulSend).toISOString(),
        consecutiveFailures
    });
});

// Protected — requires valid x-api-key header
app.post('/send', requireApiKey, async (req, res) => {
    const { phone, message } = req.body;

    try {
        const chatId = `${phone}@c.us`;
        await client.sendMessage(chatId, message);
        console.log(`Message sent to ${phone}`);
        lastSuccessfulSend = Date.now();
        consecutiveFailures = 0;
        res.json({ success: true });
    } catch (err) {
        console.error(`Send failed for ${phone}:`, err.message);
        consecutiveFailures++;

        // Auto-restart after 3 consecutive failures
        if (consecutiveFailures >= MAX_FAILURES) {
            console.error(`[health] ${MAX_FAILURES} consecutive failures — restarting client...`);
            consecutiveFailures = 0;
            restartClient();
        }

        res.json({ success: false, error: err.message });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

client.initialize();
