const mongoose = require('mongoose')
const asyncHandler = require('express-async-handler')
const Product = require('../models/Product')
const slugify = require('slugify')
const calculateDiscount = require('../utils/discountHelper.js');
const User = require('../models/User')
const Order = require('../models/orderModel');
const { cloudinary } = require('../utils/cloudinary')

// const extractPublicIdFromUrl = (url) => {
//   try {
//     // Regex grabs everything after /upload/ and before the file extension
//     const matches = url.match(/\/upload\/(?:v\d+\/)?(.+)\.\w+$/)
//     return matches ? matches[1] : null
//   } catch {
//     return null
//   }
// }

// @desc Create a product
// @route POST /api/products
// @access Private/Admin
const createProduct = asyncHandler(async (req, res) => {

  const isDemoAdmin = req.user.email === 'demo@phonestore.com';
  if (isDemoAdmin) {
    return res.status(403).json({ message: 'Demo accounts have read-only access.' });
  }
  //console.log('V9.47 BODY RECEIVED:', JSON.stringify(req.body, null, 2)); // Debug

  const {
    name,
    brand,
    category,
    metaTitle,
    metaDescription, // V9.47 KEY: No description/specs
    keywords = [],
    accessories = [],
    variants = [],
    allSales = 0,
  } = req.body;

  if (!name || !brand) { // V9.47 KEY: description removed
    res.status(400);
    throw new Error('Please add name and brand');
  }

  if (!variants || variants.length === 0) {
    res.status(400);
    throw new Error('Please add at least 1 storage variant');
  }

  // V9.47 KEY: MAP PRICE/STOCK/SKU FROM COLOR LEVEL
  const cleanVariants = variants
    .map(v => ({
      storage: v.storage,
      specs: v.specs || {}, // V9.47 KEY: Per variant specs
      description: v.description || '', // V9.47 KEY: Per variant desc
      colors: (v.colors || [])
        .filter(c => c.name && c.images?.length > 0) // Must have name + 1 image
        .map(c => ({
          name: c.name,
          hexCode: c.hexCode || "",
          price: Number(c.price), // V9.47 KEY: SKU price
          discount: (() => {
            const discount = {
              type: c.discount?.type || "percentage",
              value: Number(c.discount?.value) || 0,
              startDate: c.discount?.startDate || null,
              endDate: c.discount?.endDate || null,
            };

            discount.isActive =
              discount.value > 0 &&
              (!discount.startDate || new Date() >= new Date(discount.startDate)) &&
              (!discount.endDate || new Date() <= new Date(discount.endDate));

            return discount;
          })(),
          countInStock: Number(c.countInStock) || 0, // V9.47 KEY: SKU stock
          sku: c.sku || '', // V9.47 KEY: SKU code
          images: c.images,
          //imagePublicIds: c.imagePublicIds || [],
        })),
    }))
    .filter(v => v.colors.length > 0); // Remove empty variants

  if (cleanVariants.length === 0) {
    res.status(400);
    throw new Error('Each variant needs at least 1 color with 1 image');
  }

  // V9.47 KEY: SLUG + META FROM FIRST VARIANT
  const baseSlug = slugify(name, { lower: true, strict: true, remove: /[*+~.()'"!:@]/g });
  const productsSlug = `${baseSlug}-${Date.now()}`;

  const autoMetaTitle = metaTitle || `${name} | ${brand} ${cleanVariants[0]?.storage || ''}`;
  const autoMetaDescription = metaDescription || `Buy ${name} from ${brand}.`; // V9.47 KEY: No description

  try {
    const product = new Product({
      user: req.user._id,
      name,
      slug: productsSlug,
      brand,
      category,
      // description: REMOVED V9.47 KEY
      metaTitle: autoMetaTitle.slice(0, 60),
      metaDescription: autoMetaDescription.slice(0, 155),
      keywords,
      accessories,
      // specs: REMOVED V9.47 KEY
      variants: cleanVariants, // V9.47 KEY: All data lives here
      allSales: 0,
      numReviews: 0,
      rating: 0,
    });

    const createdProduct = await product.save();
    res.status(201).json(createdProduct);
  } catch (error) {
    console.error('REAL MONGOOSE ERROR:', error);
    res.status(400);
    throw new Error(error.message);
  }
});

// @desc    Fetch all products with filters
// @route   GET /api/products
// @access  Public
const getProducts = asyncHandler(async (req, res) => {
  const pageSize = Number(req.query.pageSize) || 8;
  const page = Number(req.query.pageNumber) || 1;

  const { keyword, brand, category, minPrice, maxPrice, storage, isLatest, limit } = req.query;

  const isSuggestions = req.query.suggestions === 'true';
   const finalLimit = Number(limit) || pageSize;

  // 1. Search Filter: V9.51 KEY = variants.storage + variants.colors.name
  const searchFilter = keyword
  ? {
      $and: keyword
        .trim()
        .split(" ")
        .filter(Boolean)
        .map((word) => {
          const escapedWord = word.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          );

          return {
            $or: [
              { name: { $regex: escapedWord, $options: "i" } },
              { brand: { $regex: escapedWord, $options: "i" } },
              { category: { $regex: escapedWord, $options: "i" } },
              { keywords: { $regex: escapedWord, $options: "i" } },
              { "variants.storage": { $regex: escapedWord, $options: "i" } },
              { "variants.colors.name": { $regex: escapedWord, $options: "i" } },
            ],
          };
        }),
    }
  : {};

  // 2. Other Filters
  const escapedBrand = brand
  ? brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  : "";

const brandFilter = brand
  ? { brand: { $regex: escapedBrand, $options: "i" } }
  : {};
  const categoryFilter = category ? { category: { $regex: category, $options: 'i' } } : {};

  // 3. Storage Filter: V9.51 KEY = Exact match 256GB
 const escapedStorage = storage
  ? storage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  : "";

const storageFilter = storage
  ? {
      "variants.storage": {
        $regex: `^${escapedStorage}$`,
        $options: "i",
      },
    }
  : {};

  // 4. Price Filter: V9.51 KEY = $elemMatch on variants.colors.price
  const priceFilter =
    minPrice || maxPrice
      ? {
        'variants.colors': {
          $elemMatch: {
            price: {
              ...(minPrice && { $gte: Number(minPrice) }),
              ...(maxPrice && { $lte: Number(maxPrice) }),
            },
          },
        },
      }
      : {};

  const filter = { ...searchFilter, ...brandFilter, ...categoryFilter, ...storageFilter, ...priceFilter };
  
 // SORT LOGIC - NEW
  let sortOption = { createdAt: -1 }; // default latest first
  if (isLatest === 'true') {
    sortOption = { createdAt: -1 }; // Latest phones
  }

  const count = isSuggestions
  ? 0
  : await Product.countDocuments(filter);

  // 3. Select: V9.51 KEY = Removed `specs` + `price` root
  const products = await Product.find(filter)
    .populate('accessories', 'name slug price image type') // FBT
    .select('name slug brand category image rating numReviews variants metaTitle') // V9.51 KEY: No specs
    .limit(finalLimit)
    .skip(finalLimit * (page - 1))
    .sort(sortOption); 

  // 4. Frontend helper: FIRST Color + FIRST Price from DB
const productsWithCalc = products.map(p => {
  const allColors = p.variants?.flatMap(v => v.colors) || [];
  const uniqueColors = [...new Map(allColors.map(c => [c.name, c])).values()];

  // 1. TAKE FIRST COLOR OF FIRST VARIANT - NO DISCOUNT LOGIC
  const firstVariant = p.variants?.[0];
  const firstColor = firstVariant?.colors?.[0] || { price: 0, countInStock: 0, discount: {} };

  // 2. CALCULATE DISCOUNT ONLY IF FIRST COLOR HAS IT
  const { finalPrice, discountAmount, isActive } = calculateDiscount(firstColor.price, firstColor.discount);

  const originalPrice = Number(firstColor.price || 0);
  const discountPercent = isActive? firstColor.discount.value : 0;
  const price = finalPrice;
  const youSave = discountAmount;

  return {
 ...p.toObject(),
    minPrice: Number(price.toFixed(2)), // discounted price of first color
    originalPrice: Number(originalPrice.toFixed(2)), // original of first color
    discountPercent, // discount of first color only
    youSave: Number(youSave.toFixed(2)),
    minStock: firstColor.countInStock,
    colors: uniqueColors,
    // FOR COMPATIBILITY
    price: Number(price.toFixed(2)),
    bestDiscount: discountPercent,
  }
});

if (isSuggestions) return res.json(productsWithCalc);

res.json({ products: productsWithCalc, page, pages: Math.ceil(count / finalLimit) });
});

// @desc    Get products for dropdown - lightweight/only for compatible-accessories
// @route   GET /api/products/dropdown
// @access  Public
const getProductsForDropdown = asyncHandler(async (req, res) => {
  const { keyword = '' } = req.query;

  const searchFilter = keyword
    ? {
        $or: [
          { name: { $regex: keyword, $options: 'i' } },
          { brand: { $regex: keyword, $options: 'i' } },
        ],
      }
    : {};

  const products = await Product.find(searchFilter)
    .select('_id name brand')
    .limit(50)
    .sort({ name: 1 });

  const formatted = products.map(product => ({
  value: product._id.toString(), // ADD .toString() HERE
  label: `${product.brand} ${product.name}`.trim()
}));

  res.json(formatted);
});

// @desc Fetch single product by slug
// @route GET /api/products/slug/:slug
// @access Public
const getProductBySlug = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ slug: req.params.slug })
    .populate('user', 'name') // who added it
    .populate('accessories', 'name slug price image type countInStock'); // FBT

  if (product) {


    const allColors = product.variants?.flatMap(v => v.colors) || []; // V9.48 KEY: Flatten all colors for swatch UI
    const uniqueColors = [...new Map(allColors.map(c => [c.name, c])).values()]; // Dedup by name, keep first
    const variants = product.variants.map((variant) => ({
      ...variant.toObject(),
      colors: variant.colors.map((color) => {
        const discountInfo = calculateDiscount(color.price, color.discount);

        return {
          ...color.toObject(),
          originalPrice: color.price,
          discount: {
            ...color.discount,
            isActive: discountInfo.isActive,
          },
          finalPrice: discountInfo.finalPrice,
          discountAmount: discountInfo.discountAmount,
        };
      }),
    }));

    const productData = {
      ...product.toObject(),
      variants,
      // V9.48 KEY: Only helper = all unique colors. No fake price/stock/root fields
      colors: uniqueColors,
    };

    res.json(productData);
  } else {
    res.status(404);
    throw new Error('Product not found');
  }
});

