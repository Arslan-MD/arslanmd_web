const { makeid } = require('./gen-id');
const express = require('express');
const fs = require('fs');
const path = require('path');
const pino = require("pino");
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    Browsers,
    makeCacheableSignalKeyStore
} = require('@fizzxydev/baileys-pro'); // ✅ Fixed version

const router = express.Router();

// ✅ Ensure temp directory exists
const tempRoot = path.join(__dirname, 'temp');
if (!fs.existsSync(tempRoot)) fs.mkdirSync(tempRoot);

// ✅ Remove a folder safely
function removeFolder(folderPath) {
    if (fs.existsSync(folderPath)) {
        fs.rmSync(folderPath, { recursive: true, force: true });
    }
}

router.get('/', async (req, res) => {
    const id = makeid();
    const tempDir = path.join(tempRoot, id);
    const phoneNumber = (req.query.number || '').replace(/\D/g, '');

    if (!phoneNumber) return res.status(400).send({ error: "Please provide a valid phone number" });

    async function startPairing() {
        try {
            const { state, saveCreds } = await useMultiFileAuthState(tempDir);
            const logger = pino({ level: "fatal" }).child({ level: "fatal" });

            const sock = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, logger)
                },
                printQRInTerminal: false,
                browser: Browsers.macOS("Safari"),
                generateHighQualityLinkPreview: true,
                logger
            });

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === "open") {
                    console.log(`✅ Connected: ${sock.user.id}`);
                    await delay(4000);
                    try {
                        const credsPath = path.join(tempDir, 'creds.json');
                        const credsBuffer = fs.readFileSync(credsPath);

                        await sock.sendMessage(sock.user.id, {
                            document: credsBuffer,
                            mimetype: "application/json",
                            fileName: "creds.json",
                            caption: "✅ Your WhatsApp Session File (creds.json)\n\n⚠️ Keep it safe and never share!"
                        });

                        await sock.sendMessage(sock.user.id, {
                            text:
                                `🚀 *ARSLAN-MD Session Created!*\n\n` +
                                `▸ *Never share* your session ID\n` +
                                `▸ Join our WhatsApp Channel\n` +
                                `▸ Report bugs on GitHub\n\n` +
                                `_Powered by ArslanMD Official_\n\n` +
                                `🔗 *Useful Links:*\n` +
                                `▸ GitHub: https://github.com/Arslan-MD/Arslan_MD\n` +
                                `▸ Channel: https://whatsapp.com/channel/0029VarfjW04tRrmwfb8x306`
                        });

                        console.log("🟢 Session created successfully!");
                    } catch (err) {
                        console.error("❌ Session error:", err.message);
                    } finally {
                        await delay(1500);
                        try { await sock.end(); } catch {}
                        removeFolder(tempDir);
                        console.log("🧹 Session closed and cleaned up.");
                    }

                } else if (connection === "close") {
                    const reason = lastDisconnect?.error?.output?.statusCode;
                    if (reason !== 401) {
                        console.log("🔁 Connection closed, retrying in 5s...");
                        await delay(5000);
                        startPairing();
                    }
                }
            });

            // ✅ Generate Pairing Code
            await delay(1500);
            if (!sock.authState.creds.registered) {
                try {
                    const code = await sock.requestPairingCode(phoneNumber);
                    console.log(`📱 Pairing code for ${phoneNumber}: ${code}`);
                    if (!res.headersSent) res.send({ code });
                } catch (err) {
                    console.error("❌ Pairing code generation failed:", err.message);
                    if (!res.headersSent)
                        res.status(500).send({ error: "Pairing failed. Try again later." });
                }
            }
        } catch (err) {
            console.error("🚨 Fatal error:", err.message);
            removeFolder(tempDir);
            if (!res.headersSent)
                res.status(500).send({ error: "Service Unavailable. Try again later." });
        }
    }

    startPairing();
});

module.exports = router;
