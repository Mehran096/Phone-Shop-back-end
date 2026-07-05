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
  console.log('V9.47 BODY RECEIVED:', JSON.stringify(req.body, null, 2)); // Debug

  const {
    name, brand, category, metaTitle, metaDescription, // V9.47 KEY: No description/specs
    keywords = [], accessories = [], variants = [],
  } = req.body;

  if (!name || !brand) { // V9.47 KEY: description removed
    res.status(400);
    throw new Error('Please add name and brand');
  }

  if (!variants || variants.length === 0) {
    res.status(400);
    throw new Error('Please add at least 1 storage variant');
  }

  // V9.47 KEY: MAP PRICE/STOCK/SKU FROM COLOR LEVEL
  const cleanVariants = variants
    .map(v => ({
      storage: v.storage,
      specs: v.specs || {}, // V9.47 KEY: Per variant specs
      description: v.description || '', // V9.47 KEY: Per variant desc
      colors: (v.colors || [])
        .filter(c => c.name && c.images?.length > 0) // Must have name + 1 image
        .map(c => ({
          name: c.name,
          price: Number(c.price), // V9.47 KEY: SKU price
          countInStock: Number(c.countInStock) || 0, // V9.47 KEY: SKU stock
          sku: c.sku || '', // V9.47 KEY: SKU code
          images: c.images,
          //imagePublicIds: c.imagePublicIds || [],
        })),
    }))
    .filter(v => v.colors.length > 0); // Remove empty variants

  if (cleanVariants.length === 0) {
    res.status(400);
    throw new Error('Each variant needs at least 1 color with 1 image');
  }

  // V9.47 KEY: SLUG + META FROM FIRST VARIANT
  const baseSlug = slugify(name, { lower: true, strict: true, remove: /[*+~.()'"!:@]/g });
  const productsSlug = `${baseSlug}-${Date.now()}`;

  const autoMetaTitle = metaTitle || `${name} | ${brand} ${cleanVariants[0]?.storage || ''}`;
  const autoMetaDescription = metaDescription || `Buy ${name} from ${brand}.`; // V9.47 KEY: No description

  try {
    const product = new Product({
      user: req.user._id,
      name,
      slug: productsSlug,
      brand,
      category,
      // description: REMOVED V9.47 KEY
      metaTitle: autoMetaTitle.slice(0, 60),
      metaDescription: autoMetaDescription.slice(0, 155),
      keywords,
      accessories,
      // specs: REMOVED V9.47 KEY
      variants: cleanVariants, // V9.47 KEY: All data lives here
      numReviews: 0,
      rating: 0,
    });

    const createdProduct = await product.save();
    res.status(201).json(createdProduct);
  } catch (error) {
    console.error('REAL MONGOOSE ERROR:', error);
    res.status(400);
    throw new Error(error.message);
  }
});

// @desc    Fetch all products with filters
// @route   GET /api/products
// @access  Public
const getProducts = asyncHandler(async (req, res) => {
  const pageSize = Number(req.query.pageSize) || 8;
  const page = Number(req.query.pageNumber) || 1;

  const { keyword, brand, category, minPrice, maxPrice, storage } = req.query;

  // 1. Search Filter: V9.51 KEY = variants.storage + variants.colors.name
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
              { keywords: { $regex: word, $options: 'i' } },
              { 'variants.storage': { $regex: word, $options: 'i' } }, // V9.51 KEY
              { 'variants.colors.name': { $regex: word, $options: 'i' } }, // V9.51 KEY
            ],
          })),
      }
    : {};

  // 2. Other Filters
  const brandFilter = brand ? { brand: { $regex: brand, $options: 'i' }} : {};
  const categoryFilter = category ? { category: { $regex: category, $options: 'i' }} : {};

  // 3. Storage Filter: V9.51 KEY = Exact match 256GB
  const storageFilter = storage
    ? { 'variants.storage': { $regex: `^${storage}$`, $options: 'i' }}
    : {};

  // 4. Price Filter: V9.51 KEY = $elemMatch on variants.colors.price
  const priceFilter =
    minPrice || maxPrice
      ? {
          'variants.colors': { 
            $elemMatch: {
              price: {
                ...(minPrice && { $gte: Number(minPrice) }),
                ...(maxPrice && { $lte: Number(maxPrice) }),
              },
            },
          },
        }
      : {};

  const filter = { ...searchFilter, ...brandFilter, ...categoryFilter, ...storageFilter, ...priceFilter };

  const count = await Product.countDocuments(filter);

  // 3. Select: V9.51 KEY = Removed `specs` + `price` root
  const products = await Product.find(filter)
    .populate('accessories', 'name slug price image type') // FBT
    .select('name slug brand category image rating numReviews variants metaTitle') // V9.51 KEY: No specs
    .limit(pageSize)
    .skip(pageSize * (page - 1))
    .sort({ createdAt: -1 });

  // 4. Frontend helper: V9.51 KEY = Min price from all Colors for shop card
  const productsWithMin = products.map(p => {
    const allColors = p.variants?.flatMap(v => v.colors) || []; // V9.51 KEY: Flatten all SKUs
    const uniqueColors = [...new Map(allColors.map(c => [c.name, c])).values()]; // Dedup by name
    
    const minColor = allColors.length > 0
      ? allColors.reduce((min, c) => c.price < min.price ? c : min, allColors[0]) // V9.51 KEY
      : { price: 0, countInStock: 0 };

    return {
      ...p.toObject(),
      minPrice: minColor.price, // V9.51 KEY: Card shows $999 From
      minStock: minColor.countInStock, // V9.51 KEY: Optional badge
      colors: uniqueColors, // V9.51 KEY: All colors for swatches
    };
  });

  res.json({ products: productsWithMin, page, pages: Math.ceil(count / pageSize) });
});

