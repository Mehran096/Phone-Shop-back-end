const calculateBulkPrice = (basePrice, qty = 1, bulkPricing = []) => {
  // No bulk pricing = just return base price
  if (!bulkPricing || bulkPricing.length === 0) {
    return {
      pricePerItem: Number(basePrice),
      totalPrice: Number((basePrice * qty).toFixed(2)),
      appliedTier: null
    };
  }

  // Sort tiers by qty DESC so we get the biggest tier that matches
  const sortedTiers = [...bulkPricing].sort((a, b) => b.qty - a.qty);
  
  // Find first tier where qty >= tier.qty
  const appliedTier = sortedTiers.find(tier => qty >= tier.qty);

  // If no tier matches, use basePrice. If tier matches, use tier price
  const pricePerItem = appliedTier ? Number(appliedTier.price) : Number(basePrice);
  const totalPrice = Number((pricePerItem * qty).toFixed(2));

  return { pricePerItem, totalPrice, appliedTier: appliedTier || null };
};

module.exports = calculateBulkPrice;