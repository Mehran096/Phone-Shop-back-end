const Product = require('../models/Product');
const { cloudinary } = require('../utils/cloudinary.js'); // <-- must have { }
const asyncHandler = require('express-async-handler');

// @access  Private/Admin
const deleteImage = asyncHandler(async (req, res) => {
  let public_id = req.query.public_id;
  const vIndex = Number(req.query.vIndex);
  const cIndex = Number(req.query.cIndex);
  const productId = req.query.productId;

  if (!public_id) {
    res.status(400);
    throw new Error('public_id is required');
  }

  public_id = public_id.replace(/^products\//, '').replace(/\.(jpg|jpeg|png|webp|avif)$/i, ''); // <-- V30.94 STRIP FOLDER FIRST
console.log('CHECK CLOUDINARY FOR THIS:', public_id);

  console.log('1. FROM FRONTEND:', public_id); // Should now be clean

 const result = await cloudinary.uploader.destroy(public_id);
console.log('2. CLOUDINARY RESULT:', result);

if (result.result === 'ok') {
  console.log('CLOUDINARY: DELETED ✅'); // <-- V30.83
} else if (result.result === 'not found') {
  console.log('CLOUDINARY: ALREADY GONE, CLEANING DB ONLY ⚠️'); // <-- V30.83
} else {
  res.status(400);
  throw new Error(`Cloudinary failed: ${result.result}`); // Only fail on real errors
}

// 2. ALWAYS RUN DB DELETE IF PRODUCTID EXISTS
// V31.57 DELETE FROM DB ON X CLICK - ALL COLORS, ALL SUFFIXES
if (productId && vIndex != undefined) { // <-- V31.57 REMOVED cIndex
  console.log('V31.57 DELETING FROM DB:', publicId);

  const pullResult = await Product.updateOne(
    { _id: productId }, // <-- V31.57
    { $pull: { [`variants.${vIndex}.colors.$[].imagePublicIds`]: { $regex: `^${publicId}` }}} // <-- V31.57 $[] + REGEX KEY
  );
  
  console.log('V31.57 MONGODB: PULLED RESULT:', pullResult.modifiedCount, 'doc(s)'); // <-- V31.57
}

res.json({ message: 'Image deleted from DB' }); // <-- V30.83
});

module.exports = { deleteImage };