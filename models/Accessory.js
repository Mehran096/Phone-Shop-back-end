const mongoose = require('mongoose');
const slugify = require('slugify');

const accessorySchema = mongoose.Schema({
  name: { type: String, required: true }, // "Silicone Case - Purple"
  slug: { type: String, unique: true, lowercase: true },
  type: { 
    type: String, 
    required: true, 
    enum: ['Case', 'Charger', 'Glass', 'Cable', 'AirPods'] 
  },
  price: { type: Number, required: true }, // $29
  countInStock: { type: Number, required: true, default: 0 }, // 50
  image: { type: String, required: true }, // Main image
  images: { type: [String], default: [] }, // Gallery
  description: { type: String },
  
  // Link it to phones. Ex: Case works with iPhone 17
  compatibleWith: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }], 
  
  brand: { type: String }, // "Apple", "Anker"
  rating: { type: Number, default: 0 },
  numReviews: { type: Number, default: 0 },
}, { timestamps: true });

accessorySchema.pre('save', function () { 
  if (this.isModified('name') &&!this.slug) {
    this.slug = this.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
});

module.exports = mongoose.model('Accessory', accessorySchema);