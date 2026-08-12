const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const router = express.Router();
//const generateToken = require('../utils/generateToken.js')
const { protect} = require('../middleware/auth.js');
const { admin } = require('../middleware/adminMiddleware');
const generateToken = require('../utils/generateToken')
const { 
  registerUser,
  authUser,
  forgotPassword, 
  resetPassword,
   loginGoogle,
   saveUserCart,
   getUserCart,
   
} = require('../controllers/userController')
// const {
//   getWishlist,
//   addToWishlist,
//   removeFromWishlist,
//   updateWishlistItemQty,
// } = require('../controllers/wishlistController') // NEW IMPORT
const asyncHandler = require('express-async-handler');
 
// Generate JWT
// const generateToken = (id) => {
//   return jwt.sign({ id }, process.env.JWT_SECRET, {
//     expiresIn: '30d',
//   });
// };
  

// @desc    Register user
// @route   POST /api/users
// @access  Public
router.post('/', registerUser)

//google authentication
router.post('/google', loginGoogle)

// @desc    Get user cart
// @route   GET /api/users/cart
// @access  Private
router.get('/cart', protect, getUserCart)

// @desc    Save user cart
// @route   POST /api/users/cart
// @access  Private
router.post('/cart', protect, saveUserCart)

// router.put('/cart', protect, asyncHandler(async (req, res) => {
//   const user = await User.findById(req.user._id)
//   user.cartItems = req.body.cartItems || []
//   await user.save()
//   res.json({ cartItems: user.cartItems })
// }))

  


// Example admin route
router.get('/admin/users', protect, admin, async (req, res) => {
  const users = await User.find({});
  res.json(users);
   
});

 

// @desc Auth user & get token
// @route POST /api/users/auth
// @access Public
router.post('/auth', authUser)

// @desc Logout user / clear cookie
router.post('/logout', (req, res) => {
  res.cookie('jwt', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: new Date(0),
    domain: 'localhost'
  })
  res.status(200).json({ message: 'Logged out successfully' })
})

// @desc Get user profile
router.get('/profile', protect, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id)
  
  if (user) {
    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      isAdmin: user.isAdmin,
      cartItems: user.cartItems
    })
  } else {
    res.status(404)
    throw new Error('User not found')
  }
}))

//PUT PROFILE
router.put('/profile', protect, asyncHandler(async (req, res) => {
  // Block demo admin from destructive actions
const isDemoAdmin = req.user.email === 'demo@phonestore.com'
if (isDemoAdmin) {
  return res.status(403).json({ 
    message: 'Demo accounts have read-only access. Contact developer for full admin demo.' 
  })
}
  const user = await User.findById(req.user._id)

  if (user) {
    user.name = req.body.name || user.name
    user.email = req.body.email || user.email
    if (req.body.password) {
      user.password = req.body.password
    }

    const updatedUser = await user.save()

    res.json({
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      isAdmin: updatedUser.isAdmin,
      cartItems: updatedUser.cartItems // <- Add this
      // token: generateToken(updatedUser._id), // <- Delete this line
    })
  } else {
    res.status(404)
    throw new Error('User not found')
  }
}))



// router.route('/wishlist')
//   .get(protect, getWishlist)
//   .post(protect, addToWishlist)

// router.route('/wishlist/:id').delete(protect, removeFromWishlist).put(protect, updateWishlistItemQty)

// @desc    Get all users
// @route   GET /api/users
// @access  Private/Admin
router.get('/', protect, admin, asyncHandler(async (req, res) => {
  
  const pageSize = 10
  const page = Number(req.query.pageNumber) || 1

  const keyword = req.query.keyword
    ? {
        $or: [
          { name: { $regex: req.query.keyword, $options: 'i' } },
          { email: { $regex: req.query.keyword, $options: 'i' } },
        ],
      }
    : {}

  const count = await User.countDocuments({ ...keyword })
  const users = await User.find({ ...keyword })
    .select('-password')
    .limit(pageSize)
    .skip(pageSize * (page - 1))
    .sort({ createdAt: -1 })

  res.json({ users, page, pages: Math.ceil(count / pageSize) })
}))
// @desc Get user by ID
// @route GET /api/users/:id
// @access Private/Admin
router.get('/:id', protect, admin, asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select('-password')
  if (user) {
    res.json(user)
  } else {
    res.status(404)
    throw new Error('User not found')
  }
}))

// @desc Update user
// @route PUT /api/users/:id
// @access Private/Admin
router.put('/:id', protect, admin, asyncHandler(async (req, res) => {
  // Block demo admin from destructive actions
const isDemoAdmin = req.user.email === 'demo@phonestore.com'
if (isDemoAdmin) {
  return res.status(403).json({ 
    message: 'Demo accounts have read-only access. Contact developer for full admin demo.' 
  })
}
  const user = await User.findById(req.params.id)

  if (user) {
    user.name = req.body.name || user.name
    user.email = req.body.email || user.email
    user.isAdmin = req.body.isAdmin !== undefined ? req.body.isAdmin : user.isAdmin

    const updatedUser = await user.save()

    res.json({
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      isAdmin: updatedUser.isAdmin,
    })
  } else {
    res.status(404)
    throw new Error('User not found')
  }
}))

// @desc Delete user
// @route DELETE /api/users/:id
// @access Private/Admin
router.delete('/:id', protect, admin, asyncHandler(async (req, res) => {
  // Block demo admin from destructive actions
const isDemoAdmin = req.user.email === 'demo@phonestore.com'
if (isDemoAdmin) {
  return res.status(403).json({ 
    message: 'Demo accounts have read-only access. Contact developer for full admin demo.' 
  })
}
  const user = await User.findById(req.params.id)

  if (user) {
    if (user.isAdmin) {
      res.status(400)
      throw new Error('Cannot delete admin user')
    }
    await User.deleteOne({ _id: user._id })
    res.json({ message: 'User removed' })
  } else {
    res.status(404)
    throw new Error('User not found')
  }
}))

router.put('/:id/toggleAdmin', protect, admin, async (req, res) => {
  // Block demo admin from destructive actions
const isDemoAdmin = req.user.email === 'demo@phonestore.com'
if (isDemoAdmin) {
  return res.status(403).json({ 
    message: 'Demo accounts have read-only access. Contact developer for full admin demo.' 
  })
}
  const user = await User.findById(req.params.id)
  
  if (user) {
    // Prevent self-demotion
    if (req.user._id.toString() === user._id.toString()) {
      res.status(400)
      throw new Error('Cannot demote yourself')
    }
    
    user.isAdmin = !user.isAdmin
    const updatedUser = await user.save()
    res.json({ 
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      isAdmin: updatedUser.isAdmin
    })
  } else {
    res.status(404)
    throw new Error('User not found')
  }
})
 
  

router.post('/forgotpassword', forgotPassword)
router.put('/resetpassword/:resettoken', resetPassword)
module.exports = router;