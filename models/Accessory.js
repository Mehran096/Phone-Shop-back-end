const mongoose = require('mongoose');
const slugify = require('slugify');

const reviewSchema = mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  title: { 
    type: String, 
    trim: true, 
    maxlength: 120,
  },  
  
  rating: { type: Number, required: true },
  
  // CHANGED FOR ACCESSORIES
  model: { type: String, default: '' }, // "iPhone 17 Pro Max" or "Universal"
  variant: { type: String, default: '' }, // "White 20W" or "1m Cable"
  
  comment: { type: String, required: true },
  
  helpful: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  notHelpful: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  verifiedPurchase: { type: Boolean, default: false },
  
  images: [{ 
    url: { type: String, required: true }, 
    imagePublicId: { type: String, required: true } 
  }],
  
  replies: [{
     _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
    user: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
    name: { type: String, required: true },
    comment: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
  }],
}, { timestamps: true })

// 1. DISCOUNT SCHEMA - same as you have
const discountSchema = new mongoose.Schema({
  type: { type: String, enum: ["percentage", "fixed"], default: null },
  value: { type: Number, default: 0, min: 0 },
  startDate: { type: Date },
  endDate: { type: Date },
  isActive: { type: Boolean, default: false },
}, { _id: false });

// 2. BULK PRICING - NEW for "1x, 3x" Bol deals
const bulkPricingSchema = new mongoose.Schema({
  qty: { type: Number, required: true }, // 1, 2, 3
  price: { type: Number, required: true },
  discountLabel: { type: String }, // "8% korting"
}, { _id: false });

// 3. SINGLE VARIANT - This replaces colorVariant. Works for all types
const variantSchema = new mongoose.Schema({
  sku: { type: String, required: true }, // AUTO: CHARGER-WHITE-20W-1M

  // Common fields
  name: { type: String, required: true }, // "White 20W USB-C to Lightning"
  color: { type: String, default: '' },
  colorHex: { type: String, trim: true, default: '#000' },

  // Charger/Cable specific
  wattage: { type: String, default: '' }, // "20W", "30W"
  cableType: { type: String, default: '' }, // "USB-C to Lightning"
  cableLength: { type: String, default: '' }, // "1m", "2m"

  // Glass specific
  hardness: { type: String, default: '' }, // "9H"
  thickness: { type: String, default: '' }, // "0.3mm"
  glassType: { type: String, default: '' }, // "Clear", "Privacy", "Matte"

  // Audio specific
  connectorType: { type: String, default: '' }, // "USB-C to 3.5mm"
  audioBits: { type: String, default: '' }, // "32-Bit DAC"
  
   originalPrice: { type: Number, required: true, default: 0 },
  // Common commerce
  price: { type: Number, required: true, default: 0 },
  discount: discountSchema,
   bulkBase: {
    type: String,
    enum: ['original', 'discounted'],
    default: 'discounted' // Default = stack bulk on discount
  },
  bulkPricing: [bulkPricingSchema], // NEW
  countInStock: { type: Number, required: true, default: 0 },
  images: [{
    url: { type: String, required: true },
    imagePublicId: { type: String }
  }],
}, { _id: false });

// 4. MODEL GROUP - "iPhone 17 Pro Max" group
const modelVariantSchema = new mongoose.Schema({
  modelName: { type: String, required: true }, // "iPhone 17 Pro Max" or "Universal"
  description: { type: String, default: '' },
  specs: [{ key: { type: String }, value: { type: String } }], // Dynamic specs
  variants: [variantSchema] // <-- renamed from colorVariants
}, { _id: false });

const accessorySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
  name: { type: String, required: true },
  brand: { type: String, required: true },

  // 5. ACCESSORY TYPE - NEW. This controls what fields show in form
  accessoryType: {
    type: String,
    required: true,
    enum: ["case", "charger", "cable", "glass", "audio", "holder", "other"],
    default: "case"
  },

  featured: { type: Boolean, default: false }, // Toggle in admin
  featuredPriority: { type: Number, default: 0 }, // 1 = highest priority

  category: { type: String, required: true }, // Keep for old data

  slug: { type: String, required: true, unique: true, lowercase: true, index: true },

  metaTitle: { type: String },
  metaDescription: { type: String },
  keywords: [{ type: String }],

  reviews: [reviewSchema],
  models: [modelVariantSchema], // <-- renamed from variants
  
  allSales: {
    type: Number,
    default: 0,
    min: 0,
  },

  rating: { type: Number, required: true, default: 0 },
  numReviews: { type: Number, required: true, default: 0 },
}, { timestamps: true });


// Auto create slug
accessorySchema.pre('save', function () {
  if (!this.slug && this.name) {
    this.slug = `${slugify(this.name, { lower: true, strict: true })}-${Date.now()}`;
  }
  // AUTO SEO
  if (!this.metaTitle) {
    this.metaTitle = `${this.name} - Buy ${this.brand} ${this.accessoryType} Online`;
  }
  if (!this.metaDescription) {
    this.metaDescription = `Shop ${this.name} by ${this.brand}. Best price, fast delivery. ${this.accessoryType} with warranty.`;
  }
});

accessorySchema.index({ name: 'text', brand: 'text', keywords: 'text', category: 'text', accessoryType: 'text' });

const Accessory = mongoose.model('Accessory', accessorySchema);
module.exports = Accessory;