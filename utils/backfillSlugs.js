const mongoose = require('mongoose')
const slugify = require('slugify')
const Product = require('../models/Product.js')
require('dotenv').config()

const backfillSlugs = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI)
    console.log('DB Connected')

    const products = await Product.find({ $or: [{ slug: { $exists: false } }, { slug: null }] })
    console.log(`Found ${products.length} products without slugs`)

    for (let product of products) {
      let baseSlug = slugify(product.name, { lower: true, strict: true })
      let newSlug = baseSlug
      let counter = 1
      
      // Check if slug exists and increment if needed
      while (await Product.findOne({ slug: newSlug, _id: { $ne: product._id } })) {
        newSlug = `${baseSlug}-${counter}`
        counter++
      }
      
      await Product.updateOne(
        { _id: product._id },
        { $set: { slug: newSlug } }
      )
      console.log(`Updated: ${product.name} -> ${newSlug}`)
    }

    console.log('Backfill complete')
    process.exit()
  } catch (error) {
    console.error(error)
    process.exit(1)
  }
}

backfillSlugs()