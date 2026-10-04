const express = require('express');
const router = express.Router();
const { getBlogs, getBlogBySlug, getAllBlogsAdmin, createBlog, updateBlog, deleteBlog } = require('../controllers/blogController');
const { protect, admin } = require('../middleware/auth');
const { generateAutoBlog } = require('../utils/autoBlogAgent');

// --- NEW: Cron job endpoint for Render + cron-job.org ---
// POST https://your-backend.onrender.com/api/blogs/cron/auto-blog
// Header: x-cron-secret: your_secret
router.post('/cron/auto-blog', async (req, res) => {
  try {
    // Security check
    if (req.headers['x-cron-secret'] !== process.env.CRON_SECRET) {
      return res.status(401).json({ message: "Unauthorized - Invalid cron secret" });
    }

    console.log("⏰ External Cron triggered via API");
    const blog = await generateAutoBlog(req.body.topic || "");

    if (!blog) {
      return res.status(500).json({ message: "Blog generation failed" });
    }

    res.json({ 
      success: true, 
      message: "Blog auto-generated successfully",
      blog: {
        title: blog.title,
        slug: blog.slug,
        id: blog._id
      }
    });
  } catch (err) {
    console.error("Cron API error:", err.message);
    res.status(500).json({ message: err.message });
  }
});

// Public routes
router.get('/', getBlogs);
router.get('/:slug', getBlogBySlug);

// Admin routes
router.get('/admin/all', protect, admin, getAllBlogsAdmin);
router.post('/', protect, admin, createBlog);
router.put('/:id', protect, admin, updateBlog);
router.delete('/:id', protect, admin, deleteBlog);

module.exports = router;