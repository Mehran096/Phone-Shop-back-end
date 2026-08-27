const express = require('express')
const Product = require('../models/Product.js')
const router = express.Router()

router.get('/sitemap.xml', async (req, res) => {
  try {
    const products = await Product.find({ 
      slug: { $exists: true, $ne: null, $ne: "" } 
    }).select('slug updatedAt').lean()
    
    const brands = await Product.distinct('brand')
    
    // console.log('=== SITEMAP DEBUG ===')
    // console.log('Products count:', products.length)

    const brandUrls = brands.filter(Boolean).map(b => `
  <url>
    <loc>https://phone-store.asia/products?brand=${encodeURIComponent(b)}</loc>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>`).join('')

    const productUrls = products.map(p => `
  <url>
    <loc>https://phone-store.asia/product/${p.slug}</loc>
    <lastmod>${p.updatedAt ? new Date(p.updatedAt).toISOString() : new Date().toISOString()}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`).join('')

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="https://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://phone-store.asia</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>${brandUrls}${productUrls}
</urlset>`

    // console.log('productUrls length:', productUrls.length)
    // console.log('FINAL SITEMAP LENGTH:', sitemap.length)
    // console.log('SENDING SITEMAP WITH PRODUCTS:', sitemap.includes('/product/'))

    res.header('Content-Type', 'application/xml')
    res.header('Cache-Control', 'public, s-maxage=86400');
    res.send(sitemap)  // <-- ONLY THIS ONE

  } catch (err) {
    console.error(err)
    res.status(500).end()
  }
})

module.exports = router