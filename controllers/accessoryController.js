const asyncHandler = require('express-async-handler');
const Accessory = require('../models/Accessory.js');
const User = require('../models/User.js');
const mongoose = require('mongoose');
const slugify = require('slugify');
const { cloudinary } = require('../utils/cloudinary');

// @desc    Fetch all accessories
// @route   GET /api/accessories
// @access  Public
const getAccessories = asyncHandler(async (req, res) => {
  const pageSize = 12;
  const page = Number(req.query.pageNumber) || 1;
  const keyword = req.query.keyword
    ? { name: { $regex: req.query.keyword, $options: 'i' }}
    : {};
  const categoryFilter = req.query.category ? { category: req.query.category } : {};

  const count = await Accessory.countDocuments({ ...keyword, ...categoryFilter });
  const accessories = await Accessory.find({ ...keyword, ...categoryFilter })
    .limit(pageSize)
    .skip(pageSize * (page - 1))
    .sort({ createdAt: -1 });

  res.json({ accessories, page, pages: Math.ceil(count / pageSize) });
});

// @desc    Fetch single accessory by ID
// @route   GET /api/accessories/:id
// @access  Public
const getAccessoryById = asyncHandler(async (req, res) => {
  const accessory = await Accessory.findById(req.params.id);

  if (accessory) {
    res.json(accessory);
  } else {
    res.status(404);
    throw new Error('Accessory not found');
  }
});

// @desc    Fetch single accessory by slug - FOR PRODUCT PAGE
// @route   GET /api/accessories/slug/:slug
// @access  Public
const getAccessoryBySlug = asyncHandler(async (req, res) => {
  const accessory = await Accessory.findOne({ slug: req.params.slug });

  if (accessory) {
    res.json(accessory);
  } else {
    res.status(404);
    throw new Error('Accessory not found');
  }
});

// @desc    Create new accessory - ADMIN
// @route   POST /api/accessories
// @access  Private/Admin
const createAccessory = asyncHandler(async (req, res) => {
  const {
    name,
    brand,
    category,
    metaTitle,
    metaDescription,
    keywords = [],
    variants = [], // NEW: [{modelName, description, specs, colorVariants}]
  } = req.body;

  if (!name || !brand || !category) {
    res.status(400);
    throw new Error('Please add name, brand and category');
  }

  if (!variants || variants.length === 0) {
    res.status(400);
    throw new Error('Please add at least 1 model variant');
  }

  // CLEAN VARIANTS - 2 LEVELS ONLY
  const cleanVariants = variants.map(model => ({
    modelName: model.modelName,
    description: model.description || '',
    specs: (model.specs || []).filter(s => s.key),
    colorVariants: (model.colorVariants || [])
      .filter(c => c.color && c.sku)
      .map(color => ({
        sku: color.sku,
        color: color.color,
        colorHex: color.colorHex || '#000',
        price: Number(color.price) || 0,
        discount: {
          type: color.discount?.type || null,
          value: Number(color.discount?.value) || 0,
          startDate: color.discount?.startDate || null,
          endDate: color.discount?.endDate || null,
          isActive: color.discount?.isActive || false,
        },
        countInStock: Number(color.countInStock) || 0,
        images: (color.images || []).filter(img => img.url),
      })),
  })).filter(m => m.colorVariants.length > 0);

  const baseSlug = slugify(name, { lower: true, strict: true });
  const accessorySlug = `${baseSlug}-${Date.now()}`;

  const accessory = new Accessory({
    user: req.user._id,
    name,
    slug: accessorySlug,
    brand,
    category,
    metaTitle: metaTitle || `${name} | ${brand}`,
    metaDescription: metaDescription || `Buy ${name} from ${brand}.`,
    keywords,
    variants: cleanVariants,
  });

  const createdAccessory = await accessory.save();
  res.status(201).json(createdAccessory);
});

