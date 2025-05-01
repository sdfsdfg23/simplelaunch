/**************************************
 * server.js
 **************************************/

const express = require("express");
const fs      = require("fs");
const path    = require("path");
const cors    = require("cors");
const multer  = require("multer");
const fetch   = require("node-fetch");

// Telegram token ve chat ID’yi ENV’den okuyun
// Render’da veya cPanel’de ENV olarak ayarlayın:
// TELEGRAM_TOKEN="token"
// TELEGRAM_CHAT_ID="id"
const BOT_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID   = process.env.TELEGRAM_CHAT_ID;

// Firebase Admin SDK import ve init
const admin          = require("firebase-admin");
const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

// Express setup
const app = express();
app.use(express.json());
app.use(cors());

// Ensure upload folders exist
const ordersFolder = "public/orders";
const imagesFolder = path.join(ordersFolder, "images");
if (!fs.existsSync(ordersFolder)) fs.mkdirSync(ordersFolder, { recursive: true });
if (!fs.existsSync(imagesFolder)) fs.mkdirSync(imagesFolder, { recursive: true });

// Multer configuration
const storage = multer.diskStorage({
  destination: imagesFolder,
  filename: (req, file, cb) => {
    cb(null, `${req.body.walletAddress}_${Date.now()}${path.extname(file.originalname)}`);
  }
});
const fileFilter = (req, file, cb) => {
  const valid = /jpeg|jpg|png/.test(file.mimetype)
             && /jpeg|jpg|png/.test(path.extname(file.originalname).toLowerCase());
  cb(null, valid);
};
const upload = multer({ storage, fileFilter });

// Health check endpoint
app.get("/", (_req, res) => {
  res.send("✅ Backend & Telegram bot çalışıyor!");
});

// Save-order + Telegram notification
app.post("/save-order", upload.single("image"), async (req, res) => {
  // Validate fields
  if (!req.file && !req.body.imageLink) {
    return res.status(400).send("Boş alanlar var!");
  }
  const { walletAddress, name, symbol, supply, decimals, description, imageLink } = req.body;
  if (![walletAddress, name, symbol, supply, decimals, description, imageLink].every(Boolean)) {
    return res.status(400).send("Eksik zorunlu alanlar var.");
  }

  // If both file and imageLink provided, delete the uploaded file
  if (req.file && imageLink) fs.unlink(req.file.path, () => {});

  // Prepare data
  const orderData = {
    walletAddress,
    name,
    symbol,
    supply,
    decimals,
    description,
    imagePath: imageLink,
    time: new Date().toLocaleString(),
  };

  try {
    // 1) Save to Firestore
    await db.collection("orders").add(orderData);

    // === DEBUG LOGS ===
    console.log("🔑 TELEGRAM_TOKEN:", BOT_TOKEN);
    console.log("🔑 TELEGRAM_CHAT_ID:", CHAT_ID);

    // 2) Send Telegram message
    const text =
      "🆕 *Yeni Sipariş!*\n" +
      `• Ad: ${orderData.name}\n` +
      `• Sembol: ${orderData.symbol}\n` +
      `• Açıklama: ${orderData.description}\n` +
      `• Görsel: ${orderData.imagePath}\n` +
      `• Cüzdan: ${orderData.walletAddress}\n` +
      `• Zaman: ${orderData.time}`;

    let resp, json;
    try {
      resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: CHAT_ID,
          text,
          parse_mode: "Markdown"
        })
      });
      console.log("📤 Telegram API status:", resp.status);
      json = await resp.json();
      console.log("📨 Telegram API response:", json);
    } catch (e) {
      console.error("❌ Telegram fetch error:", e);
    }

    console.log("✅ Sipariş kaydedildi ve Telegram bildirimi gönderildi!");
    return res.send("Sipariş başarıyla kaydedildi (Firestore + Telegram)!");
  } catch (err) {
    console.error("❌ Hata:", err);
    return res.status(500).send("Bir hata oluştu. Lütfen tekrar deneyin.");
  }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server http://localhost:${PORT} üzerinde çalışıyor.`);
});
