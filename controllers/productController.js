const mongoose = require('mongoose')
const asyncHandler = require('express-async-handler')
const Product = require('../models/Product')
const slugify = require('slugify')
const User = require('../models/User')
const { cloudinary } = require('../utils/cloudinary')

const extractPublicIdFromUrl = (url) => {
  try {
    // Regex grabs everything after /upload/ and before the file extension
    const matches = url.match(/\/upload\/(?:v\d+\/)?(.+)\.\w+$/)
    return matches ? matches[1] : null
  } catch {
    return null
  }
}

// @desc Create a product
// @route POST /api/products
// @access Private/Admin
const createProduct = asyncHandler(async (req, res) => {
  // Block demo admin from destructive actions
  const isDemoAdmin = req.user.email === 'demo@phonestore.com'
  if (isDemoAdmin) {
    return res.status(403).json({
      message: 'Demo accounts have read-only access. Contact developer for full admin demo.'
    })
  }

  try {
    const {
      name,
      brand,
      category,
      description,
      metaTitle,
      metaDescription,
      keywords,
    } = req.body

    // Safe JSON parsing with fallbacks
    let colors = []
    let specs = {}

    try {
      colors = req.body.colors? JSON.parse(req.body.colors) : []
    } catch (e) {
      res.status(400)
      throw new Error('Invalid colors format')
    }

    try {
      specs = req.body.specs? JSON.parse(req.body.specs) : {}
    } catch (e) {
      res.status(400)
      throw new Error('Invalid specs format')
    }

    const colorsWithImages = colors.map((color, idx) => {
      const fieldName = `colorImages-${idx}`
      const colorFiles = req.files? req.files[fieldName] || [] : []

      return {
        name: color.name || '',
        hexCode: color.hexCode || '#000000',
        countInStock: Number(color.countInStock) || 0,
        price: Number(color.price) || 0,
        images: colorFiles.map((file) => file.path),
        imagePublicIds: colorFiles.map((file) => file.filename),
      }
    })

    // Auto-generate slug from name
    const productSlug = slugify(name, {
      lower: true,
      strict: true,
      remove: /[*+~.()'"!:@]/g
    })

    // Auto-generate metaTitle if empty
    const autoMetaTitle = metaTitle ||
      `${name}${specs.storage? ' - ' + specs.storage : ''} | PhoneStore`

    // Auto-generate metaDescription if empty
    const autoMetaDescription = metaDescription ||
      `Buy ${name} from ${brand}. ${description.slice(0, 120)}...`

    // Parse keywords if sent as string
    let parsedKeywords = []
    if (keywords) {
      try {
        parsedKeywords = typeof keywords === 'string'
         ? keywords.split(',').map(k => k.trim()).filter(Boolean)
          : JSON.parse(keywords)
      } catch (e) {
        parsedKeywords = []
      }
    }

    const product = new Product({
      user: req.user._id,
      name,
      slug: productSlug,
      brand,
      category,
      description,
      metaTitle: autoMetaTitle.slice(0, 60), // Google limit
      metaDescription: autoMetaDescription.slice(0, 155), // Google limit
      keywords: parsedKeywords,
      specs,
      colors: colorsWithImages,
      image: colorsWithImages[0]?.images[0] || '', // main image for OG tags
      numReviews: 0,
      rating: 0,
    })

    const createdProduct = await product.save()
    res.status(201).json(createdProduct)

  } catch (error) {
    console.log('CREATE PRODUCT ERROR:', error)

    // Handle duplicate slug error
    if (error.code === 11000 && error.keyPattern?.slug) {
      res.status(400)
      throw new Error('Product with this name already exists. Change the name to generate a unique URL.')
    }

    res.status(500).json({ message: error.message })
  }
})
// @desc Fetch all products
// @route GET /api/products
// @access Public
//pagination & Search
const getProducts = asyncHandler(async (req, res) => {
  const pageSize = Number(req.query.pageSize) || 8
  const page = Number(req.query.pageNumber) || 1

  const { keyword, brand, category } = req.query

  const searchFilter = keyword
    ? {
        $and: keyword
          .trim()
          .split(' ')
          .filter(Boolean)
          .map((word) => ({
            $or: [
              { name: { $regex: word, $options: 'i' } },
              { brand: { $regex: word, $options: 'i' } },
              { category: { $regex: word, $options: 'i' } },
              { 'colors.name': { $regex: word, $options: 'i' } },
              { 'specs.storage': { $regex: word, $options: 'i' } },
              { keywords: { $regex: word, $options: 'i' } }, // <-- Added for SEO
            ],
          })),
      }
    : {}

  const brandFilter = brand ? { brand: { $regex: brand, $options: 'i' } } : {}
  const categoryFilter = category ? { category: { $regex: category, $options: 'i' } } : {}

  const filter = { ...searchFilter, ...brandFilter, ...categoryFilter }

  const count = await Product.countDocuments(filter)
  
  const products = await Product.find(filter)
    .select('name slug brand category image rating numReviews colors specs metaTitle') // <-- Only send needed fields
    .limit(pageSize)
    .skip(pageSize * (page - 1))
    .sort({ createdAt: -1 })

  res.json({ products, page, pages: Math.ceil(count / pageSize) })
})

// @desc Fetch single product by slug
// @route GET /api/products/slug/:slug
// @access Public
const getProductBySlug = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ slug: req.params.slug })
    .populate('user', 'name') // optional: show who added it

  if (product) {
    res.json(product)
  } else {
    res.status(404)
    throw new Error('Product not found')
  }
})

