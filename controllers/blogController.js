const Blog = require('../models/Blog');
const asyncHandler = require('express-async-handler');

const getBlogs = asyncHandler(async (req, res) => {
  const { category, search, page = 1, limit = 9 } = req.query;
  let filter = { status: 'published' };
  
  if (category && category !== "All" && category.toLowerCase() !== "all") {
    filter.category = { $regex: new RegExp(`^${category.trim()}$`, 'i') };
  }
  
  if (search && search.trim() !== "") {
    const s = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // escape regex
    const searchRegex = { $regex: s, $options: 'i' };
    filter.$or = [
      { title: searchRegex },
      { excerpt: searchRegex },
      { tags: searchRegex },
      { content: searchRegex }
    ];
  }
  
  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 9));
  const skip = (pageNum - 1) * limitNum;

  const total = await Blog.countDocuments(filter);
  const pages = Math.ceil(total / limitNum);
  const blogs = await Blog.find(filter)
    .populate('author', 'name email')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limitNum)
    .lean(); // FIX: lean = faster, no hooks

  res.json({ blogs, total, page: pageNum, pages, hasMore: pageNum < pages });
});

const getBlogBySlug = asyncHandler(async (req, res) => {
  const blog = await Blog.findOne({ slug: req.params.slug }).populate('author', 'name email');
  if (!blog) {
    res.status(404);
    throw new Error('Blog not found');
  }
  // FIX: increment views WITHOUT triggering validate hook
  await Blog.updateOne({ _id: blog._id }, { $inc: { views: 1 } });
  blog.views += 1;
  res.json(blog);
});

const getAllBlogsAdmin = asyncHandler(async (req, res) => {
  const blogs = await Blog.find({}).populate('author', 'name email').sort({ createdAt: -1 }).lean();
  res.json(blogs);
});

const createBlog = asyncHandler(async (req, res) => {
  const { title, excerpt, content, coverImage, category, tags, metaTitle, metaDescription, slug: incomingSlug, aiGenerated, aiModel, featured } = req.body;
  
  if (!title || !excerpt || !content) {
    res.status(400);
    throw new Error('Title, excerpt, and content are required');
  }

  let coverImageObj = { url: "", publicId: "" };
  if (typeof coverImage === 'string' && coverImage) {
    coverImageObj.url = coverImage;
  } else if (coverImage && typeof coverImage === 'object') {
    coverImageObj.url = coverImage.url || "";
    coverImageObj.publicId = coverImage.publicId || "";
  }

  // Force unique image if agent sends same image again
  if (!coverImageObj.url) {
    coverImageObj.url = `https://picsum.photos/seed/${Date.now()}-${Math.random()}/800/600`;
  }

  const blogData = {
    title: title.trim(),
    excerpt: excerpt.trim(),
    content,
    coverImage: coverImageObj,
    category: category || "Mobile Guide",
    tags: Array.isArray(tags) ? tags.map(t => String(t).trim().toLowerCase()).filter(Boolean) : [],
    metaTitle: metaTitle || title.substring(0, 60),
    metaDescription: metaDescription || excerpt.substring(0, 155),
    author: req.user?._id,
    status: "published",
    featured: featured || false,
    aiGenerated: aiGenerated || false,
    aiModel: aiModel || "",
  };
  
  if (incomingSlug) blogData.slug = incomingSlug;

  const blog = await Blog.create(blogData);
  res.status(201).json(blog);
});

const updateBlog = asyncHandler(async (req, res) => {
  const blog = await Blog.findById(req.params.id);
  if (!blog) {
    res.status(404);
    throw new Error('Blog not found');
  }

  const updates = { ...req.body };
  
  if (updates.coverImage) {
    if (typeof updates.coverImage === 'string') {
      updates.coverImage = { url: updates.coverImage, publicId: blog.coverImage?.publicId || "" };
    }
  }

  if (updates.title && updates.title !== blog.title && !updates.slug) {
    delete updates.slug; // let pre-validate generate new slug
  }

  const updatedBlog = await Blog.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
  res.json(updatedBlog);
});

const deleteBlog = asyncHandler(async (req, res) => {
  const blog = await Blog.findById(req.params.id);
  if (!blog) {
    res.status(404);
    throw new Error('Blog not found');
  }
  await blog.deleteOne();
  res.json({ message: 'Blog deleted successfully' });
});

module.exports = { getBlogs, getBlogBySlug, getAllBlogsAdmin, createBlog, updateBlog, deleteBlog };