// @desc    Get product by ID - Keep for admin panel
// @route   GET /api/products/:id
// @access  Public
const getProductById = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id)
    .populate('accessories', 'name slug price image type countInStock');

  if (product) {
    // V9.49 KEY: ADMIN = SAME RAW DATA AS FRONTEND. NO V8 FALLBACKS
    // Admin form should loop: product.variants.map(v => v.colors.map(c => c.price))

    const allColors = product.variants?.flatMap(v => v.colors) || []; // V9.49 KEY: Flatten for swatch table
    const uniqueColors = [...new Map(allColors.map(c => [c.name, c])).values()]; // Dedup by name, keep first
    const variants = product.variants.map((variant) => ({
      ...variant.toObject(),
      colors: variant.colors.map((color) => {
        const discountInfo = calculateDiscount(color.price, color.discount);

        return {
          ...color.toObject(),
          originalPrice: color.price,
          discount: {
            ...color.discount,
            isActive: discountInfo.isActive,
          },
          finalPrice: discountInfo.finalPrice,
          discountAmount: discountInfo.discountAmount,
        };
      }),
    }));

    const productData = {
      ...product.toObject(),
      variants,
      // V9.49 KEY: Only helper = all unique colors. No fake price/stock/root fields
      colors: uniqueColors,
    };

    res.json(productData);
  } else {
    res.status(404);
    throw new Error('Product not found');
  }
});

