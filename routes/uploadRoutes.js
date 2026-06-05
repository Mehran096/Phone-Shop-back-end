const path = require('path');
const express = require('express');
const multer = require('multer');
const { protect } = require('../middleware/auth.js');
const { storage } = require('../utils/cloudinary.js');

const router = express.Router();
const upload = multer({ storage });

router.post('/', protect, upload.single('image'), (req, res) => {
  res.send({
    message: 'Image uploaded',
    image: req.file.path, // Cloudinary URL
  });
});

module.exports = router;