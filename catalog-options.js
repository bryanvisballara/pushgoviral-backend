const { getPublicServiceTypes, getPublicQualityTiers } = require("./service-catalog-meta");

function slugifyCatalogId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function titleCaseCatalogLabel(value) {
  return String(value || "")
    .trim()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeCatalogEntry(rawValue, fallbackLabel) {
  const label = String(rawValue?.label || rawValue || fallbackLabel || "").trim();
  const id = slugifyCatalogId(rawValue?.id || label);
  if (!id || !label) {
    return null;
  }
  return { id, label };
}

function mergeCatalogEntries(...lists) {
  const merged = new Map();
  lists.flat().forEach((item) => {
    const normalized = normalizeCatalogEntry(item);
    if (!normalized) {
      return;
    }
    merged.set(normalized.id, normalized);
  });
  return Array.from(merged.values()).sort((left, right) => left.label.localeCompare(right.label, "en", { sensitivity: "base" }));
}

function extractCatalogEntriesFromServices(services, fieldId, fieldLabel) {
  return (Array.isArray(services) ? services : [])
    .map((service) => normalizeCatalogEntry({ id: service?.[fieldId], label: service?.[fieldLabel] }))
    .filter(Boolean);
}

async function getCatalogOptionsForCategory(database, category) {
  const normalizedCategory = String(category || "").trim().toLowerCase();
  if (!normalizedCategory || normalizedCategory === "all") {
    return {
      category: normalizedCategory,
      serviceTypes: getPublicServiceTypes(),
      qualityTiers: getPublicQualityTiers(),
    };
  }

  const [stored, services] = await Promise.all([
    database.collection("catalog_options").findOne({ category: normalizedCategory }),
    database
      .collection("service_prices")
      .find({ category: normalizedCategory })
      .project({ serviceType: 1, serviceTypeLabel: 1, qualityTier: 1, qualityLabel: 1 })
      .toArray(),
  ]);

  const serviceTypes = mergeCatalogEntries(
    getPublicServiceTypes(),
    stored?.serviceTypes || [],
    extractCatalogEntriesFromServices(services, "serviceType", "serviceTypeLabel")
  );

  const qualityTiers = mergeCatalogEntries(
    getPublicQualityTiers(),
    stored?.qualityTiers || [],
    extractCatalogEntriesFromServices(services, "qualityTier", "qualityLabel")
  );

  return {
    category: normalizedCategory,
    serviceTypes,
    qualityTiers,
  };
}

async function saveCatalogOptionsForCategory(database, category, payload) {
  const normalizedCategory = String(category || "").trim().toLowerCase();
  if (!normalizedCategory || normalizedCategory === "all") {
    throw new Error("Invalid category");
  }

  const serviceTypes = mergeCatalogEntries(payload?.serviceTypes || []);
  const qualityTiers = mergeCatalogEntries(payload?.qualityTiers || []);

  if (!serviceTypes.length || !qualityTiers.length) {
    throw new Error("At least one service type and one quality tier are required");
  }

  await database.collection("catalog_options").updateOne(
    { category: normalizedCategory },
    {
      $set: {
        category: normalizedCategory,
        serviceTypes,
        qualityTiers,
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  );

  return getCatalogOptionsForCategory(database, normalizedCategory);
}

async function registerCatalogEntriesFromService(database, category, serviceMeta) {
  const normalizedCategory = String(category || "").trim().toLowerCase();
  if (!normalizedCategory || normalizedCategory === "all") {
    return null;
  }

  const current = await getCatalogOptionsForCategory(database, normalizedCategory);
  const nextServiceTypes = mergeCatalogEntries(current.serviceTypes, [
    { id: serviceMeta.serviceType, label: serviceMeta.serviceTypeLabel },
  ]);
  const nextQualityTiers = mergeCatalogEntries(current.qualityTiers, [
    { id: serviceMeta.qualityTier, label: serviceMeta.qualityLabel },
  ]);

  await database.collection("catalog_options").updateOne(
    { category: normalizedCategory },
    {
      $set: {
        category: normalizedCategory,
        serviceTypes: nextServiceTypes,
        qualityTiers: nextQualityTiers,
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  );

  return {
    category: normalizedCategory,
    serviceTypes: nextServiceTypes,
    qualityTiers: nextQualityTiers,
  };
}

async function backfillCatalogOptions(database) {
  const serviceCategories = await database.collection("service_prices").distinct("category");
  const categories = [...new Set(serviceCategories.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean))];

  if (!categories.length) {
    return { categoriesProcessed: 0 };
  }

  let categoriesProcessed = 0;
  for (const category of categories) {
    const options = await getCatalogOptionsForCategory(database, category);
    if (!options.serviceTypes.length || !options.qualityTiers.length) {
      continue;
    }

    await database.collection("catalog_options").updateOne(
      { category },
      {
        $set: {
          category,
          serviceTypes: options.serviceTypes,
          qualityTiers: options.qualityTiers,
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );
    categoriesProcessed += 1;
  }

  return { categoriesProcessed };
}

async function getAllCatalogOptions(database) {
  const categories = await database.collection("catalog_options").find({}).toArray();
  const map = {};
  await Promise.all(
    categories.map(async (item) => {
      map[item.category] = await getCatalogOptionsForCategory(database, item.category);
    })
  );
  return map;
}

module.exports = {
  slugifyCatalogId,
  titleCaseCatalogLabel,
  normalizeCatalogEntry,
  mergeCatalogEntries,
  getCatalogOptionsForCategory,
  saveCatalogOptionsForCategory,
  registerCatalogEntriesFromService,
  backfillCatalogOptions,
  getAllCatalogOptions,
};
