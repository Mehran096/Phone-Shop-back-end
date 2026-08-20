const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/auth.js');
const { 
  getAccessories, 
  getAccessoryById, 
  getAccessoryBySlug, 
  createAccessory, 
  updateAccessory, 
  deleteAccessory,
  getFeaturedAccessory 
  //getAccessoriesByCategory
} = require('../controllers/accessoryController.js');

const { 
  createAccessoryReview,
  getAccessoryReviews,
  updateAccessoryReview,
  deleteAccessoryReview,
  voteReview,
  replyToReview,
  getReplies,
  getReply,      
  updateReply,     
  deleteReply,
  getAccessoryReviewImages 
} = require('../controllers/accessoryReviewController.js');


 
router.route('/').get(getAccessories).post(protect, admin, createAccessory);
router.route('/featured').get(getFeaturedAccessory);
// 2. ADD CATEGORY ROUTE HERE - Must be above /:id and /:slug
//router.route('/category/:categorySlug').get(getAccessoriesByCategory); 

router.route('/slug/:slug').get(getAccessoryBySlug);

// REVIEW ROUTES
router.route('/:slug/reviews/images').get(getAccessoryReviewImages);
router.route('/slug/:slug/reviews').get(getAccessoryReviews).post(protect, createAccessoryReview);
router.route('/slug/:slug/reviews/:reviewId').put(protect, updateAccessoryReview).delete(protect, deleteAccessoryReview);
router.route('/slug/:slug/reviews/:reviewId/vote').put(protect, voteReview);

// ADMIN REPLY ROUTES - 5 CRUD NOW
router.route('/slug/:slug/reviews/:reviewId/replies').get(getReplies) // 1. GET all replies
router.route('/slug/:slug/reviews/:reviewId/reply').post(protect, admin, replyToReview) // 2. POST add
router.route('/slug/:slug/reviews/:reviewId/reply/:replyId')
  .get(getReply) // 3. GET single reply
  .put(protect, admin, updateReply) // 4. PUT update
  .delete(protect, admin, deleteReply) // 5. DELETE

// admin only 
router.route('/:id').get(getAccessoryById).put(protect, admin, updateAccessory).delete(protect, admin, deleteAccessory);

module.exports = router;