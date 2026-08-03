const mongoose = require('mongoose');
const slugify = require('slugify');

const reviewSchema = mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  rating: { type: Number, required: true },
  comment: { type: String, required: true },
}, { timestamps: true });

// 1. COLOR/VARIANT OPTION - like "Black", "2m", "20W"
const accessoryOptionSchema = new mongoose.Schema({
  name: { type: String, required: true }, // "Black", "2 m"
  hexCode: { type: String, trim: true }, // Only for colors: "#000"
  compatibleModel: { type: [String], default: [] },
  price: { type: Number, required: true, min: 0 }, // Price for this specific option
  discount: {
    type: { type: String, enum: ["percentage", "fixed"], default: null },
    value: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: false },
  },
  countInStock: { type: Number, required: true, min: 0, default: 0 }, // Stock for this option
  sku: { type: String },
  images: [{
    url: { type: String, required: true },
    imagePublicId: { type: String },
  }],
}, { _id: false });

// 2. VARIANT GROUP - like "Color" or "Cable Length"
const accessoryVariantSchema = new mongoose.Schema({
  type: { type: String, required: true }, // "Color" or "Cable Length"
  value: { type: String, required: false}, // "Select Color" - just a label
  specs: { type: Object, default: {} },
  description: { type: String, required: false, default: '' },
  options: { type: [accessoryOptionSchema], default: [] }, // The actual choices go here
}, { _id: false });
  
const accessorySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
  name: { type: String, required: true }, // "MagSafe Case"
  slug: { type: String, required: true, unique: true, lowercase: true, index: true },
  brand: { type: String, required: true },
  category: { type: String, required: false }, // "Case", "Charger", "Cable"
  description: { type: String, required: false },

  metaTitle: String,
  metaDescription: String,
  keywords: [{ type: String }],
  
  // THIS HOLDS ALL SELECTORS
  variants: { type: [accessoryVariantSchema], default: [] },

  // THIS HOLDS PHONE COMPATIBILITY
  compatibleWith: { 
  type: [String], 
  required: true,
  default: []
},

  rating: { type: Number, required: true, default: 0 },
  numReviews: { type: Number, required: true, default: 0 },
  reviews: [reviewSchema],
}, { timestamps: true });

// Auto create slug
accessorySchema.pre('save', function () {
  if (!this.slug && this.name) {
    this.slug = `${slugify(this.name, { lower: true, strict: true })}-${Date.now()}`;
  }
});

const Accessory = mongoose.model('Accessory', accessorySchema);
module.exports = Accessory;