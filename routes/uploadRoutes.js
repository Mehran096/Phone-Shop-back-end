// server/routes/uploadRoutes.js
const path = require('path');
const express = require('express');
const multer = require('multer');
const { protect, admin } = require('../middleware/auth.js'); // <-- add admin
const { createStorage } = require('../utils/cloudinary.js');
const { deleteImage } = require('../controllers/uploadController.js'); 

const router = express.Router();

// V8.6: POST /api/upload/reviews  OR  /api/upload/products
router.post('/:type', protect, async (req, res) => {
  const { type } = req.params; // 'reviews' or 'products'
  
  if (!['reviews', 'products'].includes(type)) {
    return res.status(400).json({ message: 'Invalid type. Use reviews or products' });
  }

  // V8.6 KEY: Only admins can use products folder
  if (type === 'products' && !req.user.isAdmin) {
    return res.status(403).json({ message: 'Admin only' });
  }

  const upload = multer({ storage: createStorage(type) }).single('image');
  
  upload(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message });
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    
    res.status(200).json({ url: req.file.path, public_id: req.file.filename }); // <-- V8.5 format for frontend
  });
});

// V9.9 KEY: ADD THIS DELETE ROUTE FOR `❌` BUTTON L75 Frontend
// V9.14 KEY: Express v4 safe regex. Catches everything after /
router.delete(/^\/public_id\/(.+)/, protect, admin, deleteImage); 

module.exports = router;