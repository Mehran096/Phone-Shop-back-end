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
  createProductReview,
  updateProductSpecs
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
router.route('/').get(getProducts)
//single product
router.route('/:id').get(getProductById)


//reviews
router.route('/:id/reviews').post(protect, createProductReview)



 // Admin
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
router.route('/:id').put(protect, admin, upload.array('images', 6), updateProduct)
router.route('/:id').delete(protect, admin, deleteProduct) 
//specs
router.route('/:id/specs').put(protect, admin, updateProductSpecs)

module.exports = router;