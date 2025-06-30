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

  // Generate a unique session folder per request
  const sessionFolder = `./session_${crypto.randomBytes(6).toString("hex")}`;

  async function PrabathPair() {
    const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);

    // Timeout to cleanup if pairing not completed within 2 mins
    let pairingTimeout = setTimeout(() => {
      console.log(`Pairing timeout for ${num}, cleaning up session folder.`);
      removeFile(sessionFolder);
      try {
        // Optional: exit or logout socket here if you keep reference
      } catch {}
    }, 2 * 60 * 1000); // 2 minutes

    try {
      let DanuwaPairWeb = makeWASocket({
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
          clearTimeout(pairingTimeout); // clear timeout when paired
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
            console.log("Upload or sendMessage failed:", e);
            exec("pm2 restart prabath");
          } finally {
            await delay(1000);
            removeFile(sessionFolder);
            process.exit(0);
          }
        } else if (
          connection === "close" &&
          lastDisconnect &&
          lastDisconnect.error &&
          lastDisconnect.error.output.statusCode !== 401
        ) {
          clearTimeout(pairingTimeout);
          console.log("Connection closed without 401 error, retrying...");
          removeFile(sessionFolder);
          await delay(5000);
          PrabathPair();
        }
      });
    } catch (err) {
      clearTimeout(pairingTimeout);
      console.log("Main pairing error:", err);
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
