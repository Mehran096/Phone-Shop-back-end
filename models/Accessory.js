const mongoose = require('mongoose');
const slugify = require('slugify');

const accessorySchema = new mongoose.Schema({
  name: { type: String, required: true }, // "Tempered Glass - iPhone 17"
  slug: { type: String, unique: true, lowercase: true },
  type: { 
    type: String,
    required: true,
    enum: ['Case', 'Charger', 'Glass', 'Cable'] // REMOVED AirPods
  },
  brand: { type: String }, // "Anker", "Apple"
  compatibleWith: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }], // Key
  
  price: { type: Number, required: true },
  discount: { // ADD THIS
    type: { type: String, enum: ["percentage", "fixed"], default: null },
    value: { type: Number, default: 0 },
    startDate: Date, 
    endDate: Date, 
    isActive: { type: Boolean, default: false },
  },
  countInStock: { type: Number, required: true, default: 0 },
  sku: { type: String },
  images: [{ url: { type: String, required: true }, imagePublicId: String }],
  description: { type: String, default: '' },
  specs: { type: Object, default: {} }, // "Wattage": "20W"
  
}, { timestamps: true });

accessorySchema.pre('save', function () {
  if (this.isModified('name') && !this.slug) {
    this.slug = slugify(this.name, { lower: true, strict: true }) + '-' + Date.now();
  }
});

module.exports = mongoose.model('Accessory', accessorySchema);