// @desc Get product by ID - Keep for admin panel
// @route GET /api/products/:id
// @access Public
const getProductById = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id)

  if (product) {
    res.json(product)
  } else {
    res.status(404)
    throw new Error('Product not found')
  }
})

// @desc Update product
// @route PUT /api/products/:id
// @access Private/Admin
const updateProduct = asyncHandler(async (req, res) => {
  // Block demo admin from destructive actions
  const isDemoAdmin = req.user.email === 'demo@phonestore.com'
  if (isDemoAdmin) {
    return res.status(403).json({
      message: 'Demo accounts have read-only access. Contact developer for full admin demo.'
    })
  }

  const product = await Product.findById(req.params.id)

  if (!product) {
    res.status(404)
    throw new Error('Product not found')
  }

  const {
    name,
    brand,
    category,
    description,
    metaTitle,
    metaDescription,
    keywords,
  } = req.body

  // 1. Delete images from Cloudinary first
  const imagesToDelete = req.body.imagesToDelete? JSON.parse(req.body.imagesToDelete) : []
  console.log('Deleting from Cloudinary:', imagesToDelete)

  if (imagesToDelete.length > 0) {
    try {
      await cloudinary.api.delete_resources(imagesToDelete)
      console.log('Cloudinary delete success')
    } catch (err) {
      console.log('Cloudinary delete error:', err)
    }
  }

  // 2. Parse colors and specs from FormData
  let colors = []
  let parsedSpecs = {}

  try {
    colors = req.body.colors? JSON.parse(req.body.colors) : []
  } catch (e) {
    res.status(400)
    throw new Error('Invalid colors format')
  }

  try {
    parsedSpecs = req.body.specs? JSON.parse(req.body.specs) : {}
  } catch (e) {
    res.status(400)
    throw new Error('Invalid specs format')
  }

  // 3. Handle COLORS + their images
  const colorsWithImages = colors.map((color, idx) => {
    const fieldName = `colorImages-${idx}`
    const newColorFiles = req.files?.[fieldName] || []

    const newImageUrls = newColorFiles.map(file => file.path)
    const newPublicIds = newColorFiles.map(file => file.filename)

    // color.images and color.imagePublicIds already have deleted images removed
    // because frontend sent the filtered arrays
    return {
      name: color.name,
      hexCode: color.hexCode || '#000000',
      countInStock: Number(color.countInStock) || 0,
      price: Number(color.price) || 0,
      images: [...(color.images || []),...newImageUrls],
      imagePublicIds: [...(color.imagePublicIds || []),...newPublicIds],
    }
  })

  // 4. Update slug if name changed
  let newSlug = product.slug
  if (name && name!== product.name) {
    newSlug = slugify(name, {
      lower: true,
      strict: true,
      remove: /[*+~.()'"!:@]/g
    })
  }

  // 5. Parse keywords
  let parsedKeywords = product.keywords
  if (keywords) {
    try {
      parsedKeywords = typeof keywords === 'string'
     ? keywords.split(',').map(k => k.trim()).filter(Boolean)
        : JSON.parse(keywords)
    } catch (e) {
      parsedKeywords = product.keywords
    }
  }

  // 6. Update product fields
  product.name = name || product.name
  product.slug = newSlug
  product.brand = brand || product.brand
  product.category = category || product.category
  product.description = description || product.description
  product.metaTitle = metaTitle? metaTitle.slice(0, 60) : product.metaTitle
  product.metaDescription = metaDescription? metaDescription.slice(0, 155) : product.metaDescription
  product.keywords = parsedKeywords
  product.specs = parsedSpecs
  product.colors = colorsWithImages
  product.image = colorsWithImages[0]?.images[0] || product.image

  try {
    const updatedProduct = await product.save()
    res.json(updatedProduct)
  } catch (error) {
    console.log('UPDATE PRODUCT ERROR:', error)
    // Handle duplicate slug error
    if (error.code === 11000 && error.keyPattern?.slug) {
      res.status(400)
      throw new Error('Another product with this name already exists. Change the name.')
    }
    res.status(500).json({ message: error.message })
  }
})



// @desc Delete a product + all Cloudinary images
// @route DELETE /api/products/:id
// @access Private/Admin
const deleteProduct = asyncHandler(async (req, res) => {
  // Block demo admin from destructive actions
  const isDemoAdmin = req.user.email === 'demo@phonestore.com'
  if (isDemoAdmin) {
    return res.status(403).json({
      message: 'Demo accounts have read-only access. Contact developer for full admin demo.'
    })
  }

  const product = await Product.findById(req.params.id)

  if (!product) {
    res.status(404)
    throw new Error('Product not found')
  }

  try {
    const publicIdsToDelete = new Set()

    // Helper to extract public_id from Cloudinary URL
    const extractPublicId = (url) => {
      if (!url) return null
      const matches = url.match(/\/upload\/(?:v\d+\/)?(.+)\.\w+$/)
      return matches? matches[1] : null
    }

    // 1. Main product image - for OG tags
    if (product.image) {
      const mainImageId = extractPublicId(product.image)
      if (mainImageId) publicIdsToDelete.add(mainImageId)
    }

    // 2. All color images
    product.colors?.forEach(color => {
      if (color.imagePublicIds?.length > 0) {
        color.imagePublicIds.forEach(id => publicIdsToDelete.add(id))
      } else {
        // Fallback: extract from URLs for old images
        color.images?.forEach(url => {
          const id = extractPublicId(url)
          if (id) publicIdsToDelete.add(id)
        })
      }
    })

    // 3. All review images
    product.reviews?.forEach(review => {
      if (review.imagePublicIds?.length > 0) {
        review.imagePublicIds.forEach(id => publicIdsToDelete.add(id))
      }
      if (review.images?.length > 0) {
        review.images.forEach(url => {
          const id = extractPublicId(url)
          if (id) publicIdsToDelete.add(id)
        })
      }
    })

    // Delete from Cloudinary - batch delete max 100 at a time
    const idsArray = [...publicIdsToDelete]
    if (idsArray.length > 0) {
      console.log(`Deleting ${idsArray.length} images from Cloudinary`)
      for (let i = 0; i < idsArray.length; i += 100) {
        const batch = idsArray.slice(i, i + 100)
        try {
          await cloudinary.api.delete_resources(batch)
        } catch (err) {
          console.log('Cloudinary batch delete error:', err)
        }
      }
      console.log('Cloudinary delete complete')
    }

    // Delete product from DB
    await product.deleteOne()

    // Clean up user carts and wishlists - prevents future nulls
    const productId = new mongoose.Types.ObjectId(req.params.id)

    await User.updateMany(
      { wishlist: productId }, // Use ObjectId here
      { $pull: { wishlist: productId } }
    )
    await User.updateMany(
      { 'cart.product': productId }, // And here
      { $pull: { cart: { product: productId } } }
    )

    res.json({ message: 'Product and all images removed' })

  } catch (error) {
    console.error('Delete product error:', error)
    res.status(500).json({ message: error.message || 'Server error' })
  }
})

// @desc Create new review
// @route POST /api/products/:id/reviews
// @access Private
const createProductReview = asyncHandler(async (req, res) => {
  const { rating, comment, color, images } = req.body // images = array of Cloudinary objects OR URLs
   
  //const product = await Product.findById(req.params.id)
  let product = await Product.findOne({ slug: req.params.id })
  
if (!product && mongoose.Types.ObjectId.isValid(req.params.id)) {
  product = await Product.findById(req.params.id)
}

 

  if (product) {
    const alreadyReviewed = product.reviews.find(
      (r) => r.user.toString() === req.user._id.toString() && r.color === color
    )

     

    if (alreadyReviewed) {
      res.status(400)
      throw new Error('Product already reviewed for this color')
    }

    const review = {
     name: req.user.name || req.user.email?.split('@')[0] || 'User',
  rating: Number(rating),
  comment,
  user: req.user._id,
  color: color || 'Default',
  images: images || [],
      imagePublicIds: [], // ADD THIS
    }

    // Handle images - check if frontend sends URLs or full Cloudinary objects
    if (images && images.length > 0) {
      images.forEach(img => {
        // Case 1: Frontend sends full Cloudinary response { secure_url, public_id }
        if (typeof img === 'object' && img.secure_url) {
          review.images.push(img.secure_url)
          review.imagePublicIds.push(img.public_id)
        }
        // Case 2: Frontend sends just URLs - extract public_id with regex
        else if (typeof img === 'string') {
          review.images.push(img)
          const publicId = extractPublicIdFromUrl(img)
          if (publicId) review.imagePublicIds.push(publicId)
        }
      })
    }

    product.reviews.push(review)
    product.numReviews = product.reviews.length

    // FIXED: Calculate rating correctly per color
    const colorReviews = product.reviews.filter(r => r.color === color)
    product.rating = colorReviews.length > 0
      ? colorReviews.reduce((acc, item) => acc + item.rating, 0) / colorReviews.length
      : 0

    await product.save()
    res.status(201).json({ message: 'Review added' })
  } else {
    res.status(404)
    throw new Error('Product not found')
  }
})

// @desc Get all reviews for a product
// @route GET /api/products/:id/reviews
// @access Public
const getProductReviews = asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const { color, sort } = req.query;

  //const product = await Product.findById(req.params.id);
  let product = await Product.findOne({ slug: req.params.id })
if (!product && mongoose.Types.ObjectId.isValid(req.params.id)) {
  product = await Product.findById(req.params.id)
}

  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  let reviews = product.reviews;

  // Filter by color if passed: ?color=Black
  if (color) {
    reviews = reviews.filter(r => r.color === color);
  }

  // Add helpfulCount on the fly since you store array of user IDs
  reviews = reviews.map(review => ({
    ...review.toObject(), // convert Mongoose doc to plain object
    helpfulCount: review.helpful.length, // count array length
    createdAt: review.createdAt // timestamps: true gives you this
  }));

  // Sort: newest, oldest, highest_rating, most_helpful
  if (sort === 'oldest') {
    reviews.sort((a, b) => a.createdAt - b.createdAt);
  } else if (sort === 'highest_rating') {
    reviews.sort((a, b) => b.rating - a.rating);
  } else if (sort === 'most_helpful') {
    reviews.sort((a, b) => b.helpfulCount - a.helpfulCount);
  } else {
    // Default: newest first
    reviews.sort((a, b) => b.createdAt - a.createdAt);
  }

  const totalReviews = reviews.length;
  const paginatedReviews = reviews.slice(skip, skip + limit);

  res.json({
    reviews: paginatedReviews,
    page,
    totalPages: Math.ceil(totalReviews / limit),
    totalReviews,
    color: color || 'all'
  });
});

