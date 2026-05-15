const express = require('express');
const router = express.Router();
const Product = require('../models/Product.js');
const asyncHandler = require('express-async-handler');
const { protect, admin } = require('../middleware/auth.js');

// GET /api/products - Public - Get all phones with filters
router.get('/', async (req, res) => {
  const { keyword, brand } = req.query;
  const query = {};
  
  if (keyword) query.name = { $regex: keyword, $options: 'i' };
  if (brand) query.brand = brand;

  const products = await Product.find(query);
  res.json(products);
});

// GET /api/products/:id - Public - Single phone
router.get('/:id', async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (product) res.json(product);
  else res.status(404).json({ message: 'Phone not found' });
});

// POST /api/products - Admin - Create phone
router.post('/', protect, admin, asyncHandler(async (req, res) => {
  //console.log('Request body:', req.body) 
  const { name, price, image, brand, category, countInStock, description } = req.body
  const product = new Product({
    name,
    price,
    user: req.user._id,
    image,
    brand,
    category,
    countInStock,
    description,
    numReviews: 0,
  })

  const createdProduct = await product.save();
  res.status(201).json(createdProduct);
}));

// PUT /api/products/:id - Admin - Update phone
router.put('/:id', protect, admin, async (req, res) => {
  const { name, price, description, image, brand, countInStock, specs } = req.body;
  const product = await Product.findById(req.params.id);
  
  if (product) {
    product.name = name;
    product.price = price;
    product.description = description;
    product.image = image;
    product.brand = brand;
    product.countInStock = countInStock;
    product.specs = specs;
    
    const updatedProduct = await product.save();
    res.json(updatedProduct);
  } else {
    res.status(404).json({ message: 'Phone not found' });
  }
});

// DELETE /api/products/:id - Admin - Delete phone
router.delete('/:id', protect, admin, async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (product) {
    await Product.deleteOne({ _id: product._id });
    res.json({ message: 'Phone removed' });
  } else {
    res.status(404).json({ message: 'Phone not found' });
  }
});

// @desc Create a product
// @route POST /api/products
// @access Private/Admin
// router.post('/', protect, admin, async (req, res) => {
//   const product = new Product({
//     name: 'Sample name',
//     price: 0,
//     user: req.user._id,
//     image: '/images/sample.jpg',
//     brand: 'Sample brand',
//     category: 'Sample category',
//     countInStock: 0,
//     numReviews: 0,
//     description: 'Sample description',
//   });

//   const createdProduct = await product.save();
//   res.status(201).json(createdProduct);
// });
// @desc Update a product
// @route PUT /api/products/:id
// @access Private/Admin
// router.put('/:id', protect, admin, async (req, res) => {
//   const { name, price, description, image, brand, category, countInStock } = req.body;

//   const product = await Product.findById(req.params.id);

//   if (product) {
//     product.name = name;
//     product.price = price;
//     product.description = description;
//     product.image = image;
//     product.brand = brand;
//     product.category = category;
//     product.countInStock = countInStock;

//     const updatedProduct = await product.save();
//     res.json(updatedProduct);
//   } else {
//     res.status(404).json({ message: 'Product not found' });
//   }
// });
// // @desc Delete a product
// // @route DELETE /api/products/:id
// // @access Private/Admin
// router.delete('/:id', protect, admin, async (req, res) => {
//   const product = await Product.findById(req.params.id);

//   if (product) {
//     await Product.deleteOne({ _id: product._id });
//     res.json({ message: 'Product removed' });
//   } else {
//     res.status(404).json({ message: 'Product not found' });
//   }
// });
 

module.exports = router;