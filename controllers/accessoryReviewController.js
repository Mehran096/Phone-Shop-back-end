const asyncHandler = require('express-async-handler')
const Accessory = require('../models/Accessory.js')
const Order = require('../models/orderModel.js')
const { cloudinary } = require('../utils/cloudinary')

// @desc    Create new accessory review
// @route   POST /api/accessories/slug/:slug/reviews
// @access  Private
const createAccessoryReview = asyncHandler(async (req, res) => {
  const { rating, comment, title, model, variant, images } = req.body
  const { slug } = req.params // CHANGED

  const accessory = await Accessory.findOne({ slug }) // CHANGED

  if (accessory) {
    const alreadyReviewed = accessory.reviews.find(
      (r) => r.user.toString() === req.user._id.toString()
    )
    if (alreadyReviewed) {
      res.status(400)
      throw new Error('Accessory already reviewed')
    }

    const order = await Order.findOne({
      user: req.user._id,
      'orderItems.accessory': accessory._id, // use _id here
      isPaid: true,
    })

    const review = {
      name: req.user.name,
      user: req.user._id,
      rating: Number(rating),
      title: title || '',
      comment,
      model: model || '',
      variant: variant || '',
      images: images || [],
      verifiedPurchase: !!order,
      helpful: [],
      notHelpful: [],
      replies: [] // MAKE SURE THIS EXISTS
    }

    accessory.reviews.push(review)
    accessory.numReviews = accessory.reviews.length
    accessory.rating = accessory.reviews.reduce((acc, item) => item.rating + acc, 0) / accessory.reviews.length

    await accessory.save()
    const newReview = accessory.reviews[accessory.reviews.length - 1]
    res.status(201).json(newReview)
  } else {
    res.status(404)
    throw new Error('Accessory not found')
  }
})

const getAccessoryReviews = asyncHandler(async (req, res) => {
  const { slug } = req.params
  const { page = 1, limit = 10, sort = 'newest', model = '', variant = '', rating = '', keyword = '', hasPhotos = 'false' } = req.query

  const accessory = await Accessory.findOne({ slug }).select('reviews rating numReviews')

  if (!accessory) {
    res.status(404)
    throw new Error('Accessory not found')
  }

  // KEY 1: CALCULATE BREAKDOWN FROM ALL REVIEWS FIRST
  const fullRatingBreakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  accessory.reviews.forEach(r => {
    fullRatingBreakdown[r.rating] = (fullRatingBreakdown[r.rating] || 0) + 1;
  });
  const fullTotalReviews = accessory.reviews.length
  const fullAvgRating = fullTotalReviews > 0 
   ? accessory.reviews.reduce((acc, item) => item.rating + acc, 0) / fullTotalReviews 
    : 0

  let reviews = [...accessory.reviews]

  // 1. FILTER
  if (model) reviews = reviews.filter(r => r.model === model)
  if (variant) reviews = reviews.filter(r => r.variant === variant)
  if (rating) reviews = reviews.filter(r => r.rating === Number(rating))
  if (keyword) {
    const search = keyword.toLowerCase()
    reviews = reviews.filter(r => 
      r.comment?.toLowerCase().includes(search) || 
      r.title?.toLowerCase().includes(search) ||
      r.name?.toLowerCase().includes(search)
    )
  }
  if (hasPhotos === 'true') reviews = reviews.filter(r => r.images && r.images.length > 0)

  // 2. SORT
  if (sort === 'newest') reviews.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
  if (sort === 'highest') reviews.sort((a, b) => b.rating - a.rating)
  if (sort === 'lowest') reviews.sort((a, b) => a.rating - b.rating)
  if (sort === 'helpful') reviews.sort((a, b) => (b.helpful?.length || 0) - (a.helpful?.length || 0))
  if (sort === 'notHelpful') reviews.sort((a, b) => (b.notHelpful?.length || 0) - (a.notHelpful?.length || 0))

  // 3. PAGINATION
  const totalReviews = reviews.length
  const totalPages = Math.ceil(totalReviews / limit)
  const startIndex = (page - 1) * limit
  const paginatedReviews = reviews.slice(startIndex, startIndex + Number(limit))

  res.json({
    reviews: paginatedReviews,
    page: Number(page),
    totalPages,
    totalReviews, // this is filtered count
    rating: Number(fullAvgRating.toFixed(1)), // this is full avg
    ratingBreakdown: fullRatingBreakdown, // KEY 2: SEND FULL BREAKDOWN
    numReviews: accessory.numReviews
  })
})