// @desc Update product review
// @route PUT /api/products/:id/reviews/:reviewId
// @access Private
const updateProductReview = asyncHandler(async (req, res) => {
  const { rating, comment, images } = req.body

  //const product = await Product.findById(req.params.id)
  let product = await Product.findOne({ slug: req.params.id })
if (!product && mongoose.Types.ObjectId.isValid(req.params.id)) {
  product = await Product.findById(req.params.id)
}
  if (!product) {
    res.status(404)
    throw new Error('Product not found')
  }

  const review = product.reviews.id(req.params.reviewId)
  if (!review) {
    res.status(404)
    throw new Error('Review not found')
  }

  // Check if user owns this review
  if (review.user.toString() !== req.user._id.toString()) {
    res.status(401)
    throw new Error('Not authorized')
  }

  // 1. Find images that were removed and delete from Cloudinary
  const oldImages = review.images || []
  const newImages = images || []
  const oldPublicIds = review.imagePublicIds || []

  // Get URLs that were removed
  const imagesToDelete = oldImages.filter(img => !newImages.includes(img))
  const publicIdsToDelete = []

  if (imagesToDelete.length > 0) {
    // If we have stored public_ids, use those directly - more reliable
    imagesToDelete.forEach(url => {
      const index = oldImages.indexOf(url)
      // Try to get stored public_id first
      if (oldPublicIds[index]) {
        publicIdsToDelete.push(oldPublicIds[index])
      } else {
        // Fallback: extract from URL
        const id = extractPublicIdFromUrl(url)
        if (id) publicIdsToDelete.push(id)
      }
    })

    // Batch delete from Cloudinary
    if (publicIdsToDelete.length > 0) {
      try {
        const result = await cloudinary.api.delete_resources(publicIdsToDelete)
        console.log('Cloudinary delete result:', result)
      } catch (err) {
        console.error('Cloudinary delete failed:', err)
        // Don't throw - still update review even if Cloudinary fails
      }
    }
  }

  // 2. Update review fields
  review.rating = Number(rating) || review.rating
  review.comment = comment || review.comment
  review.images = []
  review.imagePublicIds = []

  // 3. Save new images - handle both objects and URL strings
  if (newImages.length > 0) {
    newImages.forEach(img => {
      // Case 1: Frontend sends Cloudinary object { secure_url, public_id }
      if (typeof img === 'object' && img.secure_url) {
        review.images.push(img.secure_url)
        review.imagePublicIds.push(img.public_id)
      }
      // Case 2: Frontend sends just URL string - keep existing public_id if possible
      else if (typeof img === 'string') {
        review.images.push(img)
        // Try to find existing public_id for this URL
        const oldIndex = oldImages.indexOf(img)
        if (oldIndex !== -1 && oldPublicIds[oldIndex]) {
          review.imagePublicIds.push(oldPublicIds[oldIndex])
        } else {
          // New image URL - extract public_id
          const publicId = extractPublicIdFromUrl(img)
          if (publicId) review.imagePublicIds.push(publicId)
        }
      }
    })
  }

  // 4. Recalculate product rating for this color
  const colorReviews = product.reviews.filter(r => r.color === review.color)
  product.rating = colorReviews.length > 0
    ? colorReviews.reduce((acc, item) => acc + item.rating, 0) / colorReviews.length
    : 0

  await product.save()
  res.json({ message: 'Review updated' })
})