// // @desc Get product by ID - Keep for admin panel
// // @route GET /api/products/:id
// // @access Public
// const getProductById = asyncHandler(async (req, res) => {
//   const product = await Product.findById(req.params.id)

//   if (product) {
//     res.json(product)
//   } else {
//     res.status(404)
//     throw new Error('Product not found')
//   }
// })

// @desc Update a product
// @route PUT /api/products/:id
// @access Private/Admin
// @desc    Update a product
// @route   PUT /api/products/:id
// @access  Private/Admin
const updateProduct = asyncHandler(async (req, res) => {

  const isDemoAdmin = req.user.email === 'demo@phonestore.com';
  if (isDemoAdmin) {
    return res.status(403).json({ message: 'Demo accounts have read-only access.' });
  }

  const {
    _id, // KEY: get from body not params
    name,
    brand,
    category,
    variants,
    accessories,
    keywords,
    metaTitle,
    metaDescription,
    imagesToDelete = [] // V38.65 KEY: default empty array
  } = req.body;

  const product = await Product.findById(_id); // FIX 1

  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  // V38.65 KEY 1: DELETE IMAGES FROM CLOUDINARY FIRST
  if (imagesToDelete.length > 0) {
    console.log('V38.65 DELETE REQUEST:', imagesToDelete);
    await Promise.allSettled(
      imagesToDelete.map(id => cloudinary.uploader.destroy(id))
    );
  }

  if (!variants || variants.length === 0) {
    res.status(400);
    throw new Error('Please add at least 1 variant');
  }

  // V9.52 KEY 2: Slug update
  if (name && name!== product.name) {
    product.slug = slugify(name, {
      lower: true,
      strict: true,
      remove: /[*+~.()'"!:@]/g
    });
  }

  // V38.65 KEY 2: CLEAN VARIANTS - remove temp fields
  const cleanVariants = variants.map((v) => ({
   ...v,
    specs: v.specs || {},
    colors: v.colors.map((c) => {
      // remove frontend temp fields
      const { isNew, id, file,...rest } = c; 

      return {
       ...rest,
        // Ensure imagePublicId is saved
        images: (c.images || []).map(img => ({
          url: img.url,
          imagePublicId: img.imagePublicId || null
        })),
        discount: (() => {
          const discount =
            typeof c.discount === "object"
             ? {
                type: c.discount.type || "percentage",
                value: Number(c.discount.value) || 0,
                startDate: c.discount.startDate || null,
                endDate: c.discount.endDate || null,
              }
              : {
                type: "percentage",
                value: Number(c.discount || 0),
                startDate: null,
                endDate: null,
              };

          discount.isActive =
            discount.value > 0 &&
            (!discount.startDate || new Date() >= new Date(discount.startDate)) &&
            (!discount.endDate || new Date() <= new Date(discount.endDate));

          return discount;
        })(),
      };
    }),
  }));

  product.name = name;
  product.brand = brand;
  product.category = category;
  product.accessories = accessories || [];
  product.keywords = keywords || [];
  product.metaTitle = metaTitle?.slice(0, 60) || '';
  product.metaDescription = metaDescription?.slice(0, 160) || '';
  product.variants = cleanVariants;

  const updatedProduct = await product.save();
  res.json(updatedProduct);
});

// @desc Get Best Seller Products
// @route GET /api/products/bestsellers
// @access Public
const getBestSellerProducts = asyncHandler(async (req, res) => {
  const limit = Number(req.query.limit) || 12; // <-- Deals jesa
  const products = await Product.find({})
 .select('name slug brand category image rating numReviews variants allSales')
 .sort({ allSales: -1 })
  .limit(limit);

  // USE SAME "BEST DISCOUNT VARIANT" LOGIC AS DEALS
  const productsWithCalc = products.map(p => {
    let bestVariant = null;
    let bestColor = null;
    let maxDiscount = 0;

    // Find color with max discount
    p.variants?.forEach((variant) => {
      variant.colors?.forEach((color) => {
        const discountValid =
          color.discount &&
          color.discount.value > 0 &&
          (!color.discount.endDate || new Date(color.discount.endDate) >= new Date());

        if (discountValid && color.discount.value > maxDiscount) {
          maxDiscount = color.discount.value;
          bestVariant = variant;
          bestColor = color;
        }
      });
    });

    // If no discount, take first color
    if (!bestColor) {
      bestVariant = p.variants?.[0];
      bestColor = bestVariant?.colors?.[0] || { price: 0, countInStock: 0, discount: {} };
    }

    const { finalPrice, discountAmount, isActive } = calculateDiscount(bestColor.price, bestColor.discount);

    const originalPrice = Number(bestColor.price || 0);
    const discountPercent = isActive? bestColor.discount.value : 0;

    return {
     ...p.toObject(),
      image: bestColor?.images?.[0]?.url || bestVariant?.images?.[0]?.url || p.image,
      minPrice: Number(finalPrice.toFixed(2)),
      originalPrice: Number(originalPrice.toFixed(2)),
      discountPercent,
      youSave: Number(discountAmount.toFixed(2)),
      minStock: bestColor.countInStock,
      colors: [...new Map(p.variants?.flatMap(v => v.colors) || [].map(c => [c.name, c])).values()],
      // FOR COMPATIBILITY WITH Product.jsx
      price: Number(finalPrice.toFixed(2)),
      bestDiscount: discountPercent,
      defaultStorage: bestVariant?.storage,
      defaultColor: bestColor?.name,
      endDate: bestColor?.discount?.endDate,
    }
  });

  res.json(productsWithCalc); // return array like deals
});

// @desc Get Deals & Discounts Products
// @route GET /api/products/deals
// @access Public
const getDealsProducts = asyncHandler(async (req, res) => {
  const now = new Date();
  const limit = Number(req.query.limit) || 12;
  const minDiscount = Number(req.query.minDiscount) || 0;

  // 1. Find products with active + not expired discounts
  const products = await Product.find({
    variants: {
      $elemMatch: {
        colors: {
          $elemMatch: {
            "discount.value": { $gt: 0 },
            $or: [
              { "discount.endDate": { $exists: false } },
              { "discount.endDate": { $gte: now } }
            ]
          },
        },
      },
    },
  }).sort({ updatedAt: -1 }).limit(limit * 2); // get extra to filter later

  // 2. Find best discount variant per product
  const deals = products
  .map((product) => {
      let bestVariant = null;
      let bestColor = null;
      let maxDiscount = 0;

      product.variants.forEach((variant) => {
        variant.colors.forEach((color) => {
          const discountValid =
            color.discount &&
            color.discount.value > 0 &&
            (!color.discount.endDate || new Date(color.discount.endDate) >= now);

          if (discountValid && color.discount.value > maxDiscount) {
            maxDiscount = color.discount.value;
            bestVariant = variant;
            bestColor = color;
          }
        });
      });

      if (maxDiscount === 0) return null; // skip if no valid discount

      // 3. Use discountHelper so it matches detail page 100%
      const { isActive: discountIsActive, discountAmount, finalPrice } = calculateDiscount(
        bestColor.price,
        bestColor.discount
      );

      if (!discountIsActive) return null;

      // 4. Return FULL product so Product.jsx doesn't break
      return {
      ...product.toObject(),
        // Override top level fields so card uses discounted price/image
        image: bestColor?.images?.[0]?.url || bestVariant?.images?.[0]?.url || product.image,
        price: finalPrice, // Discounted price
        originalPrice: bestColor.price, // Original price from DB
        // Frontend friendly fields for badge + link
        defaultStorage: bestVariant?.storage,
        defaultColor: bestColor?.name,
        bestDiscount: maxDiscount,
        discountType: bestColor?.discount?.type || 'percentage',
        endDate: bestColor?.discount?.endDate,
        youSave: discountAmount, // Amount saved
      };
    })
  .filter(Boolean) // remove nulls
  .filter((deal) => deal.bestDiscount >= minDiscount) // filter by min %
  .sort((a, b) => b.bestDiscount - a.bestDiscount) // sort highest discount first
  .slice(0, limit); // final limit

  res.json({
    success: true,
    count: deals.length,
    deals,
  });
});

// @desc Get New Arrival Products
// @route GET /api/products/newarrivals
// @access Public
const getNewArrivalProducts = asyncHandler(async (req, res) => {
  const limit = Number(req.query.limit) || 12;

  const products = await Product.find({})
 .select('name slug brand category image rating numReviews variants createdAt')
 .sort({ createdAt: -1 })
 .limit(limit); 

  // USE SAME "BEST DISCOUNT VARIANT" LOGIC AS DEALS
  const productsWithCalc = products.map(p => {
    let bestVariant = null;
    let bestColor = null;
    let maxDiscount = 0;

    // Find color with max discount
    p.variants?.forEach((variant) => {
      variant.colors?.forEach((color) => {
        const discountValid =
          color.discount &&
          color.discount.value > 0 &&
          (!color.discount.endDate || new Date(color.discount.endDate) >= new Date());

        if (discountValid && color.discount.value > maxDiscount) {
          maxDiscount = color.discount.value;
          bestVariant = variant;
          bestColor = color;
        }
      });
    });

    // If no discount, take first color
    if (!bestColor) {
      bestVariant = p.variants?.[0];
      bestColor = bestVariant?.colors?.[0] || { price: 0, countInStock: 0, discount: {} };
    }

    const { finalPrice, discountAmount, isActive } = calculateDiscount(bestColor.price, bestColor.discount);

    const originalPrice = Number(bestColor.price || 0);
    const discountPercent = isActive? bestColor.discount.value : 0;

    return {
     ...p.toObject(),
      image: bestColor?.images?.[0]?.url || bestVariant?.images?.[0]?.url || p.image,
      minPrice: Number(finalPrice.toFixed(2)),
      originalPrice: Number(originalPrice.toFixed(2)),
      discountPercent,
      youSave: Number(discountAmount.toFixed(2)),
      minStock: bestColor.countInStock,
      colors: [...new Map(p.variants?.flatMap(v => v.colors) || [].map(c => [c.name, c])).values()],
      // FOR COMPATIBILITY
      price: Number(finalPrice.toFixed(2)),
      bestDiscount: discountPercent,
      defaultStorage: bestVariant?.storage,
      defaultColor: bestColor?.name,
      endDate: bestColor?.discount?.endDate,
    }
  });

  res.json(productsWithCalc); // return array
});

// @desc Get recommended products
// @route GET /api/products/:id/recommendations
// @access Public
const getRecommendedProducts = asyncHandler(async (req, res) => {
  const productId = req.params.id
  const currentProduct = await Product.findById(productId)
  const now = new Date()
  
  if (!currentProduct) {
    res.status(404)
    throw new Error('Product not found')
  }

  const isDiscountActive = (discount) => {
    if (!discount) return false
    if (!discount.isActive) return false
    if (discount.value <= 0) return false
    if (discount.startDate && new Date(discount.startDate) > now) return false
    if (discount.endDate && new Date(discount.endDate) < now) return false
    return true
  }

  let recommendations = []
  const limit = 6
  let recommendationType = 'popular' // default

  // 1. FIRST: Get ALL products from SAME BRAND
  const sameBrand = await Product.find({
    _id: { $ne: productId },
    brand: currentProduct.brand,
  })
 .select('name brand category variants slug rating numReviews')
 .limit(limit)
 .lean()

  recommendations = [...sameBrand]

  if (recommendations.length > 0) {
    recommendationType = 'brand'
    
    // 1.5: If brand has < 6, fill with MORE FROM SAME BRAND ONLY
    // Don't go to category yet
    if (recommendations.length < limit) {
      const remaining = limit - recommendations.length
      const brandIds = recommendations.map(p => p._id)

      const moreSameBrand = await Product.find({
        _id: { $nin: [productId,...brandIds] },
        brand: currentProduct.brand, // still brand
      })
     .select('name brand category variants slug rating numReviews')
     .limit(remaining)
     .sort({ rating: -1 })
     .lean()
     
      recommendations = [...recommendations,...moreSameBrand]
    }
  }

  // 2. SECOND: If NO brand products found, then use CATEGORY
  if (recommendations.length === 0) {
    const sameCategory = await Product.find({
      _id: { $ne: productId },
      category: currentProduct.category,
    })
   .select('name brand category variants slug rating numReviews')
   .limit(limit)
   .sort({ rating: -1 })
   .lean()

    recommendations = [...sameCategory]
    if (sameCategory.length > 0) recommendationType = 'category'
  }

  // 3. THIRD: FINAL FALLBACK - Best sellers
  if (recommendations.length < limit) {
    const remaining = limit - recommendations.length
    const excludeIds = recommendations.map(p => p._id)

    const bestSellers = await Product.find({
      _id: { $nin: [productId,...excludeIds] },
    })
   .select('name brand category variants slug rating numReviews')
   .limit(remaining)
   .sort({ numReviews: -1 })
   .lean()

    recommendations = [...recommendations,...bestSellers]
    if (recommendations.length === bestSellers.length) recommendationType = 'popular'
  }

  // CLEAN DISCOUNTS
  const cleanedRecommendations = recommendations.map(product => {
    const cleanedVariants = product.variants?.map(variant => {
      const cleanedColors = variant.colors?.map(color => {
        if (!isDiscountActive(color.discount)) {
          return { 
            ...color, 
            discount: { ...color.discount, value: 0, isActive: false } 
          }
        }
        return color
      })
      return { ...variant, colors: cleanedColors }
    })
    return { ...product, variants: cleanedVariants }
  })

  res.json({
    recommendations: cleanedRecommendations,
    type: recommendationType,
    brand: currentProduct.brand,
    category: currentProduct.category
  })
})

// @desc Get frequently bought together accessories for a product
// @route GET /api/products/:id/frequently-bought
// @access Public
const getFrequentlyBoughtTogether = asyncHandler(async (req, res) => {
  const productId = req.params.id
  const model = req.query.model || 'Universal' // "Apple iPhone 16 Pro Max"
  const color = req.query.color || '' // don't default to White anymore

  const product = await Product.findById(productId)
 .populate({
      path: 'frequentlyBoughtWith.accessory',
      select: 'name slug brand accessoryType models discount',
      model: 'Accessory'
    })
 .lean()

  if (!product) return res.status(404).json({ message: 'Product not found' })
  if (!product.frequentlyBoughtWith?.length) return res.json([])

  const topAccessories = product.frequentlyBoughtWith
 .filter(item => item.accessory)
 .sort((a, b) => b.count - a.count)
 .slice(0, 8)
 .map(item => {
      const acc = item.accessory
      
      // 1. Match by models.modelName
      const modelMatch = acc.models?.find(m => 
        m.modelName?.toLowerCase() === model.toLowerCase() ||
        model.toLowerCase().includes(m.modelName?.toLowerCase()) ||
        m.modelName?.toLowerCase() === 'universal'
      ) || acc.models?.[0]

      // 2. KEY FIX: Match by variant NAME, not color field
      // Try: 1. exact color param match to variant.name 
      // 2. fallback to first variant of model
      const variant = modelMatch?.variants?.find(v => 
        color && v.name?.toLowerCase().includes(color.toLowerCase())
      ) 
      || modelMatch?.variants?.[0] // always fallback to first variant

      const price = Number(variant?.price || variant?.originalPrice || 0)
      const originalPrice = Number(variant?.originalPrice || variant?.price || 0)
      
      return {
        _id: acc._id,
        name: acc.name,
        slug: acc.slug,
        brand: acc.brand,
        accessoryType: acc.accessoryType,
        variants: modelMatch?.variants || [], // send all variants so frontend can switch
        model: modelMatch?.modelName || 'Universal',
        // KEY FIX: color = variant name. This makes FBT + Product page match
        color: variant?.name || 'Default', 
        variantName: variant?.name,
        variantSubName: variant?.name,
        price: price,
        originalPrice: originalPrice,
        image: variant?.images?.[0]?.url || '/placeholder.png', // correct image per variant
        countInStock: variant?.countInStock || 0,
        sku: variant?.sku || '',
        discount: variant?.discount || acc.discount || { isActive: false, value: 0 },
        boughtTogetherCount: item.count
      }
    })

  res.json(topAccessories)
})

// @desc  Compare phones
// @route   GET /api/products/compare
// @access  Public
const compareProducts = asyncHandler(async (req, res) => {
  const { slugs } = req.query;

  if (!slugs) {
    res.status(400);
    throw new Error("Product slugs are required");
  }

  const slugArray = slugs.split(",");

  const products = await Product.find({
    slug: { $in: slugArray },
  }).populate("user", "name");

  if (!products.length) {
    res.status(404);
    throw new Error("Products not found");
  }

  const compareProducts = products.map((product) => {
    const allColors =
      product.variants?.flatMap((variant) => variant.colors) || [];

    const uniqueColors = [
      ...new Map(allColors.map((color) => [color.name, color])).values(),
    ];

    const variants = product.variants.map((variant) => ({
      ...variant.toObject(),
      colors: variant.colors.map((color) => {
        const discountInfo = calculateDiscount(
          color.price,
          color.discount
        );

        return {
          ...color.toObject(),
          originalPrice: color.price,
          discount: {
            ...color.discount,
            isActive: discountInfo.isActive,
          },
          finalPrice: discountInfo.finalPrice,
          discountAmount: discountInfo.discountAmount,
        };
      }),
    }));

    return {
      ...product.toObject(),
      variants,
      colors: uniqueColors,
    };
  });

  // Preserve the same order as requested in the query
  const orderedProducts = slugArray
    .map((slug) =>
      compareProducts.find((product) => product.slug === slug)
    )
    .filter(Boolean);

  res.json(orderedProducts);
});



// @route   DELETE /api/products/:id
// @access  Private/Admin
const deleteProduct = asyncHandler(async (req, res) => {
  const isDemoAdmin = req.user.email === 'demo@phonestore.com';
  if (isDemoAdmin) {
    return res.status(403).json({ message: 'Demo accounts have read-only access.' });
  }

  const product = await Product.findById(req.params.id);
  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  try {
    const publicIdsToDelete = new Set();

    // 1. MAIN PRODUCT IMAGE
    if (product.image) {
      const mainImageId = extractPublicId(product.image);
      if (mainImageId) publicIdsToDelete.add(mainImageId);
    }

    // 2. VARIANT -> COLOR IMAGES
    product.variants?.forEach((variant) => {
      variant.colors?.forEach((color) => {
        color.images?.forEach((img) => {
          if (img?.imagePublicId) publicIdsToDelete.add(img.imagePublicId);
        });
      });
    });

    // 3. REVIEW IMAGES - V38.09 FIX
    product.reviews?.forEach((review) => {
      review.images?.forEach((img) => {
        if (img?.imagePublicId) publicIdsToDelete.add(img.imagePublicId);
      });
    });

    // 4. DELETE FROM CLOUDINARY
    const idsArray = [...publicIdsToDelete];
    if (idsArray.length > 0) {
      console.log(`V38.09 Deleting ${idsArray.length} images from Cloudinary`);
      for (let i = 0; i < idsArray.length; i += 100) {
        const batch = idsArray.slice(i, i + 100);
        await cloudinary.api.delete_resources(batch);
      }
    }

    // 5. DELETE PRODUCT FROM DB
    await product.deleteOne();

    // 6. CLEAN UP USER CARTS AND WISHLISTS
    const productId = new mongoose.Types.ObjectId(req.params.id);
    await User.updateMany({ wishlist: productId }, { $pull: { wishlist: productId } });
    await User.updateMany({ 'cart.product': productId }, { $pull: { cart: { product: productId } } });

    res.json({ message: 'Product and all images removed' });

  } catch (error) {
    console.error('Delete product error:', error);
    await product.deleteOne().catch(() => { });
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// @route POST /api/products/:slug/reviews
// @access Private
const createProductReview = asyncHandler(async (req, res) => {
  const { rating, comment, color, storage, title, images } = req.body;

  const product = await Product.findOne({ slug: req.params.slug }); // <-- SLUG

  if (product) {
    const alreadyReviewed = product.reviews.find(
      (r) => r.user.toString() === req.user._id.toString() && r.color === color &&
        r.storage === storage
    );

    if (alreadyReviewed) {
      res.status(400);
      throw new Error('Product already reviewed for this color');
    }

    const hasPurchased = await Order.findOne({
      user: req.user._id,
      isPaid: true,
      orderItems: { $elemMatch: { product: product._id } },
    });

    const review = {
      name: req.user.name || req.user.email?.split('@')[0] || 'User',
      rating: Number(rating),
      comment,
      title,
      user: req.user._id,
      color: color || 'Default',
      storage: storage || '',
      verifiedPurchase:!!hasPurchased,
      images: [],
    };

    if (images && images.length > 0) {
      images.forEach((img) => {
        if (typeof img === 'object' && img.secure_url && img.public_id) {
          review.images.push({ url: img.secure_url, imagePublicId: img.public_id });
        } else if (typeof img === 'object' && img.url && img.imagePublicId) {
          review.images.push({ url: img.url, imagePublicId: img.imagePublicId });
        } else if (typeof img === 'string') {
          review.images.push({ url: img, imagePublicId: extractPublicId(img) });
        }
      });
    }

    product.reviews.push(review);
    product.numReviews = product.reviews.length;
    product.rating = product.reviews.reduce((acc, item) => item.rating + acc, 0) / product.reviews.length;

    await product.save();
    res.status(201).json({ message: 'Review added' });
  } else {
    res.status(404);
    throw new Error('Product not found');
  }
});

// @desc Get all reviews for a product
// @route GET /api/products/:slug/reviews
// @access Public
const getProductReviews = asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const { color, storage, sort, keyword, rating } = req.query;

  const product = await Product.findOne({ slug: req.params.slug });

  if (!product) {
    res.status(404);
    throw new Error("Product not found");
  }

  // KEY 1: CALCULATE BREAKDOWN FROM ALL REVIEWS FIRST
  const fullRatingBreakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  product.reviews.forEach(r => {
    fullRatingBreakdown[r.rating] = (fullRatingBreakdown[r.rating] || 0) + 1;
  });

  let reviews = [...product.reviews];

  // FILTERS
  if (color && color !== "all") reviews = reviews.filter((review) => review.color === color);
  if (storage && storage !== 'all') reviews = reviews.filter((review) => review.storage === storage);
  if (rating) reviews = reviews.filter((review) => review.rating === Number(rating));

  if (keyword && keyword.trim()) {
    const search = keyword.trim().toLowerCase();
    reviews = reviews.filter((review) =>
      review.comment?.toLowerCase().includes(search) ||
      review.title?.toLowerCase().includes(search) ||
      review.name?.toLowerCase().includes(search)
    );
  }

  reviews = reviews.map((review) => ({
   ...review.toObject(),
    helpfulCount: review.helpful ? review.helpful.length : 0,
    notHelpfulCount: review.notHelpful ? review.notHelpful.length : 0,
  }));

  // SORT
  switch (sort) {
    case "highest": reviews.sort((a, b) => b.rating - a.rating); break;
    case "lowest": reviews.sort((a, b) => a.rating - b.rating); break;
    case "oldest": reviews.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)); break;
    case "helpful": reviews.sort((a, b) => b.helpfulCount - a.helpfulCount); break;
    case "notHelpful": reviews.sort((a, b) => b.notHelpfulCount - a.notHelpfulCount); break;
    default: reviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  const totalReviews = reviews.length;
  const totalPages = Math.ceil(totalReviews / limit);
  const paginatedReviews = reviews.slice(skip, skip + limit);

  res.json({
    reviews: paginatedReviews,
    page,
    totalPages,
    total: totalReviews,
    hasMore: page < totalPages,
    nextPage: page < totalPages ? page + 1 : null,
    ratingBreakdown: fullRatingBreakdown, // KEY 2: SEND FULL BREAKDOWN
  });
});

// @desc Update product review
// @route PUT /api/products/:slug/reviews/:reviewId
// @access Private
const updateProductReview = asyncHandler(async (req, res) => {
  const { rating, comment, images, title } = req.body;
  const product = await Product.findOne({ slug: req.params.slug }); // <-- SLUG

  if (!product) { res.status(404); throw new Error('Product not found'); }

  const review = product.reviews.id(req.params.reviewId);
  if (!review) { res.status(404); throw new Error('Review not found'); }

  if (review.user.toString()!== req.user._id.toString() &&!req.user.isAdmin) {
    res.status(401); throw new Error('Not authorized');
  }

  const oldImages = review.images || [];
  const newImages = images || [];
  const publicIdsToDelete = oldImages
   .filter(oldImg =>!newImages.some(newImg => newImg.imagePublicId === oldImg.imagePublicId))
   .map(img => img.imagePublicId).filter(Boolean);

  if (publicIdsToDelete.length > 0) {
    try { await cloudinary.api.delete_resources(publicIdsToDelete); } 
    catch (err) { console.error('Cloudinary delete failed:', err); }
  }

  review.rating = Number(rating) || review.rating;
  review.comment = comment || review.comment;
  review.title = title || review.title;
  review.images = newImages;

  product.numReviews = product.reviews.length;
  product.rating = product.reviews.length > 0? product.reviews.reduce((acc, r) => acc + r.rating, 0) / product.reviews.length : 0;

  await product.save();
  res.json({ message: 'Review updated', review });
});

// @desc Delete a product review + its images
// @route DELETE /api/products/:slug/reviews/:reviewId
// @access Private
const deleteProductReview = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ slug: req.params.slug }); // <-- SLUG
  if (!product) { res.status(404); throw new Error('Product not found'); }

  const review = product.reviews.find((r) => r._id.toString() === req.params.reviewId);
  if (!review) { res.status(404); throw new Error('Review not found'); }

  if (review.user.toString()!== req.user._id.toString() &&!req.user.isAdmin) {
    res.status(401); throw new Error('Not authorized');
  }

  const publicIdsToDelete = [];
  if (review.images?.length > 0) {
    review.images.forEach(img => { if (img.imagePublicId) publicIdsToDelete.push(img.imagePublicId); });
  }
  if (publicIdsToDelete.length > 0) {
    try { await cloudinary.api.delete_resources(publicIdsToDelete); } 
    catch (err) { console.error('Cloudinary delete failed:', err); }
  }

  product.reviews = product.reviews.filter((r) => r._id.toString()!== req.params.reviewId);
  product.numReviews = product.reviews.length;
  product.rating = product.reviews.length > 0? product.reviews.reduce((acc, r) => acc + r.rating, 0) / product.reviews.length : 0;

  await product.save();
  res.json({ message: 'Review removed' });
});

