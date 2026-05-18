const express = require('express');
const router = express.Router();
const Product = require('../models/Product.js');
const asyncHandler = require('express-async-handler');
const {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
} = require('../controllers/productController.js')
 
//console.log( createProduct)


const { protect, admin } = require('../middleware/auth.js');
 
const  multer = require('multer');
const { storage } = require('../utils/cloudinary.js');
 
 
const upload = multer({ storage,  limits: { fileSize: 10 * 1024 * 1024 }  }) 
//const upload = multer({ dest: 'uploads/' })
router.route('/').post(
  protect, 
  admin, 
  (req, res, next) => {
    upload.array('images', 6)(req, res, (err) => {
      if (err) {
        console.error('MULTER UPLOAD ERROR:', err)
        return res.status(400).json({ message: err.message })
      }
      next()
    })
  }, 
  createProduct
)





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

 // Admin

router.route('/:id').put(protect, admin, upload.array('images', 6), updateProduct)
router.route('/:id').delete(protect, admin, deleteProduct) 

module.exports = router;