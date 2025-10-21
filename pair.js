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
} = require('@whiskeysockets/baileys');

const router = express.Router();

// ✅ Ensure temp directory exists
const tempRoot = path.join(__dirname, 'temp');
if (!fs.existsSync(tempRoot)) {
    fs.mkdirSync(tempRoot);
}

// ✅ Clean temporary folder
function removeFolder(folderPath) {
    if (fs.existsSync(folderPath)) {
        fs.rmSync(folderPath, { recursive: true, force: true });
    }
}

router.get('/', async (req, res) => {
    const id = makeid();
    const tempDir = path.join(tempRoot, id);
    const phoneNumber = (req.query.number || '').replace(/\D/g, '');

    if (!phoneNumber) {
        return res.status(400).send({ error: "Please provide a valid phone number" });
    }

    async function createSocketSession() {
        const { state, saveCreds } = await useMultiFileAuthState(tempDir);
        const logger = pino({ level: "fatal" }).child({ level: "fatal" });

        const sock = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger)
            },
            printQRInTerminal: false,
            generateHighQualityLinkPreview: true,
            logger,
            syncFullHistory: false,
            browser: Browsers.macOS("Safari"),
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === "open") {
                await delay(4000);

                try {
                    const credsPath = path.join(tempDir, 'creds.json');
                    const credsBuffer = fs.readFileSync(credsPath);

                    // ✅ creds.json bhejna document ke form me
                    await sock.sendMessage(sock.user.id, {
                        document: credsBuffer,
                        mimetype: "application/json",
                        fileName: "creds.json",
                        caption: "✅ Your WhatsApp Session File (creds.json)\n\n⚠️ Keep it safe and never share!"
                    });

                    // ✅ Success message
                    await sock.sendMessage(sock.user.id, {
                        text:
                            `🚀 *ARSLAN-MD Session Created!*\n\n` +
                            `▸ *Never share* your session ID\n` +
                            `▸ Join our WhatsApp Channel\n` +
                            `▸ Report bugs on GitHub\n\n` +
                            `_Powered by ArslanMD Official_\n\n` +
                            `🔗 *Useful Links:*\n` +
                            `▸ GitHub: https://github.com/Arslan-MD/Arslan_MD\n` +
                            `▸ https://whatsapp.com/channel/0029VarfjW04tRrmwfb8x306`,
                        contextInfo: {
                            mentionedJid: [sock.user.id],
                            forwardingScore: 1000,
                            isForwarded: true,
                            forwardedNewsletterMessageInfo: {
                                newsletterJid: "120363348739987203@newsletter",
                                newsletterName: "Arslan-MD",
                                serverMessageId: 143
                            }
                        }
                    });

                    console.log(`✅ ${sock.user.id} session successfully created.`);

                } catch (err) {
                    console.error("❌ Session Error:", err.message);
                    await sock.sendMessage(sock.user.id, {
                        text: `⚠️ Error: ${err.message.includes('rate limit') ? 'Server is busy. Try later.' : err.message}`
                    });
                } finally {
                    await delay(1000);
                    removeFolder(tempDir);
                    try { await sock.end(); } catch {}
                    console.log("🧹 Session closed and cleaned up safely.");
                }

            } else if (connection === "close" && lastDisconnect?.error?.output?.statusCode !== 401) {
                console.log("🔁 Reconnecting...");
                await delay(2000);
                createSocketSession();
            }
        });

        // ✅ Generate Pairing Code (safe for future versions)
        if (!sock.authState.creds.registered) {
            await delay(1500);
            let pairingCode;
            try {
                pairingCode = await sock.requestPairingCode(phoneNumber);
            } catch (err) {
                console.error("❌ Pairing code generation failed:", err.message);
                if (!res.headersSent)
                    return res.status(500).send({ error: "Pairing failed. Try again later." });
                return;
            }

            if (!res.headersSent) {
                return res.send({ code: pairingCode });
            }
        }
    }

    try {
        await createSocketSession();
    } catch (err) {
        console.error("🚨 Fatal Error:", err.message);
        removeFolder(tempDir);
        if (!res.headersSent) {
            res.status(500).send({ code: "Service Unavailable. Try again later." });
        }
    }
});

module.exports = router;
