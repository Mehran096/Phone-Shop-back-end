const express = require('express')
const router = express.Router()
const {
  createProduct,
  getProducts,
  getProductById,
  getProductBySlug,
  updateProduct,
  getBestSellerProducts,
  deleteProduct,
  createProductReview,
  getProductReviews,
  updateProductSpecs,
  updateProductReview,
  deleteProductReview,
  markReviewHelpful,
  markReviewNotHelpful,
  addAdminReply,
  editAdminReply,
  deleteAdminReply
} = require('../controllers/productController')

const { protect, admin } = require('../middleware/auth.js')

//const multer = require('multer')
//const { storage } = require('../utils/cloudinary.js')
//const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } })

// Dynamic fields for up to 10 colors, 10 images each
// const colorFields = Array.from({ length: 10 }, (_, i) => ({
//   name: `colorImages-${i}`,
//   maxCount: 10,
// }))

router.route('/')
  .get(getProducts)
  .post(protect, admin, createProduct)

router.get('/bestsellers', getBestSellerProducts);

router.route('/slug/:slug').get(getProductBySlug)

router.route('/:id')
  .get(getProductById)
  .put(protect, admin, updateProduct)
  .delete(protect, admin, deleteProduct)

router.route('/:id/specs').put(protect, admin, updateProductSpecs)

router.route('/:id/reviews').get(getProductReviews);
router.route('/:id/reviews')
  .post(protect, createProductReview);

// Specific routes FIRST - order matters in Express
router.route('/:id/reviews/:reviewId/helpful').put(protect, markReviewHelpful);
router.route('/:id/reviews/:reviewId/not-helpful').put(protect, markReviewNotHelpful);
///api/products/:id/reviews/:reviewId/not-helpful

router.route('/:id/reviews/:reviewId/reply')
  .post(protect, admin, addAdminReply)
  .put(protect, admin, editAdminReply)
  .delete(protect, admin, deleteAdminReply);

// Generic :reviewId route LAST
router.route('/:id/reviews/:reviewId')
  .put(protect, updateProductReview)
  .delete(protect, deleteProductReview);



module.exports = router