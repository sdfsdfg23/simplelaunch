/**************************************
 * server.js
 **************************************/
const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const multer = require("multer");

// -- Firebase Admin SDK import --
const admin = require("firebase-admin");
const serviceAccount = require("./firebaseServiceKey.json");

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

if (!fs.existsSync(ordersFolder)) {
  fs.mkdirSync(ordersFolder, { recursive: true });
}
if (!fs.existsSync(imagesFolder)) {
  fs.mkdirSync(imagesFolder, { recursive: true });
}

// Multer configuration (only accepts JPG and PNG)
// This middleware will process file uploads.
const storage = multer.diskStorage({
  destination: imagesFolder,
  filename: (req, file, cb) => {
    const uniqueName = `${req.body.walletAddress}_${Date.now()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const fileFilter = (req, file, cb) => {
  const fileTypes = /jpeg|jpg|png/;
  const mimeType = fileTypes.test(file.mimetype);
  const extName = fileTypes.test(path.extname(file.originalname).toLowerCase());

  if (mimeType && extName) {
    return cb(null, true);
  } else {
    return cb(new Error("Only images (JPG, PNG) are allowed!"));
  }
};

const upload = multer({ storage, fileFilter });

// API: Save order (with image upload and image link)
app.post("/save-order", upload.single("image"), async (req, res) => {
  console.log("Received File:", req.file);

  // If neither a file nor an imageLink is provided, return an error.
  if (!req.file && !req.body.imageLink) {
    return res.status(400).send("boşluklar var!");
  }

  const { walletAddress, name, symbol, supply, decimals, description, imageLink } = req.body;

  // Check for required fields. Note that now imageLink is required.
  if (!walletAddress || !name || !symbol || !supply || !decimals || !description || !imageLink) {
    console.error("Eksik alanlar:", req.body);
    return res.status(400).send("Eksik zorunlu alanlar var.");
  }

  // If an imageLink is provided and a file was also uploaded, delete the file so it is not stored.
  if (imageLink && req.file) {
    fs.unlink(req.file.path, (err) => {
      if (err) console.error("File deletion failed:", err);
      else console.log("Uploaded file deleted since imageLink was provided.");
    });
  }

  // Use the provided imageLink as the imagePath
  const imageFilePath = imageLink;

  try {
    // Data to save in Firestore
    const orderData = {
      walletAddress,
      name,
      symbol,
      supply,
      decimals,
      description,
      imagePath: imageFilePath,
      time: new Date().toLocaleString(),
    };

    // Add data to Firestore
    const docRef = await db.collection("orders").add(orderData);

    console.log("✅ Sipariş başarıyla Firestore'a kaydedildi! Belge ID:", docRef.id);
    console.log("📁 Kayıtlı resimler:", fs.readdirSync(imagesFolder));

    return res.send("Sipariş başarıyla kaydedildi (Firestore)!");
  } catch (error) {
    console.error("❌ Firestore kaydı başarısız:", error);
    return res.status(500).send("Bir hata oluştu. Lütfen daha sonra tekrar deneyiniz.");
  }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server http://localhost:${PORT} adresinde çalışıyor.`);
});
