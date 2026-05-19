const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');

const app = express();
app.use(express.json());

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

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('WhatsApp ready!');
});

// endpoint يستقبل الطلب من Firebase
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
