// server/routes/sitemapRoutes.js
const express = require('express')
const Product = require('../models/Product.js')
const router = express.Router()

router.get('/sitemap.xml', async (req, res) => {
  try {
    // Get all products with slug and updatedAt
    const products = await Product.find({}).select('slug updatedAt').lean()

    // Get unique brands from your DB
    const brands = await Product.distinct('brand')

    // Build brand filter URLs
    const brandUrls = brands.filter(Boolean).map(b => `
  <url>
    <loc>https://phone-store.asia/?brand=${encodeURIComponent(b)}</loc>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>`).join('')

    // Build product URLs
    const productUrls = products.map(p => `
  <url>
    <loc>https://phone-store.asia/product/${p.slug}</loc>
    <lastmod>${p.updatedAt ? new Date(p.updatedAt).toISOString() : new Date().toISOString()}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`).join('')

    // Build full sitemap XML
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://phone-store.asia</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  ${brandUrls}
  ${productUrls}
</urlset>`

    res.header('Content-Type', 'application/xml')
    res.send(sitemap)
  } catch (error) {
    console.error('Sitemap error:', error)
    res.status(500).send('Error generating sitemap')
  }
})

module.exports = router