// @desc Fetch single product by slug
// @route GET /api/products/slug/:slug
// @access Public
const getProductBySlug = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ slug: req.params.slug })
   .populate('user', 'name') // who added it
   .populate('accessories', 'name slug price image type countInStock'); // FBT

  if (product) {
    // V9.48 KEY: NO MORE V8 FALLBACKS. SEND RAW DB DATA
    // Frontend V9.39+ logic: 
    // const selectedVariant = product.variants[selectedVariantIndex];
    // const selectedColor = selectedVariant.colors[selectedColorIndex];
    // const finalPrice = selectedColor.price;

    const allColors = product.variants?.flatMap(v => v.colors) || []; // V9.48 KEY: Flatten all colors for swatch UI
    const uniqueColors = [...new Map(allColors.map(c => [c.name, c])).values()]; // Dedup by name, keep first

    const productData = {
     ...product.toObject(),
      // V9.48 KEY: Only helper = all unique colors. No fake price/stock/root fields
      colors: uniqueColors, 
    };

    res.json(productData);
  } else {
    res.status(404);
    throw new Error('Product not found');
  }
});

// @desc    Get product by ID - Keep for admin panel
// @route   GET /api/products/:id
// @access  Public
const getProductById = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id)
    .populate('accessories', 'name slug price image type countInStock');

  if (product) {
    // V9.49 KEY: ADMIN = SAME RAW DATA AS FRONTEND. NO V8 FALLBACKS
    // Admin form should loop: product.variants.map(v => v.colors.map(c => c.price))

    const allColors = product.variants?.flatMap(v => v.colors) || []; // V9.49 KEY: Flatten for swatch table
    const uniqueColors = [...new Map(allColors.map(c => [c.name, c])).values()]; // Dedup by name, keep first

    const productData = {
     ...product.toObject(),
      // V9.49 KEY: Only helper = all unique colors. No fake price/stock/root fields
      colors: uniqueColors, 
    };

    res.json(productData);
  } else {
    res.status(404);
    throw new Error('Product not found');
  }
});

// // @desc Get product by ID - Keep for admin panel
// // @route GET /api/products/:id
// // @access Public
// const getProductById = asyncHandler(async (req, res) => {
//   const product = await Product.findById(req.params.id)

//   if (product) {
//     res.json(product)
//   } else {
//     res.status(404)
//     throw new Error('Product not found')
//   }
// })

