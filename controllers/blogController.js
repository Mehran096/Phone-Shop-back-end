const Blog = require('../models/Blog');
const asyncHandler = require('express-async-handler');

// @desc    Get all published blogs (Public) - SEARCH + FILTER + PAGINATION
// @route   GET /api/blogs?category=Comparison&search=infinix&page=1&limit=9
// @access  Public
const getBlogs = asyncHandler(async (req, res) => {
  const { category, search, page = 1, limit = 9 } = req.query;
  
  let filter = { status: 'published' };
  
  // --- 1. Category filter - ignore "All" - case-insensitive ---
  if (category && category !== "All" && category.toLowerCase() !== "all") {
    filter.category = { $regex: new RegExp(`^${category.trim()}$`, 'i') };
  }

  // --- 2. Search filter - title, excerpt, tags ---
  if (search && search.trim() !== "") {
    const searchRegex = { $regex: search.trim(), $options: 'i' };
    filter.$or = [
      { title: searchRegex },
      { excerpt: searchRegex },
      { tags: searchRegex },
      { content: searchRegex }
    ];
  }

  // --- 3. Pagination logic ---
  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 9)); // max 50 per request
  const skip = (pageNum - 1) * limitNum;

  // Get total count for this filter
  const total = await Blog.countDocuments(filter);
  const pages = Math.ceil(total / limitNum);

  const blogs = await Blog.find(filter)
    .populate('author', 'name email')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limitNum);

  // Return object - frontend can show total + Load More logic
  res.json({
    blogs,
    total,
    page: pageNum,
    pages,
    hasMore: pageNum < pages
  });
});

// @desc    Get single blog by slug (Public)
// @route   GET /api/blogs/:slug
// @access  Public
const getBlogBySlug = asyncHandler(async (req, res) => {
  const blog = await Blog.findOne({ slug: req.params.slug })
    .populate('author', 'name email');

  if (!blog) {
    res.status(404);
    throw new Error('Blog not found');
  }

  blog.views += 1;
  await blog.save();
  res.json(blog);
});

// @desc    Get all blogs for admin (including drafts)
// @route   GET /api/blogs/admin/all
// @access  Private/Admin
const getAllBlogsAdmin = asyncHandler(async (req, res) => {
  const blogs = await Blog.find({})
    .populate('author', 'name email')
    .sort({ createdAt: -1 });
  res.json(blogs);
});

// @desc    Create a new blog (Admin)
// @route   POST /api/blogs
// @access  Private/Admin
const createBlog = asyncHandler(async (req, res) => {
  const { title, excerpt, content, coverImage, category, tags, metaTitle, metaDescription, slug: incomingSlug } = req.body;

  if (!title || !excerpt || !content) {
    res.status(400);
    throw new Error('Title, excerpt, and content are required');
  }

  let slug = incomingSlug;
  if (!slug) {
    slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + Date.now().toString().slice(-6);
  }

  const existing = await Blog.findOne({ slug });
  if (existing) {
    slug = `${slug}-${Math.floor(Math.random() * 10000)}`;
  }

  const blog = await Blog.create({
    title,
    slug,
    excerpt,
    content,
    coverImage: coverImage || "",
    category: category || "Mobile Guide",
    tags: tags || [],
    metaTitle: metaTitle || title.substring(0, 60),
    metaDescription: metaDescription || `${excerpt.substring(0, 140)} - Shop at phone-store.asia`,
    author: req.user?._id,
    status: "published"
  });

  res.status(201).json(blog);
});

// @desc    Update blog (Admin)
// @route   PUT /api/blogs/:id
// @access  Private/Admin
const updateBlog = asyncHandler(async (req, res) => {
  const blog = await Blog.findById(req.params.id);
  
  if (!blog) {
    res.status(404);
    throw new Error('Blog not found');
  }

  if (req.body.title && req.body.title !== blog.title) {
    req.body.slug = req.body.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + Date.now().toString().slice(-6);
  }

  const updatedBlog = await Blog.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });

  res.json(updatedBlog);
});

// @desc    Delete blog (Admin)
// @route   DELETE /api/blogs/:id
// @access  Private/Admin
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