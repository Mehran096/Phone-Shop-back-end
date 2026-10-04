const mongoose = require('mongoose');
const slugify = require('slugify');

const blogSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  slug: { type: String, lowercase: true }, // FIXED: no unique, no index here at all
  excerpt: { type: String, required: true, maxlength: 300 },
  content: { type: String, required: true },
  coverImage: { 
    url: { type: String, default: "" },
    publicId: { type: String, default: "" }
  },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  category: { 
    type: String, 
    default: "Mobile Guide",
    enum: ["Mobile Guide", "Phone Review", "Accessories", "Buying Tips", "Comparison", "News"]
  },
  tags: [{ type: String, trim: true, lowercase: true }],
  metaTitle: { type: String, maxlength: 60 },
  metaDescription: { type: String, maxlength: 160 },
  views: { type: Number, default: 0 },
  featured: { type: Boolean, default: false },
  status: { type: String, enum: ["draft", "published"], default: "published" },
  aiGenerated: { type: Boolean, default: false },
  aiModel: { type: String, default: "" }
}, { timestamps: true });

blogSchema.pre('validate', async function() {
  if (this.isModified('title') || this.isNew) {
    let baseSlug = slugify(this.title, { lower: true, strict: true });
    let slug = baseSlug;
    let count = 1;
    while (await mongoose.models.Blog.findOne({ slug, _id: { $ne: this._id } })) {
      slug = `${baseSlug}-${count++}`;
    }
    this.slug = slug;
    if (!this.metaTitle) this.metaTitle = this.title.substring(0, 60);
  }
  if (this.isModified('excerpt') && !this.metaDescription) {
    this.metaDescription = this.excerpt.substring(0, 155);
  }
});

// Define ALL indexes ONLY here - nowhere else
blogSchema.index({ slug: 1 }, { unique: true });
blogSchema.index({ title: 'text', content: 'text', tags: 'text' });
blogSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Blog', blogSchema);