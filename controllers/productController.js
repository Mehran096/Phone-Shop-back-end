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
const getProducts = asyncHandler(async (req, res) => {
  const products = await Product.find({})
  res.json(products)
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
  const { name, price, brand, category, countInStock, description } = req.body
  const product = await Product.findById(req.params.id)

  if (product) {
    product.name = name || product.name
    product.price = price || product.price
    product.brand = brand || product.brand
    product.category = category || product.category
    product.countInStock = countInStock || product.countInStock
    product.description = description || product.description

    if (req.files && req.files.length > 0) {
      // Delete old images from Cloudinary
      if (product.imagePublicIds && product.imagePublicIds.length > 0) {
        await cloudinary.api.delete_resources(product.imagePublicIds)
      }

      const newImages = req.files.map(file => file.path)
      const newPublicIds = req.files.map(file => file.filename)

      product.image = newImages[0]
      product.images = newImages
      product.imagePublicIds = newPublicIds
    }

    const updatedProduct = await product.save()
    res.json(updatedProduct)
  } else {
    res.status(404)
    throw new Error('Product not found')
  }
})

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

module.exports = {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
}