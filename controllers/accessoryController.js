const asyncHandler = require('express-async-handler');
const Accessory = require('../models/Accessory.js');
const User = require('../models/User.js');
const mongoose = require('mongoose');
const slugify = require('slugify');
const { cloudinary } = require('../utils/cloudinary');
const calculateDiscount = require('../utils/discountHelper');
const calculateBulkPrice = require('../utils/bulkPriceHelper');

 
// HELPER: Apply discount + bulk pricing to a variant - FOR DISPLAY ONLY
const processVariant = (variant, qty = 1) => {
  const originalPrice = Number(variant.originalPrice) || 0;
  const dbPrice = Number(variant.price) || 0; // This is already discounted from DB

  // Find bulk tier from DB that we already saved
  const appliedTier = (variant.bulkPricing || [])
   .filter(t => qty >= Number(t.qty))
   .sort((a, b) => Number(b.qty) - Number(a.qty))[0];

  const pricePerItem = appliedTier? Number(appliedTier.price) : dbPrice;
  const totalPrice = Number((pricePerItem * qty).toFixed(2));

  return {
    sku: variant.sku,
    name: variant.name,
    color: variant.color || '',
    colorHex: variant.colorHex || '#0000',
    wattage: variant.wattage || '',
    cableType: variant.cableType || '',
    cableLength: variant.cableLength || '',
    hardness: variant.hardness || '',
    thickness: variant.thickness || '',
    glassType: variant.glassType || '',
    connectorType: variant.connectorType || '',
    audioBits: variant.audioBits || '',

    originalPrice: originalPrice > dbPrice? originalPrice : null,
    price: dbPrice, // DB price
    displayPrice: pricePerItem, // Final price with bulk
    totalPrice: totalPrice,
    discount: variant.discount,
    bulkPricing: variant.bulkPricing || [],
    appliedBulkTier: appliedTier,
    countInStock: Number(variant.countInStock) || 0,
    images: (variant.images || []).filter(img => img.url),
  };
};

// HELPER: Auto calculate price + bulk before saving - Rule B
const applyAccessoryDiscountCalc = (variant) => {
  if(!variant.discount?.isActive){
    variant.price = Number(variant.originalPrice || 0)
    variant.discountAmount = 0
    return
  }

  const original = Number(variant.originalPrice || 0)
  const discountValue = Number(variant.discount.value || 0)
  const discountType = variant.discount.type || 'percentage'
  
  let price = original
  if(discountType === 'percentage' && discountValue > 0){
    price = Number((original * (1 - discountValue/100)).toFixed(2))
  } else if(discountType === 'fixed' && discountValue > 0){
    price = Number((original - discountValue).toFixed(2))
  }

  const amount = Number((original - price).toFixed(2))
  
  variant.price = price
  variant.discountAmount = amount // NEW
  variant.discount.value = original > 0 ? Math.round((amount / original) * 100) : discountValue // NEW: sync %

  // Bulk from ORIGINAL - Rule B
  if(variant.bulkPricing?.length > 0){
    variant.bulkPricing = variant.bulkPricing.map(tier => {
      const tierPercent = Number(String(tier.discountLabel || '').replace('%','')) || 0
      const bulkPrice = tierPercent > 0 
        ? Number((original * (1 - tierPercent/100)).toFixed(2))
        : price
      return {...tier, price: bulkPrice }
    })
  }
}