// @desc    Update accessory review
// @route   PUT /api/accessories/slug/:slug/reviews/:reviewId
// @access  Private
const updateAccessoryReview = asyncHandler(async (req, res) => {
  const { rating, title, comment, images } = req.body
  const { slug, reviewId } = req.params
  const accessory = await Accessory.findOne({ slug })

  if (!accessory) {
    res.status(404)
    throw new Error('Accessory not found')
  }

  const review = accessory.reviews.id(reviewId)
  if (!review) {
    res.status(404)
    throw new Error('Review not found')
  }
  if (review.user.toString() !== req.user._id.toString() && !req.user.isAdmin) {
    res.status(401)
    throw new Error('Not authorized')
  }

  // 1. FIND IMAGES TO DELETE - only if user removed some
  if (images) {
    const oldPublicIds = review.images?.map(img => img.imagePublicId).filter(Boolean) || []
    const newPublicIds = images.map(img => img.imagePublicId).filter(Boolean)
    const toDelete = oldPublicIds.filter(id => !newPublicIds.includes(id))
    
    if(toDelete.length > 0){
      try {
        await cloudinary.api.delete_resources(toDelete)
        console.log('Deleted from cloudinary:', toDelete)
      } catch (err) {
        console.error('Cloudinary delete error:', err)
      }
    }
  }

  // 2. UPDATE REVIEW
  review.rating = Number(rating)
  review.title = title || ''
  review.comment = comment
  review.images = images || [] // save the new array

  // 3. RECALCULATE RATING
  accessory.numReviews = accessory.reviews.length
  accessory.rating = accessory.reviews.length > 0 
    ? accessory.reviews.reduce((acc, item) => item.rating + acc, 0) / accessory.reviews.length 
    : 0
    
  await accessory.save()

  const updatedReview = accessory.reviews.id(reviewId)
  res.status(200).json(updatedReview)
})

// @desc    Delete review
// @route   DELETE /api/accessories/slug/:slug/reviews/:reviewId
// @access  Private
const deleteAccessoryReview = asyncHandler(async (req, res) => {
  const { slug, reviewId } = req.params // CHANGED
  const accessory = await Accessory.findOne({ slug }) // CHANGED

  if (accessory) {
    const review = accessory.reviews.id(reviewId)
    if (!review) {
      res.status(404)
      throw new Error('Review not found')
    }
    if (review.user.toString() !== req.user._id.toString() && !req.user.isAdmin) {
      res.status(401)
      throw new Error('Not authorized')
    }

    if (review.images && review.images.length > 0) {
      const reviewPublicIds = review.images.map(img => img.imagePublicId).filter(Boolean)
      if (reviewPublicIds.length > 0) {
        for (let i = 0; i < reviewPublicIds.length; i += 100) {
          const batch = reviewPublicIds.slice(i, i + 100)
          await cloudinary.api.delete_resources(batch)
        }
      }
    }

    accessory.reviews.pull(reviewId)
    accessory.numReviews = accessory.reviews.length
    accessory.rating = accessory.reviews.length > 0 
      ? accessory.reviews.reduce((acc, item) => item.rating + acc, 0) / accessory.reviews.length 
      : 0

    await accessory.save()
    res.json({ message: 'Review removed' })
  } else {
    res.status(404)
    throw new Error('Accessory not found')
  }
})

// @desc    Vote helpful/notHelpful on a review
// @route   PUT /api/accessories/slug/:slug/reviews/:reviewId/vote
// @access  Private
const voteReview = asyncHandler(async (req, res) => {
  const { type } = req.body
  const { slug, reviewId } = req.params
  const userId = req.user._id

  const accessory = await Accessory.findOne({ slug })
  if (!accessory) return res.status(404).json({ message: 'Accessory not found' })

  const review = accessory.reviews.id(reviewId)
  if (!review) return res.status(404).json({ message: 'Review not found' })

  let helpful = Array.isArray(review.helpful) ? review.helpful.map(id => id.toString()) : []
  let notHelpful = Array.isArray(review.notHelpful) ? review.notHelpful.map(id => id.toString()) : []
  const userIdStr = userId.toString()

  if (type === 'helpful') {
    helpful.includes(userIdStr) ? helpful = helpful.filter(id => id !== userIdStr) : (notHelpful = notHelpful.filter(id => id !== userIdStr), helpful.push(userIdStr))
  } else if (type === 'notHelpful') {
    notHelpful.includes(userIdStr) ? notHelpful = notHelpful.filter(id => id !== userIdStr) : (helpful = helpful.filter(id => id !== userIdStr), notHelpful.push(userIdStr))
  }

  review.helpful = helpful
  review.notHelpful = notHelpful
  await accessory.save()

  const updatedAccessory = await Accessory.findOne({ slug })
  const updatedReview = updatedAccessory.reviews.id(reviewId)
  
  res.json(updatedReview) // <-- RETURN FULL REVIEW OBJECT with createdAt, rating, etc
})

