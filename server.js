/**************************************
 * server.js
 **************************************/

const express = require("express");
const fs      = require("fs");
const path    = require("path");
const cors    = require("cors");
const multer  = require("multer");
const fetch   = require("node-fetch");

// 🔐 Telegram token ve chat ID’yi ENV’den oku
const BOT_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID   = process.env.TELEGRAM_CHAT_ID;

// -- Firebase Admin SDK import --
const admin           = require("firebase-admin");
const serviceAccount  = JSON.parse(process.env.FIREBASE_KEY);

// Initialize Firebase App
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db  = admin.firestore();
const app = express();

app.use(express.json());
app.use(cors());

// Ensure folders exist
const ordersFolder = "public/orders";
const imagesFolder = path.join(ordersFolder, "images");
if (!fs.existsSync(ordersFolder)) fs.mkdirSync(ordersFolder, { recursive: true });
if (!fs.existsSync(imagesFolder)) fs.mkdirSync(imagesFolder, { recursive: true });

// Multer setup
const storage = multer.diskStorage({
  destination: imagesFolder,
  filename: (req, file, cb) =>
    cb(null, `${req.body.walletAddress}_${Date.now()}${path.extname(file.originalname)}`),
});
const fileFilter = (req, file, cb) => {
  const valid = /jpeg|jpg|png/.test(file.mimetype) &&
                /jpeg|jpg|png/.test(path.extname(file.originalname).toLowerCase());
  cb(null, valid);
};
const upload = multer({ storage, fileFilter });

// Health-check
app.get("/", (_req, res) => {
  res.send("✅ Backend & Telegram bot çalışıyor!");
});

// Save-order + Telegram notification
app.post("/save-order", upload.single("image"), async (req, res) => {
  // Validate
  if (!req.file && !req.body.imageLink) {
    return res.status(400).send("Boş alanlar var!");
  }
  const { walletAddress, name, symbol, supply, decimals, description, imageLink } = req.body;
  if (!walletAddress || !name || !symbol || !supply || !decimals || !description || !imageLink) {
    return res.status(400).send("Eksik zorunlu alanlar var.");
  }

  // If file uploaded but imageLink used, delete the file
  if (req.file && imageLink) fs.unlink(req.file.path, () => {});

  // Prepare Firestore data
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

    // 2) Send Telegram message
    const text = `
🆕 *Yeni Sipariş!*
• Ad: ${orderData.name}
• Sembol: ${orderData.symbol}
• Cüzdan: ${orderData.walletAddress}
• Zaman: ${orderData.time}
`;
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
        parse_mode: "Markdown",
      }),
    });

    console.log("✅ Sipariş kaydedildi ve Telegram bildirimi gönderildi!");
    return res.send("Sipariş başarıyla kaydedildi (Firestore + Telegram)!");
  } catch (err) {
    console.error("❌ Hata:", err);
    return res.status(500).send("Bir hata oluştu. Lütfen tekrar deneyin.");
  }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`✅ Server http://localhost:${PORT} üzerinde çalışıyor.`)
);
