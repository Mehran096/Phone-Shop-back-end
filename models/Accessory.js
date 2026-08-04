const mongoose = require('mongoose');
const slugify = require('slugify');

const reviewSchema = mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  rating: { type: Number, required: true },
  comment: { type: String, required: true },
}, { timestamps: true });

// 100% MATCH TO PRODUCT.JS DISCOUNT
const discountSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["percentage", "fixed"],
    default: null,
  },
  value: {
    type: Number,
    default: 0,
    min: 0,
  },
  startDate: { type: Date },
  endDate: { type: Date },
  isActive: {
    type: Boolean,
    default: false,
  },
}, { _id: false });

const colorVariantSchema = new mongoose.Schema({
  sku: { type: String, required: true }, // AUTO: CASE-BLACK-IP17PM
  color: { type: String, required: true }, // Black
  colorHex: { type: String, trim: true, default: '#000' },
  price: { type: Number, required: true, default: 0 },
  discount: discountSchema,
  countInStock: { type: Number, required: true, default: 0 },
  images: [{ 
    url: { type: String, required: true }, 
    imagePublicId: { type: String } 
  }],
}, { _id: false });

const modelVariantSchema = new mongoose.Schema({
  modelName: { type: String, required: true }, // "iPhone 17 Pro Max"
  description: { type: String, default: '' },
  specs: [{ key: { type: String }, value: { type: String } }],
  colorVariants: [colorVariantSchema]
}, { _id: false });

const accessorySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
  name: { type: String, required: true }, // "MagSafe Case"
  brand: { type: String, required: true },
  category: { type: String, required: true }, // "Case", "Charger", "Cable"
  slug: { type: String, required: true, unique: true, lowercase: true, index: true },
  
  metaTitle: { type: String },
  metaDescription: { type: String },
  keywords: [{ type: String }],
  
  reviews: [reviewSchema],
  variants: [modelVariantSchema], // <-- ONLY THIS. Model > Colors. NO compatibleWith
  
  rating: { type: Number, required: true, default: 0 },
  numReviews: { type: Number, required: true, default: 0 },
}, { timestamps: true });

// Auto create slug
accessorySchema.pre('save', function () {
  if (!this.slug && this.name) {
    this.slug = `${slugify(this.name, { lower: true, strict: true })}-${Date.now()}`;
  }
});

const Accessory = mongoose.model('Accessory', accessorySchema);
module.exports = Accessory;