// HELPER: Clean models > variants structure - FOR SAVE
const cleanModels = (models = []) => {
  return models.map(model => ({
    modelName: model.modelName,
    description: model.description || '',
    specs: (model.specs || []).filter(s => s.key),
    variants: (model.variants || [])
      .filter(v => v.sku && v.name)
      .map(v => {
        // 1. First build the variant object
        const newVariant = {
          sku: v.sku,
          name: v.name,
          color: v.color || '',
          colorHex: v.colorHex || '#000',
          wattage: v.wattage || '',
          cableType: v.cableType || '',
          cableLength: v.cableLength || '',
          hardness: v.hardness || '',
          thickness: v.thickness || '',
          glassType: v.glassType || '',
          connectorType: v.connectorType || '',
          audioBits: v.audioBits || '',
          
          // Admin inputs
          originalPrice: Number(v.originalPrice) || 0,
          price: Number(v.price) || 0, // Will be overwritten by auto-calc
          
          discount: {
            type: v.discount?.type || 'percentage',
            value: Number(v.discount?.value) || 0,
            startDate: v.discount?.startDate || null,
            endDate: v.discount?.endDate || null,
            isActive: v.discount?.isActive || false,
          },
          bulkPricing: (v.bulkPricing || []).map(b => ({
            qty: Number(b.qty),
            price: Number(b.price), // Will be overwritten by auto-calc
            discountLabel: b.discountLabel || ''
          })),
          countInStock: Number(v.countInStock) || 0,
          images: (v.images || []).filter(img => img.url),
        }

        // 2. Run auto-calc on it before returning
        applyAccessoryDiscountCalc(newVariant)
        return newVariant
      }),
  })).filter(m => m.variants.length > 0);
};

// @desc Fetch all accessories
// @route GET /api/accessories
// @access Public
const getAccessories = asyncHandler(async (req, res) => {
  const pageSize = Number(req.query.pageSize) || 12; 
  const page = Number(req.query.pageNumber) || 1;
  
  // Multi-word search
  const keyword = req.query.keyword
 ? {
      $and: req.query.keyword.trim().split(" ").filter(Boolean).map((word) => {
        const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return {
          $or: [
            { name: { $regex: escapedWord, $options: "i" } },
            { brand: { $regex: escapedWord, $options: "i" } },
            { category: { $regex: escapedWord, $options: "i" } },
            { accessoryType: { $regex: escapedWord, $options: "i" } },
            { keywords: { $regex: escapedWord, $options: "i" } },
            { "models.modelName": { $regex: escapedWord, $options: "i" } },
          ],
        };
      }),
    }
    : {};

  const accessoryTypeFilter = req.query.accessoryType? { accessoryType: req.query.accessoryType } : {};
  const categoryFilter = req.query.category? { category: req.query.category } : {};

  const count = await Accessory.countDocuments({...keyword,...accessoryTypeFilter,...categoryFilter });
  const accessories = await Accessory.find({...keyword,...accessoryTypeFilter,...categoryFilter })
 .limit(pageSize)
 .skip(pageSize * (page - 1))
 .sort({ createdAt: -1 });

  // Safe processing - skips accessories with no variants
  const processedAccessories = accessories.map(acc => {
    const obj = acc.toObject();
    
    obj.models = (obj.models || []).map(model => ({
   ...model,
      variants: (model.variants || []).map(v => processVariant(v, 1))
    }));

    const firstModel = obj.models?.[0]
    const firstVariant = firstModel?.variants?.[0]
    
    // Skip if no variant - prevents broken cards
    if (!firstVariant) return null

    return {
   ...obj,
      image: firstVariant.images?.[0]?.url || '/placeholder.png',
      price: firstVariant.price || 0,
      minPrice: firstVariant.price || 0,
      slug: obj.slug,
    }
  }).filter(Boolean);

  // Return same shape for both suggestion and full search
  res.json({ 
    accessories: processedAccessories, 
    page, 
    pages: Math.ceil(count / pageSize) 
  });
});


