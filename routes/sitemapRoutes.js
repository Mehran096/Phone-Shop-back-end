const express = require('express')
const Product = require('../models/Product.js')
const router = express.Router()

const escapeXml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

router.get('/sitemap.xml', async (req, res) => {
  try {
    const products = await Product.find({
      slug: { $exists: true, $nin: [null, ''] }
    })
      .select('slug updatedAt')
      .lean()

    const brands = await Product.distinct('brand')

    const brandUrls = brands
      .filter(Boolean)
      .map((brand) => {
        const url = `https://phone-store.asia/products?brand=${encodeURIComponent(brand)}`

        return `
  <url>
    <loc>${escapeXml(url)}</loc>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>`
      })
      .join('')

    const productUrls = products
      .map((product) => {
        const url = `https://phone-store.asia/product/${encodeURIComponent(product.slug)}`

        return `
  <url>
    <loc>${escapeXml(url)}</loc>
    ${product.updatedAt ? `<lastmod>${new Date(product.updatedAt).toISOString()}</lastmod>` : ''}
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`
      })
      .join('')

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://phone-store.asia/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>${brandUrls}${productUrls}
</urlset>`

    res.set('Content-Type', 'application/xml; charset=utf-8')
    res.set('Cache-Control', 'public, s-maxage=86400')
    res.status(200).send(sitemap)
  } catch (err) {
    console.error('Sitemap generation error:', err)
    res.status(500).end()
  }
})

module.exports = router