const asyncHandler = require('express-async-handler')
const Product = require('../models/Product')
const { cloudinary } = require('../utils/cloudinary')

// @desc Create a product
// @route POST /api/products
// @access Private/Admin
const createProduct = asyncHandler(async (req, res) => {
  try {
    const { name, price, brand, category, countInStock, description } = req.body

    // Safe JSON parsing with fallbacks
    let colors = []
    let specs = []

    try {
      colors = req.body.colors? JSON.parse(req.body.colors) : []
    } catch (e) {
      res.status(400)
      throw new Error('Invalid colors format')
    }

    try {
      specs = req.body.specs? JSON.parse(req.body.specs) : []
    } catch (e) {
      res.status(400)
      throw new Error('Invalid specs format')
    }

    const colorsWithImages = colors.map((color, idx) => {
      const fieldName = `colorImages-${idx}`
      const colorFiles = req.files? req.files[fieldName] || [] : []

      return {
        name: color.name || '',
        hexCode: color.hexCode || '',
        countInStock: Number(color.countInStock) || 0,
        price: color.price? Number(color.price) : Number(price),
        images: colorFiles.map(file => file.path),
        imagePublicIds: colorFiles.map(file => file.filename),
      }
    })

    const totalStock = colorsWithImages.length > 0
     ? colorsWithImages.reduce((acc, c) => acc + c.countInStock, 0)
      : Number(countInStock) || 0

    const product = new Product({
      user: req.user._id,
      name,
      price: Number(price),
      brand,
      category,
      countInStock: totalStock,
      description,
      specs,
      colors: colorsWithImages,
      numReviews: 0,
      rating: 0,
    })

    const createdProduct = await product.save()
    res.status(201).json(createdProduct)
  } catch (error) {
    console.log('CREATE PRODUCT ERROR:', error)
    res.status(500).json({ message: error.message })
  }
})
// @desc Get all products
// @route GET /api/products
// @access Public
//pagination and search
 const getProducts = asyncHandler(async (req, res) => {
  const pageSize = 8
  //const pageSize = req.query.pageNumber == 1 ? 8 : 6
  const page = Number(req.query.pageNumber) || 1

  const keyword = req.query.keyword
    ? {
        $and: req.query.keyword
          .trim()
          .split(' ')
          .filter(Boolean) // remove empty strings from double spaces
          .map(word => ({
            $or: [
              { name: { $regex: word, $options: 'i' } },
              { brand: { $regex: word, $options: 'i' } },
              { category: { $regex: word, $options: 'i' } },
              // add color field if you have it
              // { color: { $regex: word, $options: 'i' } },
            ]
          }))
      }
    : {}

  const count = await Product.countDocuments({ ...keyword })
  const products = await Product.find({ ...keyword })
    .limit(pageSize)
    .skip(pageSize * (page - 1))
    .sort({ createdAt: -1 })

  res.json({ products, page, pages: Math.ceil(count / pageSize) })
})

// @desc Get product by ID
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
  const product = await Product.findById(req.params.id)

  if (!product) {
    res.status(404)
    throw new Error('Product not found')
  }

  const { name, price, description, brand, category, specs, countInStock } = req.body
  // Fix specs update
    if (specs) {
      product.specs = {
        ...(product.specs ? product.specs.toObject() : {}),
        ...specs,
      }
    }

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
  const colors = req.body.colors? JSON.parse(req.body.colors) : []
  const parsedSpecs = req.body.specs? JSON.parse(req.body.specs) : []

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
      price: color.price? Number(color.price) : Number(price),
      images: [...(color.images || []),...newImageUrls],
      imagePublicIds: [...(color.imagePublicIds || []),...newPublicIds],
    }
  })

  // 4. Handle MAIN image update - optional if you still use it
  if (req.files?.image) {
    if (product.imagePublicIds?.[0]) {
      await cloudinary.uploader.destroy(product.imagePublicIds[0])
    }
    product.image = req.files.image[0].path
    product.imagePublicIds = [req.files.image[0].filename]
  }

  // 5. Update product fields
  product.name = name || product.name
  product.price = Number(price) || product.price
  product.brand = brand || product.brand
  product.category = category || product.category
  product.description = description || product.description
  product.specs = parsedSpecs
  product.colors = colorsWithImages
  product.countInStock = colorsWithImages.reduce((acc, c) => acc + c.countInStock, 0)

  

  const updatedProduct = await product.save()
  res.json(updatedProduct)
})

