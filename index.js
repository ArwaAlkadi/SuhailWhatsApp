const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const express = require('express');

const app = express();
app.use(express.json());

let latestQR = null;

const client = new Client({
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

client.on('qr', async (qr) => {
    console.log('QR RECEIVED');

    qrcodeTerminal.generate(qr, { small: true });

    latestQR = await QRCode.toDataURL(qr);
    console.log('Open /qr to scan the QR code');
});

client.on('ready', () => {
    latestQR = null;
    console.log('WhatsApp ready!');
});

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

app.post('/send', async (req, res) => {
    const { phone, message } = req.body;

    try {
        const chatId = `${phone}@c.us`;
        await client.sendMessage(chatId, message);
        console.log(`Message sent to ${phone}`);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.json({ success: false, error: err.message });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

client.initialize();
