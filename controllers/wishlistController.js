const asyncHandler = require('express-async-handler')
const Wishlist = require('../models/wishlistModel')
const calculateDiscount = require('../utils/discountHelper.js')

const getWishlist = asyncHandler(async (req, res) => {
  const wishlist = await Wishlist.findOne({ user: req.user._id })
 .populate('items.product', 'name slug variants images')
 .populate('items.accessory', 'name slug brand image models accessoryType')

  if (!wishlist) return res.json({ items: [] })

  let items = wishlist.items.filter(item => 
    (item.type === 'product' && item.product) || 
    (item.type === 'accessory' && item.accessory)
  )

  items = items.map(item => {
    if (item.type === 'product' && item.product) {
      const p = item.product.toObject() // we already do this
      const vIdx = item.productVariantIndex?? 0
      const cIdx = item.productColorIndex?? 0
      const variant = p.variants?.[vIdx]
      const color = variant?.colors?.[cIdx]

      if (variant && color) {
        const { finalPrice, discountAmount, isActive } = calculateDiscount(color.price, color.discount)
        // KEY FIX: Mutate 'p' not 'item.product'
        p.variants[vIdx].colors[cIdx] = {
       ...color,
          price: finalPrice,
          originalPrice: color.price,
          discount: {...color.discount, isActive},
          discountAmount
        }
      }
      item.product = p // KEY FIX: assign back the mutated object
    }

    if (item.type === 'accessory' && item.accessory) {
  const a = item.accessory.toObject() // we already do this
  const mIdx = item.modelIndex?? 0
  const vIdx = item.accessoryVariantIndex?? 0
  const model = a.models?.[mIdx]
  const variant = model?.variants?.[vIdx]

  if (model && variant) {
    const basePrice = variant.originalPrice || variant.price // KEY FIX
    const { finalPrice, discountAmount, isActive } = calculateDiscount(basePrice, variant.discount)
    // KEY FIX: Mutate 'a' not 'item.accessory'
    a.models[mIdx].variants[vIdx] = {
     ...variant,
      price: finalPrice,
      originalPrice: basePrice,
      discount: {...variant.discount, isActive},
      discountAmount
    }
  }
  item.accessory = a // KEY FIX: assign back the mutated object
}
    return item
  })

  res.json({...wishlist.toObject(), items })
})

 

// @desc    Toggle wishlist item - add if not exist, remove if exist
// @route   POST /api/wishlist/toggle
// @access  Private
const toggleWishlist = asyncHandler(async (req, res) => {
  const { 
    type, 
    productId, 
    accessoryId, 
    modelIndex = 0, 
    accessoryVariantIndex = 0, // renamed
    productVariantIndex = 0,   // new
    productColorIndex = 0      // new
  } = req.body
  const userId = req.user._id

  if (!type || (type === 'product' && !productId) || (type === 'accessory' && !accessoryId)) {
    res.status(400)
    throw new Error('Invalid request body')
  }

  let wishlist = await Wishlist.findOne({ user: userId })
  if (!wishlist) {
    wishlist = await Wishlist.create({ user: userId, items: [] })
  }

  // Find if EXACT same variant already exists
  const existingIndex = wishlist.items.findIndex(item => {
    if (type === 'product') {
      return item.type === 'product' && 
             item.product?.toString() === productId &&
             item.productVariantIndex === productVariantIndex &&
             item.productColorIndex === productColorIndex
    }
    if (type === 'accessory') {
      return item.type === 'accessory' && 
             item.accessory?.toString() === accessoryId && 
             item.modelIndex === modelIndex && 
             item.accessoryVariantIndex === accessoryVariantIndex
    }
    return false
  })

  let action = ''
  if (existingIndex > -1) {
    // Remove
    wishlist.items.splice(existingIndex, 1)
    action = 'removed'
  } else {
    // Add new variant
    wishlist.items.push({
      type,
      product: type === 'product' ? productId : undefined,
      accessory: type === 'accessory' ? accessoryId : undefined,
      productVariantIndex,
      productColorIndex,
      modelIndex,
      accessoryVariantIndex
    })
    action = 'added'
  }

  await wishlist.save()
  
  const populated = await wishlist.populate([
    { path: 'items.product', select: 'name slug variants images' },
    { path: 'items.accessory', select: 'name slug brand image models accessoryType' }
  ])

  res.json({ message: `Item ${action}`, wishlist: populated })
})

// @desc    Remove item from wishlist by item._id
// @route   DELETE /api/wishlist/:itemId
// @access  Private
const removeWishlistItem = asyncHandler(async (req, res) => {
  const wishlist = await Wishlist.findOne({ user: req.user._id })

  if (!wishlist) {
    res.status(404)
    throw new Error('Wishlist not found')
  }

  wishlist.items = wishlist.items.filter(
    (item) => item._id.toString() !== req.params.itemId
  )

  await wishlist.save()
  res.json({ message: 'Item removed', wishlist })
})

// @desc    Clear entire wishlist
// @route   DELETE /api/wishlist
// @access  Private
const clearWishlist = asyncHandler(async (req, res) => {
  const wishlist = await Wishlist.findOne({ user: req.user._id })
  if (wishlist) {
    wishlist.items = []
    await wishlist.save()
  }
  res.json({ message: 'Wishlist cleared' })
})

module.exports = {
  getWishlist,
  toggleWishlist,
  removeWishlistItem,
  clearWishlist,
}