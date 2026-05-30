const asyncHandler = require('express-async-handler')
const Product = require('../models/Product')
const { cloudinary } = require('../utils/cloudinary')

// @desc Create product
// @route POST /api/products
// @access Private/Admin
const createProduct = asyncHandler(async (req, res) => {
  // console.log('BODY:', req.body)
  // console.log('FILES:', req.files)
  // console.log('CLOUDINARY ENV:', {
  //   cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  //   api_key: process.env.CLOUDINARY_API_KEY? 'SET' : 'MISSING',
  //   api_secret: process.env.CLOUDINARY_API_SECRET? 'SET' : 'MISSING'
  // })

  if (!req.files || req.files.length === 0) {
    res.status(400)
    throw new Error('No files uploaded. Check multer and FormData key name.')
  }

  const imageUrls = req.files.map(file => file.path)
  const imagePublicIds = req.files.map(file => file.filename)

  //...rest of your product creation code
  const product = new Product({
    name: req.body.name,
    price: req.body.price,
    user: req.user._id,
    image: imageUrls[0] || '',
    images: imageUrls,
    imagePublicIds: imagePublicIds,
    brand: req.body.brand,
    category: req.body.category,
    countInStock: req.body.countInStock,
    description: req.body.description,
  })

  const createdProduct = await product.save()
  res.status(201).json(createdProduct)
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
        $or: [
          { name: { $regex: req.query.keyword, $options: 'i' } },
          { brand: { $regex: req.query.keyword, $options: 'i' } },
          { category: { $regex: req.query.keyword, $options: 'i'} }
        ]
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
const updateProduct = async (req, res) => {
  const product = await Product.findById(req.params.id)
  if (!product) throw new Error('Product not found')

  const existingImages = JSON.parse(req.body.existingImages || '[]')

  // Delete images removed by user
  const imagesToDelete = product.imagePublicIds.filter(
    (id, idx) =>!existingImages.includes(product.images[idx])
  )
  if (imagesToDelete.length > 0) {
    await cloudinary.api.delete_resources(imagesToDelete)
  }

  // Upload new images
  const newImages = req.files.map(file => file.path)
  const newPublicIds = req.files.map(file => file.filename)

  product.name = req.body.name
  product.price = req.body.price
  product.brand = req.body.brand
  product.description = req.body.description
  product.countInStock = req.body.countInStock
  product.images = [...existingImages,...newImages]

  // product.imagePublicIds = [...existingImages.map(img => {
  //   // Find matching publicId for kept images
  //   const idx = product.images.indexOf(img)
  //   return product.imagePublicIds[idx]
  // }).filter(Boolean),...newPublicIds]
  product.imagePublicIds = existingImages.map(img => {
  const idx = product.images.indexOf(img)
  return idx!== -1? product.imagePublicIds[idx] : null
}).filter(Boolean)

 
product.imagePublicIds = [...product.imagePublicIds,...newPublicIds]

product.image = product.images[0] || "" // Set main image to first image in array
product.imagePublicId = product.imagePublicIds[0] || "" // Keep publicId in sync


  const updatedProduct = await product.save()
  res.json(updatedProduct)
}

// @desc Delete product
// @route DELETE /api/products/:id
// @access Private/Admin
const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id)

  if (product) {
    if (product.imagePublicIds && product.imagePublicIds.length > 0) {
      await cloudinary.api.delete_resources(product.imagePublicIds)
      
    }

    await product.deleteOne()
    res.json({ message: 'Product removed' })
  } else {
    res.status(404)
    throw new Error('Product not found')
  }
})

//create reviews
const createProductReview = async (req, res) => {
  const { rating, comment } = req.body
  const product = await Product.findById(req.params.id)

  if (!product) {
    res.status(404)
    throw new Error('Product not found')
  }

  const existingReview = product.reviews.find(
    r => r.user.toString() === req.user._id.toString()
  )

  if (existingReview) {
    // Update existing review
    existingReview.rating = Number(rating)
    existingReview.comment = comment
    existingReview.updatedAt = Date.now()
  } else {
    // Create new review
    const review = {
      name: req.user.name,
      rating: Number(rating),
      comment,
      user: req.user._id,
    }
    product.reviews.push(review)
  }

  product.numReviews = product.reviews.length
  product.rating = product.reviews.reduce((acc, item) => item.rating + acc, 0) / product.reviews.length

  await product.save()
  res.status(200).json({ message: existingReview ? 'Review updated' : 'Review added' })
} 

// @desc    Update product specs
// @route   PUT /api/products/:id/specs
// @access  Private/Admin
const updateProductSpecs = async (req, res) => {
  const product = await Product.findById(req.params.id)

  if (product) {
    product.specs = {
      ...product.specs.toObject(),
      ...req.body.specs,
    }
    const updatedProduct = await product.save()
    res.json(updatedProduct)
  } else {
    res.status(404).json({ message: 'Product not found' })
  }
}



module.exports = {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  createProductReview,
  updateProductSpecs
}