const express = require("express");
const fs = require("fs");
const crypto = require("crypto");
const { exec } = require("child_process");
let router = express.Router();
const pino = require("pino");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  delay,
  makeCacheableSignalKeyStore,
  Browsers,
  jidNormalizedUser,
} = require("@whiskeysockets/baileys");
const { upload } = require("./mega");

function removeFile(FilePath) {
  if (!fs.existsSync(FilePath)) return false;
  fs.rmSync(FilePath, { recursive: true, force: true });
}

router.get("/", async (req, res) => {
  let num = req.query.number;
  if (!num) return res.status(400).send({ error: "Missing number parameter" });

  // ✅ Create unique session folder per user
  const sessionId = crypto.randomBytes(6).toString("hex");
  const sessionFolder = `./session_${sessionId}`;

  async function PrabathPair() {
    const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);

    try {
      let PrabathPairWeb = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(
            state.keys,
            pino({ level: "fatal" }).child({ level: "fatal" }),
          ),
        },
        printQRInTerminal: false,
        logger: pino({ level: "fatal" }).child({ level: "fatal" }),
        browser: Browsers.macOS("Safari"),
      });

      if (!PrabathPairWeb.authState.creds.registered) {
        await delay(1500);
        const cleanNumber = num.replace(/[^0-9]/g, "");
        const code = await PrabathPairWeb.requestPairingCode(cleanNumber);
        if (!res.headersSent) {
          await res.send({ code });
        }

        // Auto-clean session folder if not paired within 2 minutes
        setTimeout(() => {
          if (!PrabathPairWeb.authState.creds.registered) {
            console.log("⏳ Pairing not completed, cleaning:", sessionFolder);
            removeFile(sessionFolder);
            try { PrabathPairWeb.logout(); } catch {}
          }
        }, 2 * 60 * 1000);
      }

      PrabathPairWeb.ev.on("creds.update", saveCreds);

      PrabathPairWeb.ev.on("connection.update", async (s) => {
        const { connection, lastDisconnect } = s;

        if (connection === "open") {
          try {
            await delay(10000);
            const user_jid = jidNormalizedUser(PrabathPairWeb.user.id);

            function randomMegaId(length = 6, numberLength = 4) {
              const characters =
                "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
              let result = "";
              for (let i = 0; i < length; i++) {
                result += characters.charAt(
                  Math.floor(Math.random() * characters.length),
                );
              }
              const number = Math.floor(
                Math.random() * Math.pow(10, numberLength),
              );
              return `${result}${number}`;
            }

            const mega_url = await upload(
              fs.createReadStream(`${sessionFolder}/creds.json`),
              `${randomMegaId()}.json`,
            );

            const sid = mega_url.replace("https://mega.nz/file/", "");

            await PrabathPairWeb.sendMessage(user_jid, {
              text: sid,
            });
          } catch (e) {
            console.log("❌ Failed to send session:", e);
            exec("pm2 restart prabath");
          }

          await delay(100);
          removeFile(sessionFolder);
          process.exit(0);
        } else if (
          connection === "close" &&
          lastDisconnect &&
          lastDisconnect.error &&
          lastDisconnect.error.output.statusCode !== 401
        ) {
          console.log("⚠️ Connection closed, retrying...");
          await delay(10000);
          removeFile(sessionFolder);
          PrabathPair();
        }
      });
    } catch (err) {
      console.log("🔥 Pairing error:", err);
      exec("pm2 restart prabath-md");
      removeFile(sessionFolder);
      if (!res.headersSent) {
        await res.send({ code: "Service Unavailable" });
      }
    }
  }

  return await PrabathPair();
});

process.on("uncaughtException", function (err) {
  console.log("❗ Uncaught exception:", err);
  exec("pm2 restart prabath");
});

module.exports = router;