// @desc Delete a product review + its images
// @route DELETE /api/products/:id/reviews/:reviewId
// @access Private
const deleteProductReview = asyncHandler(async (req, res) => {
  //const product = await Product.findById(req.params.id)
  let product = await Product.findOne({ slug: req.params.id })
if (!product && mongoose.Types.ObjectId.isValid(req.params.id)) {
  product = await Product.findById(req.params.id)
}

  if (!product) {
    res.status(404)
    throw new Error('Product not found')
  }

  // Find review by _id from URL params
  const review = product.reviews.find(
    (r) => r._id.toString() === req.params.reviewId
  )

  if (!review) {
    res.status(404)
    throw new Error('Review not found')
  }

  // Check if user owns the review or is admin
  if (review.user.toString() !== req.user._id.toString() && !req.user.isAdmin) {
    res.status(401)
    throw new Error('Not authorized')
  }

  // 1. Delete images from Cloudinary first
  const publicIdsToDelete = []

  // Prefer stored publicIds if you have them
  if (review.imagePublicIds?.length > 0) {
    publicIdsToDelete.push(...review.imagePublicIds)
  }
  // Fallback: extract from URLs
  else if (review.images?.length > 0) {
    review.images.forEach(url => {
      const id = extractPublicId(url)
      if (id) publicIdsToDelete.push(id)
    })
  }

  if (publicIdsToDelete.length > 0) {
    try {
      const result = await cloudinary.api.delete_resources(publicIdsToDelete)
      console.log('Cloudinary delete result:', result)
    } catch (err) {
      console.error('Cloudinary delete failed:', err)
      // Don't throw - still delete review from DB even if Cloudinary fails
    }
  }

  // 2. Remove review from product
  product.reviews = product.reviews.filter(
    (r) => r._id.toString() !== req.params.reviewId
  )

  // 3. Recalculate rating + numReviews
  product.numReviews = product.reviews.length
  product.rating =
    product.reviews.length > 0
      ? product.reviews.reduce((acc, r) => acc + r.rating, 0) / product.reviews.length
      : 0

  await product.save()
  res.json({ message: 'Review removed' })
})

