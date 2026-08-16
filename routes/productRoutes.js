const express = require('express')
const router = express.Router()
const {
  createProduct, getProducts, getProductsForDropdown, getProductById, getProductBySlug,
  updateProduct, getBestSellerProducts, getDealsProducts, getNewArrivalProducts,
  compareProducts, getRecommendedProducts, getFrequentlyBoughtTogether, deleteProduct,
  createProductReview, getProductReviews, updateProductReview,
  deleteProductReview, markReviewHelpful, markReviewNotHelpful, addAdminReply,
  editAdminReply, deleteAdminReply, getProductReviewImages
} = require('../controllers/productController')

const { protect, admin } = require('../middleware/auth.js')
 
// 1. STATIC ROUTES
router.route('/').get(getProducts).post(protect, admin, createProduct)
router.get('/bestsellers', getBestSellerProducts)
router.get('/deals', getDealsProducts)
router.get('/new-arrivals', getNewArrivalProducts)
router.get('/compare', compareProducts)
router.get('/dropdown', getProductsForDropdown)

// 2. PUBLIC SLUG ROUTES
router.route('/slug/:slug').get(getProductBySlug)
router.route('/slug/:slug/reviews/images').get(getProductReviewImages) 
router.route('/slug/:slug/reviews').get(getProductReviews).post(protect, createProductReview)
router.route('/slug/:slug/reviews/:reviewId/helpful').put(protect, markReviewHelpful)
router.route('/slug/:slug/reviews/:reviewId/not-helpful').put(protect, markReviewNotHelpful)
router.route('/slug/:slug/reviews/:reviewId/reply')
  .post(protect, admin, addAdminReply)
  .put(protect, admin, editAdminReply)
  .delete(protect, admin, deleteAdminReply)
router.route('/slug/:slug/reviews/:reviewId').put(protect, updateProductReview).delete(protect, deleteProductReview)

// 3. ADMIN ID ROUTES - Keep these for admin panel
router.get('/:id/recommendations', getRecommendedProducts)
router.get('/:id/frequently-bought', getFrequentlyBoughtTogether)
router.route('/:id').get(getProductById).put(protect, admin, updateProduct).delete(protect, admin, deleteProduct)

module.exports = router