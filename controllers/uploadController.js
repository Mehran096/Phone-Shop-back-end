const Product = require('../models/Product')
const { cloudinary } = require('../utils/cloudinary.js'); // <-- V9.21 KEY: Add { } 
const asyncHandler = require('express-async-handler');

 
// @access  Private/Admin
const deleteImage = asyncHandler(async (req, res) => {
  const public_id = req.params[0]; // <-- from /* route
  const { productId, vIndex, cIndex } = req.query; // <-- V30.55: send these from frontend

  if (!public_id) {
    res.status(400);
    throw new Error('public_id is required');
  }

  // 1. Delete from Cloudinary
  const result = await cloudinary.uploader.destroy(public_id);
  if (result.result!== 'ok' && result.result!== 'not found') {
    res.status(400);
    throw new Error(result.error?.message || 'Cloudinary delete failed');
  }

  // 2. Delete from MongoDB if productId given
  if (productId && vIndex && cIndex) {
    await Product.updateOne(
      { _id: productId },
      { $pull: { [`variants.${vIndex}.colors.${cIndex}.images`] : { imagePublicId: public_id }}}
    );
  }

  res.status(200).json({ message: 'Image deleted', result: result.result });
});

module.exports = { deleteImage }; // <-- CommonJS