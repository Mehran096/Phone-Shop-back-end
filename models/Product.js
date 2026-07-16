const mongoose = require('mongoose');
const slugify = require('slugify');

const reviewSchema = mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  title: {
    type: String,
    //required: true,
    trim: true,
    maxlength: 120,
  },
  rating: { type: Number, required: true },
  color: { type: String, required: true },
  storage: { type: String },
  comment: { type: String, required: true },
  helpful: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],

  notHelpful: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  verifiedPurchase: {
    type: Boolean,
    default: false,
  },
  images: [{ // V33.14 KEY: Array of Objects like Product V9.59
    url: { type: String, required: true },
    imagePublicId: { type: String, required: true },
  }],
  adminReply: { reply: String, name: String, user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, createdAt: Date },
}, { timestamps: true });

// V8.7 COLOR = GALLERY ONLY. NO imageUrl
const colorSchema = new mongoose.Schema({
  name: { type: String, required: true }, // Black, Purple
  hexCode: { type: String, trim: true }, // Black, Purple
  price: { type: Number, required: true, min: 0 }, // V9.43 KEY: $999 per color
  discount: {
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
    startDate: {
      type: Date,
    },
    endDate: {
      type: Date,
    },
    isActive: {
      type: Boolean,
      default: false,
    },
  },
  countInStock: { type: Number, required: true, min: 0, default: 0 }, // V9.43 KEY: 5 per color
  sku: { type: String }, // V9.43 KEY: SKU per color
  images: [{ // V9.59 KEY: V9.47 Schema
    url: { type: String, required: true },
    imagePublicId: { type: String },
  }],
}, { _id: false });

// V9.43 KEY: VARIANT = STORAGE LEVEL ONLY
const variantSchema = new mongoose.Schema({
  storage: { type: String, required: true }, // "256GB"
  specs: { type: Object, default: {} }, // V9.43 KEY: Add this for dynamic specs
  description: { type: String, default: '' }, // V9.43 KEY: Add this for dynamic desc
  colors: { type: [colorSchema], default: [] }, // V9.43 KEY: Colors now have price
}, { _id: false });

const productSchema = mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true, lowercase: true, index: true },
  brand: { type: String, required: true },
  category: { type: String, required: true },
  metaTitle: String,
  metaDescription: String,
  keywords: [{ type: String }],
  accessories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Accessory' }],
  //specs: { ram: String, display: String, battery: String, camera: String },

  // V8.7 NEW STRUCTURE ONLY. DELETED: price, image, images, colors
  variants: { type: [variantSchema], default: [] },
  allSales: {
    type: Number,
    default: 0,
    min: 0,
  },
  rating: { type: Number, required: true, default: 0 },
  numReviews: { type: Number, required: true, default: 0 },
  reviews: [reviewSchema],
}, { timestamps: true });

// V8.6 UNIQUE SLUG
productSchema.pre('save', function () {
  if (!this.slug && this.name) {
    this.slug = `${slugify(this.name, { lower: true, strict: true })}-${Date.now()}`;
  }

});

const Product = mongoose.model('Product', productSchema);
module.exports = Product;