// @route PUT /api/products/:id/reviews/:reviewId/helpful
// @access Private
const markReviewHelpful = asyncHandler(async (req, res) => {
  //const product = await Product.findById(req.params.id);
  let product = await Product.findOne({ slug: req.params.id })
if (!product && mongoose.Types.ObjectId.isValid(req.params.id)) {
  product = await Product.findById(req.params.id)
}

  if (product) {
    const review = product.reviews.id(req.params.reviewId);

    if (!review) {
      res.status(404);
      throw new Error('Review not found');
    }

    const alreadyVoted = review.helpful.find(
      (u) => u.toString() === req.user._id.toString()
    );

    if (alreadyVoted) {
      // Unvote
      review.helpful = review.helpful.filter(
        (u) => u.toString() !== req.user._id.toString()
      );
    } else {
      // Add vote
      review.helpful.push(req.user._id);
    }

    await product.save();

    // Return count + whether current user voted
    res.status(200).json({
      helpfulCount: review.helpful.length,
      userVoted: !alreadyVoted
    });
  } else {
    res.status(404);
    throw new Error('Product not found');
  }
});

// @route POST /api/products/:id/reviews/:reviewId/reply
// @access Private/Admin
const addAdminReply = asyncHandler(async (req, res) => {
  const { reply: replyText } = req.body; // <-- Only get reply from body
  //const product = await Product.findById(req.params.id); // productId from URL
  let product = await Product.findOne({ slug: req.params.id })
if (!product && mongoose.Types.ObjectId.isValid(req.params.id)) {
  product = await Product.findById(req.params.id)
}
  const reviewId = req.params.reviewId; // <-- Get reviewId from URL params

  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  const review = product.reviews.id(reviewId);

  if (!review) {
    res.status(404);
    throw new Error('Review not found');
  }

  review.adminReply = {
    reply: replyText, // <-- Use 'reply' not 'text' to match frontend
    name: req.user.name,
    user: req.user._id,
    createdAt: new Date(),
  };

  await product.save();
  res.status(201).json({ message: 'Reply added' });
});

