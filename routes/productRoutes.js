const express = require('express')
const router = express.Router()
const {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  createProductReview,
  updateProductSpecs,
} = require('../controllers/productController')

const { protect, admin } = require('../middleware/auth.js')

const multer = require('multer')
const { storage } = require('../utils/cloudinary.js')
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } })

// Dynamic fields for up to 10 colors, 10 images each
const colorFields = Array.from({ length: 10 }, (_, i) => ({
  name: `colorImages-${i}`,
  maxCount: 10,
}))

router.route('/')
  .get(getProducts)
  .post(protect, admin, upload.fields(colorFields), createProduct)

router.route('/:id')
  .get(getProductById)
  .put(protect, admin, upload.fields(colorFields), updateProduct)
  .delete(protect, admin, deleteProduct)

router.route('/:id/specs').put(protect, admin, updateProductSpecs)
router.route('/:id/reviews').post(protect, createProductReview)

module.exports = router