// server/routes/uploadRoutes.js
const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const asyncHandler = require('express-async-handler');
const { protect, admin } = require('../middleware/auth.js'); // <-- add admin
const { createStorage } = require('../utils/cloudinary.js');
const { deleteImage } = require('../controllers/uploadController.js');  
const { cloudinary } = require('../utils/cloudinary.js'); // <-- must have { }
const Product = require('../models/Product.js')

const router = express.Router();

// V8.6: POST /api/upload/products
// V34.06: POST /api/upload/products - PRODUCTS ONLY
router.post('/products', protect, asyncHandler(async (req, res) => {
  // V34.06 KEY: Admin only for products
  if (!req.user.isAdmin) {
    return res.status(403).json({ message: 'Admin only' });
  }

  // V34.06 KEY: Products = 100 files max. Reviews = 3 max in other route
  const upload = multer({ storage: createStorage('products') }).array('images', 100); // V34.06 KEY: 5

  upload(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message });
    const files = req.files && req.files.length > 0 ? req.files : (req.file ? [req.file] : []);
    if (files.length === 0) return res.status(400).json({ message: 'No file uploaded' });
    
    const uploaded = files.map(file => ({ 
      url: file.path, 
      imagePublicId: file.filename.replace(/\.[^/.]+$/, "") // V34.06 KEY: use imagePublicId
    }));
    res.status(200).json(uploaded);
  });
}));

// V33.75 KEY 1: REVIEWS ROUTE ONLY - 3 FILES MAX
// V33.79 REPLACE WHOLE /reviews ROUTE
router.post('/reviews', protect, (req, res) => {
  const upload = multer({ storage: createStorage('reviews') }).array('images', 3);
  
  upload(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message });
    
    const files = req.files || [];
    
    // V33.80 KEY: File is optional. Return empty array if no files
    const uploaded = files.map((file) => ({ 
      url: file.path,           // Cloudinary URL 
      imagePublicId: file.filename // public_id
    }));
    
    return res.status(200).json(uploaded); // V33.80 KEY: [] if no files = 200 OK
  });
});

// V9.9 KEY: ADD THIS DELETE ROUTE FOR `❌` BUTTON L75 Frontend
// V9.14 KEY: Express v4 safe regex. Catches everything after /
// V31.34 KEY: We only read from req.body. No params.
// V38.47 KEY: BATCH DELETE FOR UPDATE BUTTON
router.post('/delete', asyncHandler(async (req, res) => {
  const { publicIds } = req.body;
  console.log('V38.49 DELETE REQUEST:', publicIds);

  const result = await cloudinary.api.delete_resources(publicIds, { // KEY CHANGE
    resource_type: 'image',
    invalidate: true
  });
  
  console.log('V38.49 CLOUDINARY RESULT:', result);
  res.json({ deleted: result.deleted });
}));


module.exports = router;