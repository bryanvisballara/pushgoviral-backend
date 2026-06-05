const SERVICE_CATEGORIES = [
  { id: "instagram", label: "Instagram", order: 1, featured: true },
  { id: "tiktok", label: "TikTok", order: 2, featured: true },
  { id: "youtube", label: "YouTube", order: 3, featured: true },
  { id: "facebook", label: "Facebook", order: 4, featured: true },
  { id: "twitter", label: "Twitter / X", order: 5, featured: true },
  { id: "reddit", label: "Reddit", order: 6, featured: true },
  { id: "telegram", label: "Telegram", order: 7, featured: true },
  { id: "discord", label: "Discord", order: 8, featured: true },
  { id: "spotify", label: "Spotify", order: 9, featured: true },
  { id: "threads", label: "Threads", order: 10, featured: false },
  { id: "twitch", label: "Twitch", order: 11, featured: false },
  { id: "linkedin", label: "LinkedIn", order: 12, featured: false },
  { id: "pinterest", label: "Pinterest", order: 13, featured: false },
  { id: "other", label: "Other", order: 99, featured: false },
];

const CATEGORY_IDS = new Set(SERVICE_CATEGORIES.map((item) => item.id));

function inferServiceCategory(key, label) {
  const source = String(key || label || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");

  for (const category of SERVICE_CATEGORIES) {
    if (category.id === "other") {
      continue;
    }
    if (source.startsWith(`${category.id}_`) || source.includes(`_${category.id}_`) || source === category.id) {
      return category.id;
    }
  }

  if (source.includes("instagram")) {
    return "instagram";
  }
  if (source.includes("tiktok")) {
    return "tiktok";
  }
  if (source.includes("youtube")) {
    return "youtube";
  }
  if (source.includes("facebook")) {
    return "facebook";
  }
  if (source.includes("twitter") || source.includes("_x_")) {
    return "twitter";
  }
  if (source.includes("reddit")) {
    return "reddit";
  }
  if (source.includes("telegram")) {
    return "telegram";
  }
  if (source.includes("discord")) {
    return "discord";
  }
  if (source.includes("spotify")) {
    return "spotify";
  }
  if (source.includes("threads")) {
    return "threads";
  }
  if (source.includes("twitch")) {
    return "twitch";
  }
  if (source.includes("linkedin")) {
    return "linkedin";
  }
  if (source.includes("pinterest")) {
    return "pinterest";
  }

  return "other";
}

function normalizeServiceCategory(value, key, label) {
  const normalized = String(value || "").trim().toLowerCase();
  if (CATEGORY_IDS.has(normalized)) {
    return normalized;
  }
  return inferServiceCategory(key, label);
}

function getPublicServiceCategories() {
  return SERVICE_CATEGORIES.map(({ id, label, order, featured }) => ({
    id,
    label,
    order,
    featured,
  }));
}

module.exports = {
  SERVICE_CATEGORIES,
  CATEGORY_IDS,
  inferServiceCategory,
  normalizeServiceCategory,
  getPublicServiceCategories,
};