// @route PUT /api/products/:id/reviews/:reviewId/reply
// @access Private/Admin
const editAdminReply = asyncHandler(async (req, res) => {
  const { reply } = req.body; // <-- Only get reply from body
  const reviewId = req.params.reviewId; // <-- Get from URL params
  //const product = await Product.findById(req.params.id);
  let product = await Product.findOne({ slug: req.params.id })
if (!product && mongoose.Types.ObjectId.isValid(req.params.id)) {
  product = await Product.findById(req.params.id)
}

  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  const review = product.reviews.id(reviewId);

  if (!review || !review.adminReply) { // <-- Check adminReply exists
    res.status(404);
    throw new Error('Reply not found');
  }

  review.adminReply.reply = reply; // <-- Use 'reply' field
  review.adminReply.repliedAt = Date.now();

  await product.save();
  res.status(200).json({ message: 'Reply updated' });
});

// @desc Delete admin reply
// @route DELETE /api/products/:id/reviews/:reviewId/reply
// @access Private/Admin
const deleteAdminReply = asyncHandler(async (req, res) => {
  const reviewId = req.params.reviewId; // <-- Get from URL params, not body
  //const product = await Product.findById(req.params.id);
  let product = await Product.findOne({ slug: req.params.id })
if (!product && mongoose.Types.ObjectId.isValid(req.params.id)) {
  product = await Product.findById(req.params.id)
}

  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  const review = product.reviews.id(reviewId);

  if (!review || !review.adminReply) {
    res.status(404);
    throw new Error('Review or reply not found');
  }

  review.adminReply = undefined; // <-- Delete the reply

  await product.save();
  res.json({ message: 'Reply deleted' });
});

// @desc    Update product specs
// @route   PUT /api/products/:id/specs
// @access  Private/Admin
const updateProductSpecs = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id)

  if (product) {
    // Fix: Default to empty object if specs is undefined
    product.specs = {
      ...(product.specs ? product.specs.toObject() : {}),
      ...req.body.specs,
    }

    const updatedProduct = await product.save()
    res.json(updatedProduct)
  } else {
    res.status(404)
    throw new Error('Product not found')
  }
})



module.exports = {
  createProduct,
  getProducts,
  getProductById,
  getProductBySlug,
  updateProduct,
  deleteProduct,
  createProductReview,
  getProductReviews,
  updateProductSpecs,
  updateProductReview,
  deleteProductReview,
  markReviewHelpful,
  addAdminReply,
  editAdminReply,
  deleteAdminReply
}