// @route PUT /api/products/:slug/reviews/:reviewId/helpful
// @access Private
const markReviewHelpful = asyncHandler(async (req, res) => {
  const { slug, reviewId } = req.params;
  const userId = req.user._id;

  const product = await Product.findOne({ slug, 'reviews._id': reviewId });
  if (!product) { res.status(404); throw new Error('Product not found'); }
  
  const review = product.reviews.id(reviewId);
  const hasHelpful = review.helpful.some(id => id.toString() === userId.toString());
  const hasNotHelpful = review.notHelpful.some(id => id.toString() === userId.toString());

  let update = {};
  if (hasHelpful) {
    update = { $pull: { 'reviews.$.helpful': userId } }; // remove vote
  } else {
    update = { 
      $addToSet: { 'reviews.$.helpful': userId }, // add vote
      $pull: { 'reviews.$.notHelpful': userId } // remove opposite
    };
  }

  await Product.updateOne({ _id: product._id, 'reviews._id': reviewId }, update);
  const updatedProduct = await Product.findOne({ slug });
  const updatedReview = updatedProduct.reviews.id(reviewId);

  res.status(200).json({ 
    helpfulCount: updatedReview.helpful.length, 
    notHelpfulCount: updatedReview.notHelpful.length,
    userVoted:!hasHelpful 
  });
});

