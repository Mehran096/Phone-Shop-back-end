const mongoose = require('mongoose')

const wishlistItemSchema = new mongoose.Schema({
  type: { type: String, required: true, enum: ['product', 'accessory'] },
  
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  accessory: { type: mongoose.Schema.Types.ObjectId, ref: 'Accessory' },
  
  // For Products: to save different color + storage
  productVariantIndex: { type: Number, default: 0 },
  productColorIndex: { type: Number, default: 0 },
  
  // For Accessories: to save different model + variant
  modelIndex: { type: Number, default: 0 },
  accessoryVariantIndex: { type: Number, default: 0 },

}, { _id: true }) // keep _id so we can delete 1 item

const wishlistSchema = new mongoose.Schema({ 
  user: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User',
    unique: true
  },
  items: { type: [wishlistItemSchema], default: [] }
}, { timestamps: true })

module.exports = mongoose.model('Wishlist', wishlistSchema)