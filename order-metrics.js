const { inferServiceCategory } = require("./service-categories");

function normalizeLookupText(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function buildServicePriceIndex(services) {
  const byKey = new Map();
  const byLabel = new Map();
  const byCategoryTypeQuality = new Map();
  const all = Array.isArray(services) ? services : [];

  for (const service of all) {
    const key = String(service.key || "").trim();
    if (key) {
      byKey.set(key, service);
    }

    const label = normalizeLookupText(service.label);
    if (label) {
      byLabel.set(label, service);
    }

    const category = normalizeLookupText(service.category);
    const serviceType = normalizeLookupText(service.serviceType);
    const qualityTier = normalizeLookupText(service.qualityTier);
    const qualityLabel = normalizeLookupText(service.qualityLabel);

    if (category && serviceType) {
      for (const quality of [qualityTier, qualityLabel]) {
        if (!quality) {
          continue;
        }
        byCategoryTypeQuality.set(`${category}|${serviceType}|${quality}`, service);
      }
    }
  }

  return { byKey, byLabel, byCategoryTypeQuality, all };
}

function matchByImpliedUnitPrice(order, index) {
  const charge = Number(order.chargeUsd || 0);
  const quantity = Number(order.quantity || 0);
  if (!Number.isFinite(charge) || charge <= 0 || !Number.isFinite(quantity) || quantity <= 0) {
    return null;
  }

  const impliedUnit = charge / quantity;
  const categoryHint = normalizeLookupText(
    order.category || inferServiceCategory(order.serviceKey, order.platform || order.service)
  );

  let best = null;
  let bestDiff = Infinity;

  for (const service of index.all) {
    const unitPrice = Number(service.unitPriceUsd || 0);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      continue;
    }

    const diff = Math.abs(unitPrice - impliedUnit);
    const tolerance = Math.max(0.0000001, impliedUnit * 0.03);
    if (diff > tolerance) {
      continue;
    }

    const category = normalizeLookupText(service.category);
    const categoryPenalty = categoryHint && category && category !== categoryHint ? 0.000001 : 0;
    const score = diff + categoryPenalty;
    if (score < bestDiff) {
      bestDiff = score;
      best = service;
    }
  }

  return best;
}

function matchByLegacyServiceName(serviceName, index) {
  const legacy = normalizeLookupText(serviceName);
  if (!legacy) {
    return null;
  }

  const legacyRules = [
    { pattern: /reel\s*views?|video\s*views?/, key: "instagram_reel_views" },
    { pattern: /instagram\s+shares?|\bshares?\b/, key: "instagram_shares" },
    { pattern: /instagram\s+likes?|\blikes?\b/, key: "instagram_likes" },
    { pattern: /instagram\s+followers?|\bfollowers?\b/, key: "instagram_followers" },
  ];

  for (const rule of legacyRules) {
    if (!rule.pattern.test(legacy)) {
      continue;
    }
    const byKey = index.byKey.get(rule.key);
    if (byKey) {
      return byKey;
    }
  }

  for (const service of index.all) {
    const label = normalizeLookupText(service.label);
    if (!label) {
      continue;
    }
    if (legacy === label || legacy.includes(label) || label.includes(legacy)) {
      return service;
    }
  }

  return null;
}

function resolveOrderServiceConfig(order, index) {
  const serviceKey = String(order.serviceKey || "").trim();
  if (serviceKey && index.byKey.has(serviceKey)) {
    return index.byKey.get(serviceKey);
  }

  const serviceName = String(order.service || "").trim();
  const displayName = String(order.serviceDisplayName || "").trim();

  for (const candidate of [serviceName, displayName]) {
    const labelMatch = index.byLabel.get(normalizeLookupText(candidate));
    if (labelMatch) {
      return labelMatch;
    }
  }

  const category = normalizeLookupText(
    order.category || inferServiceCategory(order.serviceKey, order.platform || order.service)
  );
  const serviceType = normalizeLookupText(order.serviceType);
  const qualityTier = normalizeLookupText(order.qualityTier);
  const qualityLabel = normalizeLookupText(order.qualityLabel);

  if (category && serviceType) {
    for (const quality of [qualityTier, qualityLabel]) {
      const composite = index.byCategoryTypeQuality.get(`${category}|${serviceType}|${quality}`);
      if (composite) {
        return composite;
      }
    }
  }

  const legacyMatch = matchByLegacyServiceName(serviceName || displayName, index);
  if (legacyMatch) {
    return legacyMatch;
  }

  return matchByImpliedUnitPrice(order, index);
}

function getOrderUnitCost(order, serviceConfig) {
  const storedCost = Number(order.costPerUnitUsd);
  if (Number.isFinite(storedCost) && storedCost >= 0) {
    return storedCost;
  }
  return Number(serviceConfig?.costPerUnitUsd || 0);
}

function calculateOrderPeriodMetrics(orders, serviceIndex) {
  let revenue = 0;
  let profit = 0;
  let matchedOrders = 0;
  let unmatchedOrders = 0;

  for (const order of orders) {
    const charge = Number(order.chargeUsd || 0);
    const quantity = Number(order.quantity || 0);
    if (!Number.isFinite(charge) || charge < 0) {
      continue;
    }

    revenue += charge;

    const serviceConfig = resolveOrderServiceConfig(order, serviceIndex);
    if (!serviceConfig || !Number.isFinite(quantity) || quantity <= 0) {
      unmatchedOrders += 1;
      continue;
    }

    const unitCost = getOrderUnitCost(order, serviceConfig);
    profit += charge - unitCost * quantity;
    matchedOrders += 1;
  }

  return {
    revenue,
    profit,
    matchedOrders,
    unmatchedOrders,
  };
}

module.exports = {
  buildServicePriceIndex,
  resolveOrderServiceConfig,
  calculateOrderPeriodMetrics,
};