// @route PUT /api/products/:slug/reviews/:reviewId/not-helpful
// @access Private
const markReviewNotHelpful = asyncHandler(async (req, res) => {
  const { slug, reviewId } = req.params;
  const userId = req.user._id;

  const product = await Product.findOne({ slug, 'reviews._id': reviewId });
  if (!product) { res.status(404); throw new Error("Product not found"); }

  const review = product.reviews.id(reviewId);
  const hasNotHelpful = review.notHelpful.some(id => id.toString() === userId.toString());
  const hasHelpful = review.helpful.some(id => id.toString() === userId.toString());

  let update = {};
  if (hasNotHelpful) {
    update = { $pull: { 'reviews.$.notHelpful': userId } };
  } else {
    update = { 
      $addToSet: { 'reviews.$.notHelpful': userId },
      $pull: { 'reviews.$.helpful': userId }
    };
  }

  await Product.updateOne({ _id: product._id, 'reviews._id': reviewId }, update);
  const updatedProduct = await Product.findOne({ slug });
  const updatedReview = updatedProduct.reviews.id(reviewId);

  res.status(200).json({ 
    helpfulCount: updatedReview.helpful.length, 
    notHelpfulCount: updatedReview.notHelpful.length, 
    userVoted:!hasNotHelpful 
  });
});