const extractPublicIdFromUrl = (url) => {
  try {
    // Regex grabs everything after /upload/ and before the file extension
    const matches = url.match(/\/upload\/(?:v\d+\/)?(.+)\.\w+$/)
    return matches? matches[1] : null
  } catch {
    return null
  }
}

// @desc Delete product
// @route DELETE /api/products/:id
// @access Private/Admin
const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id)

  if (!product) {
    res.status(404)
    throw new Error('Product not found')
  }

  try {
    const publicIdsToDelete = new Set() // Use Set to avoid duplicates

    // Helper to extract public_id from Cloudinary URL
    const extractPublicId = (url) => {
      if (!url) return null
      // Example: https://res.cloudinary.com/demo/image/upload/v1234/products/img.jpg
      const matches = url.match(/\/upload\/(?:v\d+\/)?(.+)\.\w+$/)
      return matches? matches[1] : null
    }

    // 1. Main product image
    if (product.imagePublicIds?.length > 0) {
      product.imagePublicIds.forEach(id => publicIdsToDelete.add(id))
    } else if (product.image) {
      const id = extractPublicId(product.image)
      if (id) publicIdsToDelete.add(id)
    }

    // 2. All color images
    product.colors.forEach(color => {
      // Use stored publicIds first
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

    // 3. Delete from Cloudinary
    const idsArray = [...publicIdsToDelete]
    if (idsArray.length > 0) {
      console.log('Deleting from Cloudinary:', idsArray)
      await cloudinary.api.delete_resources(idsArray)
    }

    // 4. Delete from DB
    await product.deleteOne()
    res.json({ message: 'Product removed' })

  } catch (error) {
    console.error('Delete error:', error)
    res.status(500).json({ message: 'Failed to delete product' })
  }
})

