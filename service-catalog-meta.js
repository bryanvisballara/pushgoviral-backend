const SERVICE_TYPE_PATTERNS = [
  { id: "stories_views", label: "Stories Views", tokens: ["stories_views", "stories views"] },
  { id: "reel_views", label: "Reel Views", tokens: ["reel_views", "reel views"] },
  { id: "video_views", label: "Video Views", tokens: ["video_views", "video views"] },
  { id: "followers", label: "Followers", tokens: ["followers"] },
  { id: "repost", label: "Repost", tokens: ["repost"] },
  { id: "shares", label: "Shares", tokens: ["shares"] },
  { id: "saves", label: "Saves", tokens: ["saves"] },
  { id: "likes", label: "Likes", tokens: ["likes"] },
  { id: "other", label: "Other", tokens: ["other"] },
];

const QUALITY_TIER_PATTERNS = [
  { id: "global", label: "Global", tokens: ["global", "globales"], kind: "geo" },
  { id: "latinos", label: "Latinos", tokens: ["latinos", "latino"], kind: "geo" },
  { id: "americans", label: "Americans", tokens: ["americans", "american"], kind: "geo" },
  { id: "basic", label: "Basic", tokens: ["basic"], kind: "tier" },
  { id: "standard", label: "Standard", tokens: ["standard"], kind: "tier" },
  { id: "premium", label: "Premium", tokens: ["premium"], kind: "tier" },
  { id: "other", label: "Other", tokens: ["other"], kind: "tier" },
];

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

function stripCategoryPrefix(key, category) {
  const normalizedKey = String(key || "").trim().toLowerCase();
  const normalizedCategory = String(category || "").trim().toLowerCase();
  if (normalizedCategory && normalizedKey.startsWith(`${normalizedCategory}_`)) {
    return normalizedKey.slice(normalizedCategory.length + 1);
  }
  return normalizedKey;
}

function findPatternMatch(source, patterns) {
  const normalized = String(source || "").toLowerCase();
  for (const pattern of patterns) {
    for (const token of pattern.tokens) {
      const tokenNormalized = token.toLowerCase();
      if (
        normalized.includes(tokenNormalized)
        || normalized.includes(tokenNormalized.replace(/\s+/g, "_"))
      ) {
        return pattern;
      }
    }
  }
  return null;
}

function inferServiceType(key, label, category) {
  const remainder = stripCategoryPrefix(key, category);
  const typeFromKey = findPatternMatch(remainder, SERVICE_TYPE_PATTERNS);
  if (typeFromKey) {
    return typeFromKey.id;
  }

  const typeFromLabel = findPatternMatch(label, SERVICE_TYPE_PATTERNS);
  if (typeFromLabel) {
    return typeFromLabel.id;
  }

  return slugifyCatalogId(label) || "other";
}

function inferQualityTier(key, label) {
  const combined = `${String(key || "")} ${String(label || "")}`;
  const geoMatch = QUALITY_TIER_PATTERNS.find((pattern) => {
    if (pattern.kind !== "geo") {
      return false;
    }
    return Boolean(findPatternMatch(combined, [pattern]));
  });

  if (geoMatch) {
    return geoMatch.id;
  }

  const tierMatch = QUALITY_TIER_PATTERNS.find((pattern) => {
    if (pattern.kind !== "tier") {
      return false;
    }
    return Boolean(findPatternMatch(combined, [pattern]));
  });

  if (tierMatch) {
    return tierMatch.id;
  }

  return slugifyCatalogId(label) || "standard";
}

function getServiceTypeLabel(serviceType, customLabel) {
  const explicit = String(customLabel || "").trim();
  if (explicit) {
    return explicit;
  }
  return SERVICE_TYPE_PATTERNS.find((item) => item.id === serviceType)?.label
    || titleCaseCatalogLabel(serviceType)
    || "Other";
}

function getQualityLabel(qualityTier, customLabel) {
  const explicit = String(customLabel || "").trim();
  if (explicit) {
    return explicit;
  }
  return QUALITY_TIER_PATTERNS.find((item) => item.id === qualityTier)?.label
    || titleCaseCatalogLabel(qualityTier)
    || "Standard";
}

function normalizeServiceType(value, key, label, category, labelHint) {
  const fromSlug = slugifyCatalogId(value);
  if (fromSlug) {
    return fromSlug;
  }
  const fromLabel = slugifyCatalogId(labelHint);
  if (fromLabel) {
    return fromLabel;
  }
  return inferServiceType(key, label, category);
}

function normalizeQualityTier(value, key, label, labelHint) {
  const fromSlug = slugifyCatalogId(value);
  if (fromSlug) {
    return fromSlug;
  }
  const fromLabel = slugifyCatalogId(labelHint);
  if (fromLabel) {
    return fromLabel;
  }
  return inferQualityTier(key, label);
}

function resolveServiceMeta(service, categoryHint) {
  const category = String(service?.category || categoryHint || "").trim().toLowerCase();
  const key = String(service?.key || "").trim();
  const label = String(service?.label || "").trim();
  const serviceTypeLabelInput = String(service?.serviceTypeLabel || "").trim();
  const qualityLabelInput = String(service?.qualityLabel || "").trim();
  const serviceType = normalizeServiceType(service?.serviceType, key, label, category, serviceTypeLabelInput);
  const qualityTier = normalizeQualityTier(service?.qualityTier, key, label, qualityLabelInput);

  return {
    serviceType,
    serviceTypeLabel: getServiceTypeLabel(serviceType, serviceTypeLabelInput),
    qualityTier,
    qualityLabel: getQualityLabel(qualityTier, qualityLabelInput),
  };
}

function enrichService(service, categoryHint) {
  const meta = resolveServiceMeta(service, categoryHint);
  return {
    ...service,
    ...meta,
  };
}

function getPublicServiceTypes() {
  return SERVICE_TYPE_PATTERNS.map(({ id, label }) => ({ id, label }));
}

function getPublicQualityTiers() {
  return QUALITY_TIER_PATTERNS.map(({ id, label }) => ({ id, label }));
}

module.exports = {
  SERVICE_TYPE_PATTERNS,
  QUALITY_TIER_PATTERNS,
  slugifyCatalogId,
  titleCaseCatalogLabel,
  inferServiceType,
  inferQualityTier,
  resolveServiceMeta,
  enrichService,
  getServiceTypeLabel,
  getQualityLabel,
  normalizeServiceType,
  normalizeQualityTier,
  getPublicServiceTypes,
  getPublicQualityTiers,
};
