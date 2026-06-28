// server/utils/cloudinary.js V8.6 FACTORY
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
  api_key: process.env.CLOUDINARY_API_KEY, 
  api_secret: process.env.CLOUDINARY_API_SECRET 
});

// V8.6 KEY: Function that returns storage. Not 1 fixed storage.
const createStorage = (folder) => new CloudinaryStorage({
  cloudinary,
  params: { 
    folder, // 'products' OR 'reviews'
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    resource_type: 'image',
    public_id: (req, file) => `${Date.now()}-${file.originalname.split('.')[0]}`,
  },
});

module.exports = { cloudinary, createStorage }; // <-- NAMED EXPORT