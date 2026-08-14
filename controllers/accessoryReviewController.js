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
    res.status(201).json({ message: 'Review added' })
  } else {
    res.status(404)
    throw new Error('Accessory not found')
  }
})

// @desc    Get all reviews for an accessory with filters
// @route   GET /api/accessories/slug/:slug/reviews?page=1&limit=10&sort=helpful
// @access  Public
const getAccessoryReviews = asyncHandler(async (req, res) => {
  const { slug } = req.params
  const { page = 1, limit = 10, sort = 'newest', model = '', variant = '', rating = '', keyword = '' } = req.query

  const accessory = await Accessory.findOne({ slug }).select('reviews rating numReviews')

  if (!accessory) {
    res.status(404)
    throw new Error('Accessory not found')
  }

  let reviews = [...accessory.reviews]

  // 1. FILTER
  if (model) reviews = reviews.filter(r => r.model === model)
  if (variant) reviews = reviews.filter(r => r.variant === variant)
  if (rating) reviews = reviews.filter(r => r.rating === Number(rating))
  if (keyword) reviews = reviews.filter(r => 
    r.comment.toLowerCase().includes(keyword.toLowerCase()) || 
    r.title.toLowerCase().includes(keyword.toLowerCase())
  )

  // 2. SORT
  if (sort === 'newest') reviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  if (sort === 'highest') reviews.sort((a, b) => b.rating - a.rating)
  if (sort === 'lowest') reviews.sort((a, b) => a.rating - b.rating)
  if (sort === 'helpful') reviews.sort((a, b) => (b.helpful?.length || 0) - (a.helpful?.length || 0))
  if (sort === 'notHelpful') reviews.sort((a, b) => (b.notHelpful?.length || 0) - (a.notHelpful?.length || 0))

  // 3. PAGINATION
  const totalReviews = reviews.length
  const totalPages = Math.ceil(totalReviews / limit)
  const startIndex = (page - 1) * limit
  const paginatedReviews = reviews.slice(startIndex, startIndex + limit)

  res.json({
    reviews: paginatedReviews,
    page: Number(page),
    totalPages,
    totalReviews,
    rating: accessory.rating,
    numReviews: accessory.numReviews
  })
})

// @desc    Update accessory review
// @route   PUT /api/accessories/slug/:slug/reviews/:reviewId
// @access  Private
const updateAccessoryReview = asyncHandler(async (req, res) => {
  const { rating, title, comment, images } = req.body
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

    if (images && review.images.length > 0) {
      const oldPublicIds = review.images.map(img => img.imagePublicId).filter(Boolean)
      const newPublicIds = images.map(img => img.imagePublicId).filter(Boolean)
      const toDelete = oldPublicIds.filter(id => !newPublicIds.includes(id))
      if(toDelete.length > 0){
        await cloudinary.api.delete_resources(toDelete)
      }
    }

    review.rating = Number(rating)
    review.title = title || ''
    review.comment = comment
    review.images = images || []

    accessory.numReviews = accessory.reviews.length
    accessory.rating = accessory.reviews.reduce((acc, item) => item.rating + acc, 0) / accessory.reviews.length
    await accessory.save()

    res.status(200).json({ message: 'Review updated' })
  } else {
    res.status(404)
    throw new Error('Accessory not found')
  }
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
  const { slug, reviewId } = req.params // CHANGED
  const userId = req.user._id

  const accessory = await Accessory.findOne({ slug }) // CHANGED
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
  res.json({ message: 'Feedback updated', review: { _id: updatedReview._id, helpful: updatedReview.helpful || [], notHelpful: updatedReview.notHelpful || [] } })
})

// REPLY CONTROLLERS - ALL CHANGED TO SLUG
const replyToReview = asyncHandler(async (req, res) => {
  const { comment } = req.body
  const { slug, reviewId } = req.params // CHANGED
  if (!comment?.trim()) { res.status(400); throw new Error('Reply comment is required') }
  const accessory = await Accessory.findOne({ slug }) // CHANGED
  if (!accessory) { res.status(404); throw new Error('Accessory not found') }
  const review = accessory.reviews.id(reviewId)
  if (!review) { res.status(404); throw new Error('Review not found') }
  review.replies.push({ user: req.user._id, name: req.user.name, comment, createdAt: new Date() })
  await accessory.save()
  res.status(201).json({ message: 'Reply added', replies: review.replies })
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
  const { slug, reviewId, replyId } = req.params // CHANGED
  if (!comment?.trim()) { res.status(400); throw new Error('Reply comment is required') }
  const accessory = await Accessory.findOne({ slug }) // CHANGED
  if (!accessory) { res.status(404); throw new Error('Accessory not found') }
  const review = accessory.reviews.id(reviewId)
  if (!review) { res.status(404); throw new Error('Review not found') }
  const reply = review.replies.id(replyId)
  if (!reply) { res.status(404); throw new Error('Reply not found') }
  if (reply.user.toString() !== req.user._id.toString() && !req.user.isAdmin) { res.status(401); throw new Error('Not authorized') }
  reply.comment = comment
  await accessory.save()
  res.json({ message: 'Reply updated', reply })
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
  deleteReply
}