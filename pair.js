const express = require("express");
const fs = require("fs");
const { exec } = require("child_process");
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

const router = express.Router();

function removeFile(FilePath) {
  if (!fs.existsSync(FilePath)) return false;
  fs.rmSync(FilePath, { recursive: true, force: true });
}

router.get("/", async (req, res) => {
  let num = req.query.number;

  async function PrabathPair() {
    const { state, saveCreds } = await useMultiFileAuthState(`./session`);

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

      DanuwaPairWeb.ev.on("connection.update", async (s) => {
        const { connection, lastDisconnect } = s;

        if (connection === "open") {
          try {
            await delay(10000);
            const auth_path = "./session/";
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
              fs.createReadStream(auth_path + "creds.json"),
              `${randomMegaId()}.json`
            );

            const sid = mega_url.replace("https://mega.nz/file/", "");

            await DanuwaPairWeb.sendMessage(user_jid, {
              text: `⚡ Ｄ Ａ Ｎ Ｕ Ｗ Ａ － Ｍ Ｄ ⚡
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
    ⚡ Ｄ Ａ Ｎ Ｕ Ｗ Ａ － Ｍ Ｄ ⚡`,});
            await delay(500); // slight delay before sending session
            await DanuwaPairWeb.sendMessage(user_jid, {
              text: `🧾 *Your Session ID:*
              
${sid}`,
            });
          } catch (e) {
            console.log("Upload or sendMessage failed:", e);
            exec("pm2 restart prabath");
          } finally {
            await delay(1000);
            removeFile("./session");
            process.exit(0);
          }
        } else if (
          connection === "close" &&
          lastDisconnect &&
          lastDisconnect.error &&
          lastDisconnect.error.output.statusCode !== 401
        ) {
          await delay(10000);
          PrabathPair();
        }
      });
    } catch (err) {
      console.log("Main pairing error:", err);
      exec("pm2 restart prabath-md");
      await removeFile("./session");
      if (!res.headersSent) {
        await res.send({ code: "ERROR" });
      }
    }
  }

  PrabathPair();
});

module.exports = router;