// Admin reply controllers
const addAdminReply = asyncHandler(async (req, res) => {
  const { slug, reviewId } = req.params;
  const { reply: replyText } = req.body;

  await Product.updateOne(
    { slug, 'reviews._id': reviewId },
    { $set: { 
        'reviews.$.adminReply': { 
          reply: replyText, 
          name: req.user.name, 
          user: req.user._id, 
          createdAt: new Date() 
        } 
      } 
    }
  );
  res.status(201).json({ message: 'Reply added' });
});

const editAdminReply = asyncHandler(async (req, res) => {
  const { slug, reviewId } = req.params;
  const { reply } = req.body;

  await Product.updateOne(
    { slug, 'reviews._id': reviewId, 'reviews.adminReply': { $exists: true } },
    { $set: { 
        'reviews.$.adminReply.reply': reply,
        'reviews.$.adminReply.repliedAt': Date.now()
      } 
    }
  );
  res.status(200).json({ message: 'Reply updated' });
});

const deleteAdminReply = asyncHandler(async (req, res) => {
  const { slug, reviewId } = req.params;

  await Product.updateOne(
    { slug, 'reviews._id': reviewId },
    { $unset: { 'reviews.$.adminReply': "" } }
  );
  res.json({ message: 'Reply deleted' });
});

