const mongoose = require('mongoose');

const reviewSchema = mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  rating: { type: Number, required: true },
  color: { type: String, required: true },
  comment: { type: String, required: true },
  helpful: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  images: [String],
  imagePublicIds: { type: [String], default: [] },
  adminReply: {
    reply: String,
    name: String,
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: Date,
  },
}, { timestamps: true });

const productSchema = mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // admin who added it
  name: { type: String, required: true }, // iPhone 15 Pro
  brand: { type: String, required: true }, // Apple, Samsung, Google
  category: { type: String}, // ADD THIS
  image: { type: String}, // main image URL
  images: { type: [String], default: [] }, // gallery
  imagePublicIds: { type: [String], default: [] },
  description: { type: String, required: true },
  colors: {
    type: [
      {
        name: { type: String, required: true }, // "Dry Ice Blue"
        hexCode: { type: String, default: '#000000' }, // "#CBD5E1"
        images: { type: [String], required: true },
        imagePublicIds: { type: [String], default: [] },
        countInStock: { type: Number, required: true, default: 0 },
       price: { type: Number, required: true, default: 0 },  
      }
    ],
    default: []
  },
  reviews: [reviewSchema],
rating: { type: Number, required: true, default: 0 },
numReviews: { type: Number, required: true, default: 0 },
  specs: {
    storage: { type: String }, // 256GB
    ram: { type: String }, // 8GB
    display: { type: String }, // 6.1 inch OLED
    battery: { type: String }, // 4000mAh
    camera: { type: String } // 48MP Triple
  },
  price: { type: Number, required: true, default: 0 },
  countInStock: { type: Number, required: true, default: 0 }, 
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);