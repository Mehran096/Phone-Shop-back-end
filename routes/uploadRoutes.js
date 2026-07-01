// server/routes/uploadRoutes.js
const path = require('path');
const express = require('express');
const multer = require('multer');
const asyncHandler = require('express-async-handler');
const { protect, admin } = require('../middleware/auth.js'); // <-- add admin
const { createStorage } = require('../utils/cloudinary.js');
const { deleteImage } = require('../controllers/uploadController.js');  
const { cloudinary } = require('../utils/cloudinary.js'); // <-- must have { }
const Product = require('../models/Product.js')

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
    
   const publicIdNoExt = req.file.filename.replace(/\.[^/.]+$/, ""); // <-- V31.46 KILL .jpg
res.status(200).json({ 
  url: req.file.path, 
  public_id: publicIdNoExt // <-- V31.46 'products/178...' NO .jpg
}); // <-- V8.5 format for frontend
  });
});

// V9.9 KEY: ADD THIS DELETE ROUTE FOR `❌` BUTTON L75 Frontend
// V9.14 KEY: Express v4 safe regex. Catches everything after /
// V31.34 KEY: We only read from req.body. No params.
router.delete('/', asyncHandler(async (req, res) => {
  const { publicId, productId, vIndex, cIndex } = req.body; // V31.34 = 'products/1712345678-abc123'

  if (!publicId) {
    res.status(400);
    throw new Error('publicId is required');
  }

  //console.log('V31.85 DELETE ATTEMPT:', { publicId, productId, vIndex, cIndex });

  // 1. CLOUDINARY: Use exact string from DB. NO folder add, NO ext add.
  // 1. CLOUDINARY: Use exact string from DB. NO folder add, NO ext add.
const result = await cloudinary.uploader.destroy(publicId); 
console.log('V31.88 2. CLOUDINARY RESULT:', result);

if (result.result === 'error') {
  res.status(400);
  throw new Error(`Cloudinary failed: ${result.message}`);
}
  
console.log('V31.88 CLOUDINARY: DELETED ✅'); // 'ok' or 'not found' both land here

  // 2. MONGODB: V31.84 DISABLED = CLOUDINARY ONLY MODE
  // if (productId && vIndex !== undefined) {
  //   console.log('V31.74 === START DEBUG ===');
  //   console.log('V31.74 1. FROM FRONTEND:', publicId);
  //
  //   const product = await Product.findById(productId).lean();
  //   const dbArray = product.variants[vIndex].colors.map(c => c.imagePublicIds).flat();
  //   console.log('V31.74 2. DB HAS NOW:', dbArray);
  //
  //   let pid = publicId;
  //   if (pid.includes('cloudinary.com')) {
  //     pid = pid.split('/upload/')[1] || pid;
  //   }
  //   pid = pid.replace(/^\d+\//, '').replace(/\.[^.]+$/, "");
  //   console.log('V31.74 3. CLEANED PID:', pid);
  //
  //   const safeId = pid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  //   const pullResult = await Product.updateOne(
  //     { _id: productId },
  //     { $pull: { [`variants.${vIndex}.colors.$[].imagePublicIds`]: { $regex: `^${safeId}` } }
  //   );
  //   console.log('V31.74 5. RESULT:', pullResult);
  //   console.log('V31.74 === END DEBUG ===');
  // }

  res.status(200).json({ message: 'Image deleted from Cloudinary only' }); // V31.84

}));


module.exports = router;