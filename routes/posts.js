const express = require("express");
const jwt = require("jsonwebtoken");
const Post = require("../models/Post");
const multer = require("multer");
const admin = require("firebase-admin");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const authenticate = (req, res, next) => {
  try {
    const token = req.header("Authorization").replace("Bearer ", "");
    const decoded = jwt.verify(token, "your_jwt_secret");
    req.userId = decoded.userId;
    next();
  } catch (error) {
    res.status(401).json({ error: "Please authenticate" });
  }
};

const uploadToFirebase = async (file) => {
  const bucket = admin.storage().bucket();
  const fileName = `${Date.now()}_${file.originalname}`;
  const fileUpload = bucket.file(fileName);

  const blobStream = fileUpload.createWriteStream({
    metadata: {
      contentType: file.mimetype,
    },
  });

  return new Promise((resolve, reject) => {
    blobStream.on("error", (error) => reject(error));
    blobStream.on("finish", async () => {
      const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(fileName)}?alt=media`;
      resolve(publicUrl);
    });
    blobStream.end(file.buffer);
  });
};

router.post("/", authenticate, upload.single("imageUrl"), async (req, res) => {
  try {
    const { postName, description, tags } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: "No image file provided" });
    }

    const imageUrl = await uploadToFirebase(req.file);

    const post = new Post({
      userId: req.userId,
      postName,
      description,
      tags: tags ? tags.split(",") : [],
      imageUrl,
    });

    await post.save();
    res.status(201).json(post);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get("/", async (req, res) => {
  try {
    const { searchText, startDate, endDate, tags } = req.query;
    let query = {};

    if (searchText) {
      query.$or = [
        { postName: { $regex: searchText, $options: "i" } },
        { description: { $regex: searchText, $options: "i" } },
      ];
    }

    if (startDate && endDate) {
      query.uploadTime = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }

    if (tags) {
      query.tags = { $in: tags.split(",") };
    }

    const posts = await Post.find(query).sort({ uploadTime: -1 });
    res.json(posts);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;