// REPLY CONTROLLERS - ALL CHANGED TO SLUG
const replyToReview = asyncHandler(async (req, res) => {
  const { comment } = req.body
  const { slug, reviewId } = req.params
  if (!comment?.trim()) { res.status(400); throw new Error('Reply comment is required') }
  
  const accessory = await Accessory.findOne({ slug })
  if (!accessory) { res.status(404); throw new Error('Accessory not found') }
  
  const review = accessory.reviews.id(reviewId)
  if (!review) { res.status(404); throw new Error('Review not found') }
  
  const newReply = { user: req.user._id, name: req.user.name, comment, createdAt: new Date() }
  review.replies.push(newReply)
  await accessory.save()

  const savedReview = await Accessory.findOne({ slug }) // refetch to get _id
  const savedReply = savedReview.reviews.id(reviewId).replies[review.replies.length - 1]

  res.status(201).json(savedReply) // <-- RETURN THE SINGLE REPLY OBJECT
})

const getReplies = asyncHandler(async (req, res) => {
  const { slug, reviewId } = req.params // CHANGED
  const accessory = await Accessory.findOne({ slug }) // CHANGED
  if (!accessory) { res.status(404); throw new Error('Accessory not found') }
  const review = accessory.reviews.id(reviewId)
  if (!review) { res.status(404); throw new Error('Review not found') }
  res.json(review.replies || [])
})

const getReply = asyncHandler(async (req, res) => {
  const { slug, reviewId, replyId } = req.params // CHANGED
  const accessory = await Accessory.findOne({ slug }) // CHANGED
  if (!accessory) { res.status(404); throw new Error('Accessory not found') }
  const review = accessory.reviews.id(reviewId)
  if (!review) { res.status(404); throw new Error('Review not found') }
  const reply = review.replies.id(replyId)
  if (!reply) { res.status(404); throw new Error('Reply not found') }
  res.json(reply)
})

const updateReply = asyncHandler(async (req, res) => {
  const { comment } = req.body
  const { slug, reviewId, replyId } = req.params
  if (!comment?.trim()) { res.status(400); throw new Error('Reply comment is required') }
  
  const accessory = await Accessory.findOne({ slug })
  if (!accessory) { res.status(404); throw new Error('Accessory not found') }
  
  const review = accessory.reviews.id(reviewId)
  if (!review) { res.status(404); throw new Error('Review not found') }
  
  const reply = review.replies.id(replyId)
  if (!reply) { res.status(404); throw new Error('Reply not found') }
  if (reply.user.toString() !== req.user._id.toString() && !req.user.isAdmin) { res.status(401); throw new Error('Not authorized') }
  
  reply.comment = comment
  await accessory.save()
  
  const updatedAccessory = await Accessory.findOne({ slug })
  const updatedReply = updatedAccessory.reviews.id(reviewId).replies.id(replyId) // <-- get the reply

  res.json(updatedReply) // <-- RETURN ONLY THE REPLY OBJECT
})

const deleteReply = asyncHandler(async (req, res) => {
  const { slug, reviewId, replyId } = req.params // CHANGED
  const accessory = await Accessory.findOne({ slug }) // CHANGED
  if (!accessory) { res.status(404); throw new Error('Accessory not found') }
  const review = accessory.reviews.id(reviewId)
  if (!review) { res.status(404); throw new Error('Review not found') }
  review.replies.pull(replyId)
  await accessory.save()
  res.json({ message: 'Reply removed' })
})

// @desc    Get all review images for an accessory
// @route   GET /api/accessories/:slug/reviews/images
// @access  Public
const getAccessoryReviewImages = asyncHandler(async (req, res) => {
  const { slug } = req.params; // CHANGED: use slug

  const accessory = await Accessory.findOne({ slug });
  
  if (!accessory) {
    res.status(404);
    throw new Error('Accessory not found');
  }

  // Flatten all images from all reviews
  const allImages = accessory.reviews.flatMap(review => 
    (review.images || []).map(img => ({
      url: img.url,
      reviewId: review._id,
      user: review.name,
      rating: review.rating,
      createdAt: review.createdAt
    }))
  );

  res.json(allImages);
});

module.exports = { 
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
  getAccessoryReviewImages,
}