// @desc    Update accessory - ADMIN
// @route   PUT /api/accessories/:id
// @access  Private/Admin
const updateAccessory = asyncHandler(async (req, res) => {
  const {
    name,
    brand,
    category,
    metaTitle,
    metaDescription,
    keywords,
    variants,
    removedPublicIds = [], // for cloudinary cleanup
  } = req.body;

  const accessory = await Accessory.findById(req.params.id);

  if (accessory) {
    // 1. DELETE IMAGES FROM CLOUDINARY
    if (removedPublicIds && removedPublicIds.length > 0) {
      for (let i = 0; i < removedPublicIds.length; i += 100) {
        const batch = removedPublicIds.slice(i, i + 100);
        await cloudinary.api.delete_resources(batch);
      }
    }

    const oldName = accessory.name;

    // 2. UPDATE BASIC FIELDS
    accessory.name = name || accessory.name;
    accessory.brand = brand || accessory.brand;
    accessory.category = category || accessory.category;
    if (keywords) accessory.keywords = keywords;
    if (metaTitle) accessory.metaTitle = metaTitle.slice(0, 60);
    if (metaDescription) accessory.metaDescription = metaDescription.slice(0, 155);

    // 3. UPDATE VARIANTS - FULL REPLACE
    if (variants) {
      accessory.variants = variants.map(model => ({
        modelName: model.modelName,
        description: model.description || '',
        specs: (model.specs || []).filter(s => s.key),
        colorVariants: (model.colorVariants || [])
          .filter(c => c.color && c.sku)
          .map(color => ({
            sku: color.sku,
            color: color.color,
            colorHex: color.colorHex || '#000',
            price: Number(color.price) || 0,
            discount: {
              type: color.discount?.type || null,
              value: Number(color.discount?.value) || 0,
              startDate: color.discount?.startDate || null,
              endDate: color.discount?.endDate || null,
              isActive: color.discount?.isActive || false,
            },
            countInStock: Number(color.countInStock) || 0,
            images: (color.images || []).filter(img => img.url),
          })),
      })).filter(m => m.colorVariants.length > 0);
    }

    // 4. REGENERATE SLUG IF NAME CHANGED
    if (name && name !== oldName) {
      const baseSlug = slugify(name, { lower: true, strict: true });
      accessory.slug = `${baseSlug}-${Date.now()}`;
    }

    const updatedAccessory = await accessory.save();
    res.json(updatedAccessory);
  } else {
    res.status(404);
    throw new Error('Accessory not found');
  }
});

// @desc    Delete accessory - ADMIN
// @route   DELETE /api/accessories/:id
// @access  Private/Admin
const deleteAccessory = asyncHandler(async (req, res) => {
  const isDemoAdmin = req.user.email === 'demo@phonestore.com';
  if (isDemoAdmin) {
    return res.status(403).json({ message: 'Demo accounts have read-only access.' });
  }

  const accessory = await Accessory.findById(req.params.id);
  if (!accessory) {
    res.status(404);
    throw new Error('Accessory not found');
  }

  // COLLECT ALL COLOR IMAGE PUBLIC_IDS
  const publicIdsToDelete = new Set();
  accessory.variants?.forEach((model) => {
    model.colorVariants?.forEach((color) => {
      color.images?.forEach((img) => {
        if (img.imagePublicId) publicIdsToDelete.add(img.imagePublicId);
      });
    });
  });

  const idsArray = [...publicIdsToDelete];
  if (idsArray.length > 0) {
    for (let i = 0; i < idsArray.length; i += 100) {
      const batch = idsArray.slice(i, i + 100);
      await cloudinary.api.delete_resources(batch);
    }
  }

  await accessory.deleteOne();

  // CLEAN UP USER CARTS AND WISHLISTS
  const accessoryId = new mongoose.Types.ObjectId(req.params.id);
  await User.updateMany({ wishlist: accessoryId }, { $pull: { wishlist: accessoryId } });
  await User.updateMany({ 'cart.product': accessoryId }, { $pull: { cart: { product: accessoryId } } });

  res.json({ message: 'Accessory and all images removed' });
});

// @desc    Create new review
// @route   POST /api/accessories/:id/reviews
// @access  Private
const createAccessoryReview = asyncHandler(async (req, res) => {
  const { rating, comment } = req.body;
  const accessory = await Accessory.findById(req.params.id);

  if (accessory) {
    const alreadyReviewed = accessory.reviews.find(
      (r) => r.user.toString() === req.user._id.toString()
    );
    if (alreadyReviewed) {
      res.status(400);
      throw new Error('Accessory already reviewed');
    }

    const review = {
      name: req.user.name,
      rating: Number(rating),
      comment,
      user: req.user._id,
    };

    accessory.reviews.push(review);
    accessory.numReviews = accessory.reviews.length;
    accessory.rating = accessory.reviews.reduce((acc, item) => item.rating + acc, 0) / accessory.reviews.length;

    await accessory.save();
    res.status(201).json({ message: 'Review added' });
  } else {
    res.status(404);
    throw new Error('Accessory not found');
  }
});

module.exports = {
  getAccessories,
  getAccessoryById,
  getAccessoryBySlug,
  createAccessory,
  updateAccessory,
  deleteAccessory,
  createAccessoryReview,
};