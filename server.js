/**************************************
 * server.js
 **************************************/
const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const multer = require("multer");
const fetch = require("node-fetch"); // ← Yeni satır

// 🚨 Telegram ayarları
const BOT_TOKEN = "7603337087:AAFsvETD3OIQRAy68IayHyZKgiZpvaUdmew";
const CHAT_ID   = "7425618486";

// -- Firebase Admin SDK import --
const admin = require("firebase-admin");
const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);

// Initialize Firebase App
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Get Firestore reference
const db = admin.firestore();

const app = express();
app.use(express.json());
app.use(cors());

// Check and create necessary folders
const ordersFolder = "public/orders";
const imagesFolder = path.join(ordersFolder, "images");
if (!fs.existsSync(ordersFolder)) fs.mkdirSync(ordersFolder, { recursive: true });
if (!fs.existsSync(imagesFolder)) fs.mkdirSync(imagesFolder, { recursive: true });

// Multer configuration (only accepts JPG and PNG)
const storage = multer.diskStorage({
  destination: imagesFolder,
  filename: (req, file, cb) => {
    const uniqueName = `${req.body.walletAddress}_${Date.now()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});
const fileFilter = (req, file, cb) => {
  const fileTypes = /jpeg|jpg|png/;
  const isValid = fileTypes.test(file.mimetype) && fileTypes.test(path.extname(file.originalname).toLowerCase());
  cb(null, isValid);
};
const upload = multer({ storage, fileFilter });

// ✅ Health check endpoint
app.get("/", (req, res) => {
  res.send("✅ Backend & Telegram bot çalışıyor! POST /save-order ile işlem yapabilirsiniz.");
});

// 📦 Save order + Telegram bildirim
app.post("/save-order", upload.single("image"), async (req, res) => {
  // Zorunlu alanlar
  if (!req.file && !req.body.imageLink) {
    return res.status(400).send("boşluklar var!");
  }
  const { walletAddress, name, symbol, supply, decimals, description, imageLink } = req.body;
  if (!walletAddress || !name || !symbol || !supply || !decimals || !description || !imageLink) {
    return res.status(400).send("Eksik zorunlu alanlar var.");
  }

  // Eğer imageLink varsa, dosyayı sil
  if (req.file && imageLink) {
    fs.unlink(req.file.path, () => {});
  }

  // Firestore'a kaydedilecek veri
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
    // Firestore kaydı
    const docRef = await db.collection("orders").add(orderData);

    // Telegram bildirimi
    const text = `
🆕 *Yeni Sipariş!*
• Ad: ${orderData.name}
• Sembol: ${orderData.symbol}
• Cüzdan: ${orderData.walletAddress}
• Zaman: ${orderData.time}
`;
    await fetch(`https://api.telegram.org/bot${7603337087:AAFsvETD3OIQRAy68IayHyZKgiZpvaUdmew}/sendMessage`, {
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
  } catch (error) {
    console.error("❌ Hata:", error);
    return res.status(500).send("Bir hata oluştu. Lütfen tekrar deneyin.");
  }
});

// 🟢 Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server http://localhost:${PORT} üzerinde çalışıyor.`);
});
