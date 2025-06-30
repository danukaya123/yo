const express = require("express");
const fs = require("fs");
const { exec } = require("child_process");
const pino = require("pino");
const crypto = require("crypto");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  delay,
  makeCacheableSignalKeyStore,
  Browsers,
  jidNormalizedUser,
} = require("@whiskeysockets/baileys");
const { upload } = require("./mega");

const router = express.Router();

function removeFile(FilePath) {
  if (!fs.existsSync(FilePath)) return false;
  fs.rmSync(FilePath, { recursive: true, force: true });
}

router.get("/", async (req, res) => {
  let num = req.query.number;
  if (!num) return res.status(400).send({ error: "Missing number parameter" });

  const sessionFolder = `./session_${crypto.randomBytes(6).toString("hex")}`;
  let retryCount = 0;
  const MAX_RETRIES = 5;

  async function PrabathPair() {
    const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
    let pairingTimeout;

    try {
      const DanuwaPairWeb = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(
            state.keys,
            pino({ level: "fatal" }).child({ level: "fatal" })
          ),
        },
        printQRInTerminal: false,
        logger: pino({ level: "fatal" }).child({ level: "fatal" }),
        browser: Browsers.macOS("Safari"),
      });

      pairingTimeout = setTimeout(() => {
        console.log(`❌ Pairing timeout for ${num}. Cleaning up.`);
        removeFile(sessionFolder);
        try {
          DanuwaPairWeb.logout().catch(() => {});
        } catch {}
      }, 2 * 60 * 1000);

      if (!DanuwaPairWeb.authState.creds.registered) {
        await delay(1500);
        num = num.replace(/[^0-9]/g, "");
        const code = await DanuwaPairWeb.requestPairingCode(num);
        if (!res.headersSent) {
          await res.send({ code });
        }
      }

      DanuwaPairWeb.ev.on("creds.update", saveCreds);

      DanuwaPairWeb.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === "open") {
          clearTimeout(pairingTimeout);
          try {
            await delay(10000);
            const user_jid = jidNormalizedUser(DanuwaPairWeb.user.id);

            function randomMegaId(length = 6, numberLength = 4) {
              const characters =
                "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
              let result = "";
              for (let i = 0; i < length; i++) {
                result += characters.charAt(
                  Math.floor(Math.random() * characters.length)
                );
              }
              const number = Math.floor(
                Math.random() * Math.pow(10, numberLength)
              );
              return `${result}${number}`;
            }

            const mega_url = await upload(
              fs.createReadStream(sessionFolder + "/creds.json"),
              `${randomMegaId()}.json`
            );

            const sid = mega_url.replace("https://mega.nz/file/", "");
            const imageBuffer = fs.readFileSync("./Danuwa - MD.png");

            await DanuwaPairWeb.sendMessage(user_jid, {
              image: imageBuffer,
              caption: `⚡ Ｄ Ａ Ｎ Ｕ Ｗ Ａ － Ｍ Ｄ ⚡
════════════════════════     
🚀 Session Generated Successfully!
🔐 Your session is now securely encoded and ready to use. This is your unique access key to unleash all features of 👇✅

    ⚡ Ｄ Ａ Ｎ Ｕ Ｗ Ａ － Ｍ Ｄ ⚡
════════════════════════
📌 *Important Notes:*
🔸 Store your Session ID safely.
🔸 Do *NOT* share it with anyone.
🔸 This grants access to your bot instance.

🛠️ Need Help?
Contact support anytime. We're here for you!
─────────────────────────
❤️ Thanks for using 
    ⚡ Ｄ Ａ Ｎ Ｕ Ｗ Ａ － Ｍ Ｄ ⚡`,
            });

            await delay(500);
            await DanuwaPairWeb.sendMessage(user_jid, { text: sid });
          } catch (e) {
            console.log("❌ Upload or sendMessage failed:", e);
            exec("pm2 restart prabath");
          } finally {
            await delay(1000);
            removeFile(sessionFolder);
            process.exit(0);
          }
        } else if (connection === "close") {
          clearTimeout(pairingTimeout);

          console.log("⚠️ Connection closed.");
          if (
            lastDisconnect &&
            lastDisconnect.error &&
            lastDisconnect.error.output.statusCode !== 401
          ) {
            console.log("⚠️ Connection closed without 401 error:", JSON.stringify(lastDisconnect, null, 2));

            if (retryCount < MAX_RETRIES) {
              retryCount++;
              console.log(`🔁 Retrying attempt ${retryCount}/${MAX_RETRIES}...`);
              removeFile(sessionFolder);
              await delay(5000);
              PrabathPair();
            } else {
              console.log("❌ Max retries reached. Stopping.");
              removeFile(sessionFolder);
            }
          }
        }
      });
    } catch (err) {
      clearTimeout(pairingTimeout);
      console.log("🔥 Main pairing error:", err);
      removeFile(sessionFolder);
      exec("pm2 restart prabath-md");
      if (!res.headersSent) {
        await res.send({ code: "ERROR" });
      }
    }
  }

  PrabathPair();
});

module.exports = router;
