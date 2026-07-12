const calculateDiscount = (price, discount = {}) => {
  const now = new Date();

  const {
    type,
    value = 0,
    startDate,
    endDate,
  } = discount;

  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;

  let isActive = Number(value) > 0;

  if (start && now < start) isActive = false;
  if (end && now > end) isActive = false;

  let finalPrice = Number(price);
  let discountAmount = 0;

  if (isActive) {
    if (type === "percentage") {
      discountAmount = (price * Number(value)) / 100;
    } else if (type === "fixed") {
      discountAmount = Number(value);
    }

    finalPrice = Math.max(0, price - discountAmount);
  }

  return {
    isActive,
    discountAmount,
    finalPrice,
  };
};

module.exports = calculateDiscount