// @desc    Fetch single accessory by ID
// @route   GET /api/accessories/:id
// @access  Public
const getAccessoryById = asyncHandler(async (req, res) => {
  const accessory = await Accessory.findById(req.params.id);
  if (accessory) {
    const obj = accessory.toObject();
    
    // FIX: Add || [] to prevent crash
    obj.variants = (obj.variants || []).map(v => processVariant(v, 1));
    
    obj.models = (obj.models || []).map(model => ({
      ...model,
      variants: (model.variants || []).map(v => processVariant(v, 1))
    }));
    
    res.json(obj);
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
    const obj = accessory.toObject();
    
    // FIX: Add || [] to prevent crash
    obj.variants = (obj.variants || []).map(v => processVariant(v, 1));
    
    obj.models = (obj.models || []).map(model => ({
      ...model,
      variants: (model.variants || []).map(v => processVariant(v, 1))
    }));
    
    res.json(obj);
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
    accessoryType,
    category, // <-- already here
    metaTitle,
    metaDescription,
    keywords = [],
    models = [],
  } = req.body;

  if (!name || !brand || !accessoryType) {
    res.status(400);
    throw new Error('Please add name, brand and accessoryType');
  }

  if (!models || models.length === 0) {
    res.status(400);
    throw new Error('Please add at least 1 model with variants');
  }

  const cleanModelsData = cleanModels(models);

  const baseSlug = slugify(name, { lower: true, strict: true });
  const accessorySlug = `${baseSlug}-${Date.now()}`;

  const accessory = new Accessory({
    user: req.user._id,
    name,
    slug: accessorySlug,
    brand,
    accessoryType,
    category: category?.trim() || accessoryType, // V37.87 KEY: trim + fallback
    metaTitle: metaTitle || `${name} | ${brand}`,
    metaDescription: metaDescription || `Buy ${name} from ${brand}.`,
    keywords: keywords.map(k => k.trim()).filter(Boolean),
    models: cleanModelsData,
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
    accessoryType,
    category,
    metaTitle,
    metaDescription,
    keywords,
    models,
    removedPublicIds = [],
  } = req.body;

  const accessory = await Accessory.findById(req.params.id);
  if (!accessory) {
    res.status(404);
    throw new Error('Accessory not found');
  }

  if (removedPublicIds?.length > 0) {
    for (let i = 0; i < removedPublicIds.length; i += 100) {
      const batch = removedPublicIds.slice(i, i + 100);
      await cloudinary.api.delete_resources(batch);
    }
  }

  const oldName = accessory.name;

  accessory.name = name || accessory.name;
  accessory.brand = brand || accessory.brand;
  accessory.accessoryType = accessoryType || accessory.accessoryType;
  accessory.category = category?.trim() || accessory.category || accessoryType; // V37.87 KEY
  
  if (keywords) accessory.keywords = keywords.map(k => k.trim()).filter(Boolean);
  if (metaTitle) accessory.metaTitle = metaTitle.slice(0, 60);
  if (metaDescription) accessory.metaDescription = metaDescription.slice(0, 155);

  if (models) {
    accessory.models = cleanModels(models);
  }

  if (name && name !== oldName) {
    const baseSlug = slugify(name, { lower: true, strict: true });
    accessory.slug = `${baseSlug}-${Date.now()}`;
  }

  const updatedAccessory = await accessory.save();
  res.json(updatedAccessory);
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

  const publicIdsToDelete = new Set();

  // 1. DELETE VARIANT IMAGES
  accessory.models?.forEach((model) => {
    model.variants?.forEach((variant) => {
      variant.images?.forEach((img) => {
        if (img.imagePublicId) publicIdsToDelete.add(img.imagePublicId);
      });
    });
  });

  // 2. DELETE REVIEW IMAGES - NEW
  accessory.reviews?.forEach((review) => {
    review.images?.forEach((img) => {
      if (img.imagePublicId) publicIdsToDelete.add(img.imagePublicId);
    });
    
    // 2.1 DELETE REPLY IMAGES IF YOU HAVE THEM LATER
    review.replies?.forEach((reply) => {
      reply.images?.forEach((img) => {
        if (img.imagePublicId) publicIdsToDelete.add(img.imagePublicId);
      });
    })
  });

  // 3. BATCH DELETE FROM CLOUDINARY
  const idsArray = [...publicIdsToDelete];
  if (idsArray.length > 0) {
    for (let i = 0; i < idsArray.length; i += 100) {
      const batch = idsArray.slice(i, i + 100);
      await cloudinary.api.delete_resources(batch);
    }
  }

  // 4. DELETE ACCESSORY FROM DB
  await accessory.deleteOne();

  // 5. CLEANUP USER WISHLIST + CART
  const accessoryId = new mongoose.Types.ObjectId(req.params.id);
  await User.updateMany({ wishlist: accessoryId }, { $pull: { wishlist: accessoryId } });
  await User.updateMany({ 'cart.product': accessoryId }, { $pull: { cart: { product: accessoryId }}});

  res.json({ message: 'Accessory, variant images, and review images removed' });
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