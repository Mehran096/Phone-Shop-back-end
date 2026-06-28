const { cloudinary } = require('../utils/cloudinary.js'); // <-- V9.21 KEY: Add { } 
const asyncHandler = require('express-async-handler');

 
// @access  Private/Admin
const deleteImage = asyncHandler(async (req, res) => {
  const public_id = req.params[0]; // <-- V9.12 KEY: `*` puts everything after /public_id/ into [0]
  
  if (!public_id) { 
    res.status(400); 
    throw new Error('public_id is required'); 
  }

  const result = await cloudinary.uploader.destroy(public_id);
  console.log('Cloudinary Result:', result); 
  if (result.result === 'error') {
    res.status(400); 
    throw new Error(result.error?.message || 'Cloudinary delete failed');
  }
  
  res.status(200).json({ message: 'Image deleted', result: result.result });
});

module.exports = { deleteImage }; // <-- CommonJS