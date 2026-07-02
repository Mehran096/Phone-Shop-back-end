const asyncHandler = require('express-async-handler')
const User = require('../models/User')
const Product = require('../models/Product')

 
// @desc    Get logged in user wishlist
// @route   GET /api/users/wishlist  
// @access  Private
const getWishlist = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id)

  if (!user) {
    res.status(404)
    throw new Error('User not found')
  }

  await user.populate({
    path: 'wishlist',
    select: 'name price image countInStock colors slug', 
  })

  // Filter out null products - same fix as cart
  const validWishlist = user?.wishlist.filter(item => item) || []

  // Clean DB if we found nulls
  if (validWishlist.length !== user.wishlist.length) {
    user.wishlist = validWishlist
    await user.save()
  }

  res.json(validWishlist)
})

// @desc Add item to wishlist
// @route POST /api/users/wishlist
// @access Private
const addToWishlist = asyncHandler(async (req, res) => {
  //console.log(req.body)
  const { product, name, color, storage, image, price, countInStock, slug } = req.body
  
//console.log('Backend received:', req.body.storage)
      if (!product || !name || !color || !image || !price || !storage || !slug) { // V24.6 KEY
      res.status(400);
      throw new Error('Missing required fields: product, name, color, storage, image, price, slug')
    }

  const user = await User.findById(req.user._id)

  if (user) {
    // FIX: Check if item.product exists before calling toString()
   const alreadyExists = user.wishlist.find(
  (item) => 
    item.product && 
    item.product.toString() === product && 
    item.storage === storage && // V24.6 KEY
    item.color === color
)

    if (alreadyExists) {
      res.status(400)
      throw new Error('Item already in wishlist')
    }

    const wishlistItem = { 
      product, 
      slug,
      name, 
      color, 
      image, 
      price,
      storage,
      countInStock: countInStock || 0,
      qty: 1,
    }
    
    user.wishlist.push(wishlistItem)
    await user.save()
    res.status(201).json(user.wishlist)
  } else {
    res.status(404)
    throw new Error('User not found')
  }
})

// @desc Remove item from wishlist
// @route DELETE /api/users/wishlist/:id
// @access Private
const removeFromWishlist = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id)

  if (user) {
    user.wishlist = user.wishlist.filter(
      (item) => item._id.toString() !== req.params.id
    )
    await user.save()
    res.json(user.wishlist)
  } else {
    res.status(404)
    throw new Error('User not found')
  }
})

// @desc Update wishlist item qty
// @route PUT /api/users/wishlist/:id
// @access Private
const updateWishlistItemQty = asyncHandler(async (req, res) => {
  const { qty } = req.body
  const user = await User.findById(req.user._id)

  if (user) {
    const wishlistItem = user.wishlist.id(req.params.id)
    
    if (wishlistItem) {
      wishlistItem.qty = Number(qty)
      await user.save()
      res.json(wishlistItem)
    } else {
      res.status(404)
      throw new Error('Wishlist item not found')
    }
  } else {
    res.status(404)
    throw new Error('User not found')
  }
})

module.exports = {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  updateWishlistItemQty,
}