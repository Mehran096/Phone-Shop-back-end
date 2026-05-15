const mongoose = require('mongoose');

const reviewSchema = mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  rating: { type: Number, required: true },
  comment: { type: String, required: true }
}, { timestamps: true });

const productSchema = mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // admin who added it
  name: { type: String, required: true }, // iPhone 15 Pro
  brand: { type: String, required: true }, // Apple, Samsung, Google
  image: { type: String, required: true }, // main image URL
  images: [String], // gallery
  description: { type: String, required: true },
  specs: {
    storage: { type: String }, // 256GB
    ram: { type: String }, // 8GB
    display: { type: String }, // 6.1 inch OLED
    battery: { type: String }, // 4000mAh
    camera: { type: String } // 48MP Triple
  },
  price: { type: Number, required: true, default: 0 },
  countInStock: { type: Number, required: true, default: 0 },
  rating: { type: Number, required: true, default: 0 },
  numReviews: { type: Number, required: true, default: 0 },
  reviews: [reviewSchema]
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);