// @desc Update a product
// @route PUT /api/products/:id
// @access Private/Admin
// @desc    Update a product
// @route   PUT /api/products/:id
// @access  Private/Admin
const updateProduct = asyncHandler(async (req, res) => {
  const { 
    name, 
    brand, 
    category, 
    variants, 
    accessories, 
    keywords, 
    metaTitle, 
    metaDescription, 
    imagesToDelete // V38.64 KEY: Get delete queue from frontend
  } = req.body;

  const product = await Product.findById(req.params.id);

  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  // V38.64 KEY 1: DELETE IMAGES FROM CLOUDINARY FIRST
  if(imagesToDelete?.length > 0){
    console.log('V38.64 DELETE REQUEST:', imagesToDelete);
    const results = await Promise.allSettled(
      imagesToDelete.map(id => cloudinary.uploader.destroy(id))
    );
    const deleted = results.filter(r => r.status === 'fulfilled').length;
    console.log(`V38.64 Deleted ${deleted} images from Cloudinary`);
  }

  // Validation
  if (!variants || variants.length === 0) { 
    res.status(400); 
    throw new Error('Please add at least 1 variant'); 
  }

  // V9.52 KEY 2: Slug update
  if (name && name !== product.name) {
    product.slug = slugify(name, { 
      lower: true, 
      strict: true, 
      remove: /[*+~.()'"!:@]/g 
    });
  }

  // V10.13.50 KEY: Strip newFiles before saving to DB
const cleanVariants = variants.map(v => ({
  ...v,
  colors: v.colors.map(c => {
    const { newFiles, ...rest } = c; // remove frontend-only field
    return rest;
  })
}));

  // V9.52 KEY 3: Direct assign. NO `specs` root. NO Multer.
  product.name = name;
  product.brand = brand;
  product.category = category;
  // product.description = description;
  product.accessories = accessories; // array
  product.keywords = keywords; // array
  product.metaTitle = metaTitle?.slice(0, 60) || '';
  product.metaDescription = metaDescription?.slice(0, 160) || '';
  product.variants = cleanVariants; // V38.64 KEY: Save variants with imagePublicId

  const updatedProduct = await product.save();
  res.json(updatedProduct);
});



// @route   DELETE /api/products/:id
// @access  Private/Admin
const deleteProduct = asyncHandler(async (req, res) => {
  const isDemoAdmin = req.user.email === 'demo@phonestore.com';
  if (isDemoAdmin) {
    return res.status(403).json({ message: 'Demo accounts have read-only access.' });
  }

  const product = await Product.findById(req.params.id);
  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  try {
    const publicIdsToDelete = new Set();

    // 1. MAIN PRODUCT IMAGE
    if (product.image) {
      const mainImageId = extractPublicId(product.image);
      if (mainImageId) publicIdsToDelete.add(mainImageId);
    }

    // 2. VARIANT -> COLOR IMAGES
    product.variants?.forEach((variant) => {
      variant.colors?.forEach((color) => {
        color.images?.forEach((img) => {
          if (img?.imagePublicId) publicIdsToDelete.add(img.imagePublicId);
        });
      });
    });

    // 3. REVIEW IMAGES - V38.09 FIX
    product.reviews?.forEach((review) => {
      review.images?.forEach((img) => {
        if (img?.imagePublicId) publicIdsToDelete.add(img.imagePublicId);
      });
    });

    // 4. DELETE FROM CLOUDINARY
    const idsArray = [...publicIdsToDelete];
    if (idsArray.length > 0) {
      console.log(`V38.09 Deleting ${idsArray.length} images from Cloudinary`);
      for (let i = 0; i < idsArray.length; i += 100) {
        const batch = idsArray.slice(i, i + 100);
        await cloudinary.api.delete_resources(batch);
      }
    }

    // 5. DELETE PRODUCT FROM DB
    await product.deleteOne();

    // 6. CLEAN UP USER CARTS AND WISHLISTS
    const productId = new mongoose.Types.ObjectId(req.params.id);
    await User.updateMany({ wishlist: productId }, { $pull: { wishlist: productId } });
    await User.updateMany({ 'cart.product': productId }, { $pull: { cart: { product: productId } }});

    res.json({ message: 'Product and all images removed' });

  } catch (error) {
    console.error('Delete product error:', error);
    await product.deleteOne().catch(() => {});
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// @route POST /api/products/:id/reviews
// @access Private
const createProductReview = asyncHandler(async (req, res) => {
  const { rating, comment, color, storage, images } = req.body;

  let product = await Product.findOne({ slug: req.params.id });
  if (!product && mongoose.Types.ObjectId.isValid(req.params.id)) {
    product = await Product.findById(req.params.id);
  }

  if (product) {
    const alreadyReviewed = product.reviews.find(
      (r) => r.user.toString() === req.user._id.toString() && r.color === color && 
        r.storage === storage
    );

    if (alreadyReviewed) {
      res.status(400);
      throw new Error('Product already reviewed for this color');
    }

    // V38.12 KEY: CREATE REVIEW WITH IMAGES AS OBJECTS
    const review = {
      name: req.user.name || req.user.email?.split('@')[0] || 'User',
      rating: Number(rating),
      comment,
      user: req.user._id,
      color: color || 'Default',
      storage: storage || '',
      images: [], // V38.12 START EMPTY
    };

    // V38.12 KEY: CONVERT IMAGES TO {url, imagePublicId} OBJECTS
    if (images && images.length > 0) {
      images.forEach((img) => {
        // Case 1: Frontend sends full Cloudinary object { secure_url, public_id }
        if (typeof img === 'object' && img.secure_url && img.public_id) {
          review.images.push({
            url: img.secure_url,
            imagePublicId: img.public_id,
          });
        } 
        // Case 2: Frontend sends {url, imagePublicId} already
        else if (typeof img === 'object' && img.url && img.imagePublicId) {
          review.images.push({
            url: img.url,
            imagePublicId: img.imagePublicId,
          });
        }
        // Case 3: Frontend sends URL string only
        else if (typeof img === 'string') {
          review.images.push({
            url: img,
            imagePublicId: extractPublicId(img),
          });
        }
      });
    }

    product.reviews.push(review);
    product.numReviews = product.reviews.length;
    
    // V38.12 KEY: Calculate rating for all reviews
    product.rating = product.reviews.reduce((acc, item) => item.rating + acc, 0) / product.reviews.length;

    await product.save();
    res.status(201).json({ message: 'Review added' });
  } else {
    res.status(404);
    throw new Error('Product not found');
  }
});

// @desc Get all reviews for a product
// @route GET /api/products/:id/reviews
// @access Public
const getProductReviews = asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const { color, sort } = req.query;

  //console.log('V34.16 REQ PARAMS ID:', req.params.id, 'TYPE:', typeof req.params.id);
  //const product = await Product.findById(req.params.id);
  let product = await Product.findOne({ slug: req.params.id })
if (!product && mongoose.Types.ObjectId.isValid(req.params.id)) {
  product = await Product.findById(req.params.id)
}
//console.log('V34.16 PRODUCT FOUND:', product?._id, 'SLUG:', product?.slug);
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

// @desc    Update product review
// @route   PUT /api/products/:id/reviews/:reviewId
// @access  Private
const updateProductReview = asyncHandler(async (req, res) => {
  const { rating, comment, images } = req.body; // V33.31: images = [{url, imagePublicId}]

  let product = await Product.findOne({ slug: req.params.id });
  if (!product && mongoose.Types.ObjectId.isValid(req.params.id)) {
    product = await Product.findById(req.params.id);
  }

  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  const review = product.reviews.id(req.params.reviewId); // V33.31 KEY: Mongoose .id()
  if (!review) {
    res.status(404);
    throw new Error('Review not found');
  }

  // Check if user owns this review
  if (review.user.toString() !== req.user._id.toString() && !req.user.isAdmin) {
    res.status(401);
    throw new Error('Not authorized');
  }

  // 1. Delete removed images from Cloudinary V33.31
  const oldImages = review.images || []; // [{url, imagePublicId}]
  const newImages = images || []; // [{url, imagePublicId}] from frontend

  const publicIdsToDelete = oldImages
    .filter(oldImg => !newImages.some(newImg => newImg.imagePublicId === oldImg.imagePublicId)) // V33.31 KEY
    .map(img => img.imagePublicId)
    .filter(Boolean);

  if (publicIdsToDelete.length > 0) {
    try {
      const result = await cloudinary.api.delete_resources(publicIdsToDelete); // Bulk delete
      console.log('Cloudinary deleted:', publicIdsToDelete, result);
    } catch (err) {
      console.error('Cloudinary delete failed:', err);
      // Don't throw - still update DB
    }
  }

  // 2. Update review fields V33.31
  review.rating = Number(rating) || review.rating;
  review.comment = comment || review.comment;
  review.images = newImages; // V33.31 KEY: Direct replace. No imagePublicIds field

  // 3. Recalculate product rating V33.31
  product.numReviews = product.reviews.length;
  product.rating =
    product.reviews.length > 0
      ? product.reviews.reduce((acc, r) => acc + r.rating, 0) / product.reviews.length
      : 0;

  await product.save();
  res.json({ message: 'Review updated', review });
});

// @desc    Delete a product review + its images
// @route   DELETE /api/products/:id/reviews/:reviewId
// @access  Private
const deleteProductReview = asyncHandler(async (req, res) => {
  let product = await Product.findOne({ slug: req.params.id });
  if (!product && mongoose.Types.ObjectId.isValid(req.params.id)) {
    product = await Product.findById(req.params.id);
  }

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
  if (review.user.toString() !== req.user._id.toString() && !req.user.isAdmin) {
    res.status(401);
    throw new Error('Not authorized');
  }

  // 1. Delete images from Cloudinary first V33.25
  const publicIdsToDelete = [];
  if (review.images?.length > 0) { 
    review.images.forEach(img => {
      if (img.imagePublicId) publicIdsToDelete.push(img.imagePublicId); // V33.25 KEY
    });
  }

  if (publicIdsToDelete.length > 0) {
    try {
      const result = await cloudinary.api.delete_resources(publicIdsToDelete); // Bulk delete
      console.log('Cloudinary delete result:', result);
    } catch (err) {
      console.error('Cloudinary delete failed:', err);
      // Don't throw - still delete review from DB even if Cloudinary fails
    }
  }

  // 2. Remove review from product
  product.reviews = product.reviews.filter(
    (r) => r._id.toString() !== req.params.reviewId
  );

  // 3. Recalculate rating + numReviews
  product.numReviews = product.reviews.length;
  product.rating =
    product.reviews.length > 0
      ? product.reviews.reduce((acc, r) => acc + r.rating, 0) / product.reviews.length
      : 0;

  await product.save();
  res.json({ message: 'Review removed' });
});

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