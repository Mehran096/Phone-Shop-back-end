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
  updateProductReview,
  deleteProductReview,
  markReviewHelpful,
  addAdminReply,
  editAdminReply,
  deleteAdminReply
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

router.route('/:id/reviews')
  .post(protect, createProductReview)

// Put ALL specific routes first
router.route('/:id/reviews/helpful').put(protect, markReviewHelpful);
router.route('/:id/reviews/reply').put(protect, admin, addAdminReply);
router.route('/:id/reviews/reply/edit').put(protect, admin, editAdminReply);
router.route('/:id/reviews/reply').delete(protect, admin, deleteAdminReply);

// Put the :reviewId route LAST
router.route('/:id/reviews/:reviewId')
  .put(protect, updateProductReview)
  .delete(protect, deleteProductReview);

// router.route('/:id/reviews')
// .post(protect, createProductReview)


//  router.route('/:id/reviews/:reviewId')
//   .put(protect, updateProductReview)
//   .delete(protect, deleteProductReview);

// router.route('/:id/reviews/helpful').put(protect, markReviewHelpful);

// //admin helpful reply
// router.route('/:id/reviews/reply').put(protect, admin, addAdminReply);
// router.route('/:id/reviews/reply/edit').put(protect, admin, editAdminReply);
// router.route('/:id/reviews/reply').delete(protect, admin, deleteAdminReply);

module.exports = router