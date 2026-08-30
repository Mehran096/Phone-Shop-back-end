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
  const dbPrice = Number(variant.price) || 0;

  // USE HELPER INSTEAD OF MANUAL CALC
  const { pricePerItem, totalPrice, appliedTier } = calculateBulkPrice(dbPrice, qty, variant.bulkPricing);

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

    originalPrice: originalPrice || null,
    price: dbPrice, // DB price = tier 1 price
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
  const original = Number(variant.originalPrice || 0)
  
  // STEP 1: USE discountHelper
  const { isActive, discountAmount, finalPrice } = calculateDiscount(original, variant.discount);
  
  if(!isActive){
    variant.price = original
    variant.discount.value = 0
  } else {
    variant.price = finalPrice
    variant.discount.value = original > 0? Math.round((discountAmount / original) * 100) : 0
  }

  const basePrice = (variant.bulkBase || 'discounted') === 'original'? original : variant.price

  // STEP 2: Auto calc bulk tiers
  if(variant.bulkPricing?.length > 0){
    variant.bulkPricing = variant.bulkPricing.map(tier => {
      const label = String(tier.discountLabel || '');
      const match = label.match(/(\d+(\.\d+)?)%/); 
      const tierPercent = match? Number(match[1]) : 0;
      
      const bulkPrice = tierPercent > 0 
      ? Number((basePrice * (1 - tierPercent/100)).toFixed(2))
        : basePrice
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
          bulkBase: v.bulkBase || 'discounted',
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
  const pageSize = Number(req.query.pageSize) || 8;
  const page = Number(req.query.pageNumber) || 1;
  const limit = Number(req.query.limit) || 0; // NEW: for home page
  const finalLimit = limit > 0? limit : pageSize; // <-- KEY

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

  const type = req.query.type;
  const brand = req.query.brand;
  const filterParam = req.query.filter;

  let matchQuery = {...keyword };

  if (type && type!== "accessory" && type!== "") {
    const escapedType = type.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    matchQuery.accessoryType = { $regex: `^${escapedType}$`, $options: "i" };
  }
  if (brand) {
    matchQuery.brand = { $regex: brand, $options: "i" };
  }

  // ===== KEY FIX 1: DEALS FILTER KO COUNT SE PEHLE LAGAO =====
  if (filterParam === "deal") {
    matchQuery.models = {
      $elemMatch: {
        variants: {
          $elemMatch: { "discount.isActive": true, "discount.value": { $gt: 0 } },
        },
      },
    };
  }

  let sortOption = { createdAt: -1 };
  let accessories, count;

  // AB COUNT SAHI AAYEGA
  count = await Accessory.countDocuments(matchQuery);

  // NEW: If limit is set, ignore pagination. Used for home page
  if (limit > 0) {
    accessories = await Accessory.find(matchQuery).limit(finalLimit).sort(sortOption);
  } else {
    // Normal pagination logic
    if (filterParam === "deal") {
      const pipeline = [
        { $match: matchQuery },
        {
          $addFields: {
            maxDiscount: {
              $max: {
                $map: {
                  input: {
                    $reduce: {
                      input: "$models",
                      initialValue: [],
                      in: { $concatArrays: ["$$value", "$$this.variants"] },
                    },
                  },
                  as: "v",
                  in: {
                    $cond: [
                      { $and: ["$$v.discount.isActive", { $gt: ["$$v.discount.value", 0] }] },
                      "$$v.discount.value",
                      0,
                    ],
                  },
                },
              },
            },
          },
        },
        { $sort: { maxDiscount: -1 } },
        { $skip: finalLimit * (page - 1) }, // <-- finalLimit
        { $limit: finalLimit }, // <-- finalLimit
      ];
      accessories = await Accessory.aggregate(pipeline);
    } else {
      if (filterParam === "new") {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        matchQuery.createdAt = { $gte: thirtyDaysAgo };
      }
      if (filterParam === "bestseller") {
        sortOption = { allSales: -1 };
      }

      accessories = await Accessory.find(matchQuery)
      .limit(finalLimit) // <-- finalLimit
      .skip(finalLimit * (page - 1)) // <-- finalLimit
      .sort(sortOption);
    }
  }

  // One processing block for BOTH find and aggregate
  const processedAccessories = accessories
  .map((acc) => {
      const obj = acc.toObject? acc.toObject() : acc;

      obj.models = (obj.models || [])
      .map((model) => ({
        ...model,
          variants: (model.variants || [])
          .filter(
              (v) =>
                filterParam!== "deal" || (v.discount?.isActive && v.discount?.value > 0)
            )
          .map((v) => processVariant(v, 1)),
        }))
      .filter((m) => m.variants.length > 0);

      const firstModel = obj.models?.[0];
      const firstVariant = firstModel?.variants?.[0];
      if (!firstVariant && filterParam === "deal") return null;

      const bulkPrices = firstVariant.bulkPricing?.map((t) => Number(t.price)).filter(Boolean) || [];
      const lowestBulkPrice = bulkPrices.length > 0? Math.min(...bulkPrices) : firstVariant.price;
      const tier1Price = firstVariant.bulkPricing?.find((t) => Number(t.qty) === 1)?.price || firstVariant.price;
      const discountedPrice = tier1Price;

      return {
      ...obj,
        image: firstVariant?.images?.[0]?.url || "/placeholder.png",
        price: discountedPrice,
        minPrice: lowestBulkPrice,
        originalPrice: firstVariant?.originalPrice || 0,
        slug: obj.slug,
      };
    })
  .filter(Boolean);

  // ===== KEY FIX 2: finalLimit use karo =====
  res.json({
    accessories: processedAccessories,
    page,
    pages: Math.ceil(count / finalLimit), // <-- finalLimit
    total: count,
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

    const firstModel = obj.models?.[0]
    const firstVariant = firstModel?.variants?.[0]
    
    if(firstVariant){
      const tier1Price = firstVariant.bulkPricing?.find(t => Number(t.qty) === 1)?.price 
        || firstVariant.price;
      const bulkPrices = firstVariant.bulkPricing?.map(t => Number(t.price)).filter(Boolean) || []
      const lowestBulkPrice = bulkPrices.length > 0? Math.min(...bulkPrices) : firstVariant.price

      obj.mainPrice = tier1Price // $8.49
      obj.minPrice = lowestBulkPrice // $6.79
      obj.price = tier1Price // overwrite for consistency
    }
    
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

    const firstModel = obj.models?.[0]
    const firstVariant = firstModel?.variants?.[0]
    
    if(firstVariant){
      const tier1Price = firstVariant.bulkPricing?.find(t => Number(t.qty) === 1)?.price 
        || firstVariant.price;
      const bulkPrices = firstVariant.bulkPricing?.map(t => Number(t.price)).filter(Boolean) || []
      const lowestBulkPrice = bulkPrices.length > 0? Math.min(...bulkPrices) : firstVariant.price

      obj.mainPrice = tier1Price // $8.49
      obj.minPrice = lowestBulkPrice // $6.79
      obj.price = tier1Price // overwrite for consistency
    }
    
    res.json(obj);
  } else {
    res.status(404);
    throw new Error('Accessory not found');
  }
});

// @desc Fetch featured accessory for navbar
// @route GET /api/accessories/featured
// @access Public
const getFeaturedAccessory = asyncHandler(async (req, res) => {
  const accessory = await Accessory.findOne({ featured: true })
  .sort({ featuredPriority: 1, createdAt: -1 }); // priority 1 first, then newest

  if (!accessory) {
    return res.status(200).json(null); // return null instead of 404 so navbar doesn't break
  }

  const obj = accessory.toObject();

  // Process models same as detail page
  obj.models = (obj.models || []).map(model => ({
  ...model,
    variants: (model.variants || []).map(v => processVariant(v, 1))
  }));

  const firstModel = obj.models?.[0];
  const firstVariant = firstModel?.variants?.[0];

  if(firstVariant){
    const tier1Price = firstVariant.bulkPricing?.find(t => Number(t.qty) === 1)?.price
      || firstVariant.price;
    const bulkPrices = firstVariant.bulkPricing?.map(t => Number(t.price)).filter(Boolean) || []
    const lowestBulkPrice = bulkPrices.length > 0? Math.min(...bulkPrices) : firstVariant.price

    obj.mainPrice = tier1Price; // $8.49
    obj.minPrice = lowestBulkPrice; // $6.79
    obj.price = tier1Price;
    obj.image = firstVariant.images?.[0]?.url || '/placeholder.png';
  }

  res.json(obj);
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
    featured,
    featuredPriority,
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

  if (typeof featured === 'boolean') accessory.featured = featured;
  if (typeof featuredPriority === 'number') accessory.featuredPriority = featuredPriority;

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

 

 

module.exports = {
  getAccessories,
  getAccessoryById,
  getAccessoryBySlug,
  getFeaturedAccessory,
  createAccessory,
  updateAccessory,
  deleteAccessory, 
  
};