// @desc Create new review
// @route POST /api/products/:id/reviews
// @access Private
const createProductReview = asyncHandler(async (req, res) => {
  const { rating, comment, color, images } = req.body
  console.log('Backend got images:', images);

  const product = await Product.findById(req.params.id)

  if (product) {
    const alreadyReviewed = product.reviews.find(
      (r) => r.user.toString() === req.user._id.toString() && r.color === color
    )

    if (alreadyReviewed) {
      res.status(400)
      throw new Error('Product already reviewed for this color')
    }

    const review = {
      name: req.user.name,
      rating: Number(rating),
      comment,
      user: req.user._id,
      color,
      images: images || [],
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

// @desc Update product review
// @route PUT /api/products/:id/reviews/:reviewId
// @access Private
const updateProductReview = asyncHandler(async (req, res) => {
  const { rating, comment, images } = req.body;

  const product = await Product.findById(req.params.id);
  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  const review = product.reviews.id(req.params.reviewId);
  if (!review) {
    res.status(404);
    throw new Error('Review not found');
  }

  // Check if user owns this review
  if (review.user.toString()!== req.user._id.toString()) {
    res.status(401);
    throw new Error('Not authorized');
  }

  // 1. Find images that were removed and delete from Cloudinary
  const oldImages = review.images || [];
  const newImages = images || [];
  const imagesToDelete = oldImages.filter((img) =>!newImages.includes(img));

  for (const imageUrl of imagesToDelete) {
    try {
      // Extract public_id from URL: https://res.cloudinary.com/demo/image/upload/v123/reviews/abc123.jpg
      // Result: "reviews/abc123"
      const publicId = imageUrl.split('/').slice(-2).join('/').split('.')[0];
      await cloudinary.uploader.destroy(publicId);
      console.log('Deleted from Cloudinary:', publicId);
    } catch (err) {
      console.error('Cloudinary delete failed:', err);
      // Don't throw - still update the review even if Cloudinary delete fails
    }
  }

  // 2. Update review fields
  review.rating = Number(rating) || review.rating;
  review.comment = comment || review.comment;
  review.images = newImages;

  // 3. Recalculate product rating
  product.rating =
    product.reviews.reduce((acc, item) => item.rating + acc, 0) /
    product.reviews.length;

  await product.save();
  res.status(200).json({ message: 'Review updated' });
});

// @desc Delete product review
// @route DELETE /api/products/:id/reviews/:reviewId
// @access Private
const deleteProductReview = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  // Find review by _id from URL params
  const review = product.reviews.find(
    (r) => r._id.toString() === req.params.reviewId
  );

  if (!review) {
    res.status(404);
    throw new Error('Review not found');
  }

  // Check if user owns the review or is admin
  if (review.user.toString()!== req.user._id.toString() &&!req.user.isAdmin) {
    res.status(401);
    throw new Error('Not authorized');
  }

  // 1. Delete images from Cloudinary first
  if (review.images && review.images.length > 0) {
    for (const imageUrl of review.images) {
      try {
        const publicId = imageUrl.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(`phone-products/${publicId}`);
      } catch (err) {
        console.error('Cloudinary delete failed:', err);
        // Don't throw - continue deleting review even if Cloudinary fails
      }
    }
  }

  // 2. Remove the review from array
  product.reviews = product.reviews.filter(
    (r) => r._id.toString()!== req.params.reviewId
  );

  // 3. Recalculate numReviews and rating
  product.numReviews = product.reviews.length;
  product.rating =
    product.reviews.length > 0
     ? product.reviews.reduce((acc, item) => item.rating + acc, 0) /
        product.reviews.length
      : 0;

  // 4. SAVE TO DATABASE - YOU'RE MISSING THIS
  await product.save();

  res.json({ message: 'Review removed' });
});

// @desc Mark review as helpful
// @route PUT /api/products/:id/reviews/helpful
// @access Private
const markReviewHelpful = asyncHandler(async (req, res) => {
  const { reviewId } = req.body;
  const product = await Product.findById(req.params.id);

  if (product) {
    const review = product.reviews.id(reviewId);

    if (!review) {
      res.status(404);
      throw new Error('Review not found');
    }

    const alreadyVoted = review.helpful.find(
      (u) => u.toString() === req.user._id.toString()
    );

    if (alreadyVoted) {
      // Unvote if already voted
      review.helpful = review.helpful.filter(
        (u) => u.toString()!== req.user._id.toString()
      );
    } else {
      // Add vote
      review.helpful.push(req.user._id);
    }

    await product.save();
    res.status(200).json({ message: 'Vote updated' });
  } else {
    res.status(404);
    throw new Error('Product not found');
  }
});

// @desc Add admin reply to review
// @route PUT /api/products/:id/reviews/reply
// @access Private/Admin
const addAdminReply = asyncHandler(async (req, res) => {
  const { reviewId, replyText } = req.body;
  const product = await Product.findById(req.params.id);

  if (product) {
    const review = product.reviews.id(reviewId);

    if (!review) {
      res.status(404);
      throw new Error('Review not found');
    }

    review.adminReply = {
      text: replyText,
      name: req.user.name,
      repliedAt: Date.now(),
    };

    await product.save();
    res.status(200).json({ message: 'Reply added' });
  } else {
    res.status(404);
    throw new Error('Product not found');
  }
});

// @desc Update admin reply
// @route PUT /api/products/:id/reviews/reply/edit
// @access Private/Admin
const editAdminReply = asyncHandler(async (req, res) => {
  const { reviewId, replyText } = req.body;
  const product = await Product.findById(req.params.id);

  if (product) {
    const review = product.reviews.id(reviewId);
    if (!review ||!review.adminReply?.text) {
      res.status(404);
      throw new Error('Reply not found');
    }

    review.adminReply.text = replyText;
    review.adminReply.repliedAt = Date.now();

    await product.save();
    res.status(200).json({ message: 'Reply updated' });
  } else {
    res.status(404);
    throw new Error('Product not found');
  }
});

// @desc Delete admin reply
// @route DELETE /api/products/:id/reviews/reply
// @access Private/Admin
const deleteAdminReply = asyncHandler(async (req, res) => {
  const { reviewId } = req.body;
  const product = await Product.findById(req.params.id);

  if (product) {
    const review = product.reviews.id(reviewId);
    if (!review) {
      res.status(404);
      throw new Error('Review not found');
    }

    review.adminReply = undefined;
    await product.save();
    res.status(200).json({ message: 'Reply deleted' });
  } else {
    res.status(404);
    throw new Error('Product not found');
  }
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
}