// @desc    Get all review images for a product
// @route   GET /api/products/slug/:slug/reviews/images
// @access  Public
const getProductReviewImages = asyncHandler(async (req, res) => {
  const { slug } = req.params;

  const product = await Product.findOne({ slug });

  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  // Flatten all images from all reviews
  const allImages = product.reviews.flatMap(review =>
    (review.images || []).map(img => ({
      url: img.url,
      imagePublicId: img.imagePublicId,
      reviewId: review._id,
      user: review.name,
      rating: review.rating,
      createdAt: review.createdAt,
      color: review.color,
      storage: review.storage,
    }))
  );

  res.json(allImages);
});

// @desc Get brand menu products with image + price
// @route GET /api/products/brand-menu/:brand
// @access Public
const getBrandMenuProducts = asyncHandler(async (req, res) => {
  const { brand } = req.params

  const products = await Product.find({ brand: { $regex: brand, $options: 'i' } })
  .select('name slug brand variants')
  .sort({ createdAt: -1 })
  .limit(8)

  if (!products) {
    return res.json([])
  }

  // Use same "FIRST COLOR" logic as getProducts
  const productsWithCalc = products.map(p => {
    const firstVariant = p.variants?.[0]
    const firstColor = firstVariant?.colors?.[0] || { price: 0, images: [], discount: {} }

    const { finalPrice, discountAmount, isActive } = calculateDiscount(firstColor.price, firstColor.discount)

    return {
      _id: p._id,
      name: p.name,
      slug: p.slug,
      brand: p.brand,
      image: firstColor.images?.[0]?.url || '/placeholder.png', // first image
      price: Number(finalPrice.toFixed(2)), // discounted price
      originalPrice: Number(firstColor.price.toFixed(2)),
      discountPercent: isActive? firstColor.discount.value : 0,
    }
  })

  res.json(productsWithCalc)
})

// @desc    Update product specs
// @route   PUT /api/products/:id/specs
// @access  Private/Admin
// const updateProductSpecs = asyncHandler(async (req, res) => {
//   const product = await Product.findById(req.params.id)

//   if (product) {
//     // Fix: Default to empty object if specs is undefined
//     product.specs = {
//       ...(product.specs ? product.specs.toObject() : {}),
//       ...req.body.specs,
//     }

//     const updatedProduct = await product.save()
//     res.json(updatedProduct)
//   } else {
//     res.status(404)
//     throw new Error('Product not found')
//   }
// })



module.exports = {
  createProduct,
  getProducts,
  getProductsForDropdown,
  getProductById,
  getProductBySlug,
  updateProduct,
  deleteProduct,
  getBestSellerProducts,
  getDealsProducts,
  getNewArrivalProducts,
  getFrequentlyBoughtTogether,
  compareProducts,
  getRecommendedProducts,
  createProductReview,
  getProductReviews,
  //updateProductSpecs,
  updateProductReview,
  deleteProductReview,
  markReviewHelpful,
  markReviewNotHelpful,
  addAdminReply,
  editAdminReply,
  deleteAdminReply,
  getProductReviewImages,
  getBrandMenuProducts,
}