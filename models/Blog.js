const mongoose = require('mongoose');
const slugify = require('slugify');

const blogSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  slug: { type: String, unique: true, lowercase: true },
  excerpt: { type: String, required: true },
  content: { type: String, required: true },
  coverImage: { type: String, default: "" },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  category: { 
    type: String, 
    default: "Mobile Guide",
    enum: ["Mobile Guide", "Phone Review", "Accessories", "Buying Tips", "Comparison", "News"]
  },
  tags: [{ type: String }],
  metaTitle: { type: String },
  metaDescription: { type: String },
  views: { type: Number, default: 0 },
  status: { type: String, enum: ["draft", "published"], default: "published" }
}, { timestamps: true });

// Auto slug + meta - no next() needed
blogSchema.pre('validate', function() {
  if (this.title) {
    this.slug = slugify(this.title, { lower: true, strict: true });
    this.metaTitle = this.title;
  }
  if (this.excerpt) {
    this.metaDescription = this.excerpt.substring(0, 155);
  }
});

blogSchema.index({ title: 'text', content: 'text', tags: 'text' });

module.exports = mongoose.model('Blog', blogSchema);