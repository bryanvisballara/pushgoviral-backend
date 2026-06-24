const HOST_PLATFORM_MAP = [
  ["instagram.com", "instagram"],
  ["tiktok.com", "tiktok"],
  ["youtube.com", "youtube"],
  ["youtu.be", "youtube"],
  ["facebook.com", "facebook"],
  ["fb.com", "facebook"],
  ["fb.watch", "facebook"],
  ["twitter.com", "twitter"],
  ["x.com", "twitter"],
  ["reddit.com", "reddit"],
  ["t.me", "telegram"],
  ["telegram.me", "telegram"],
  ["discord.gg", "discord"],
  ["discord.com", "discord"],
  ["open.spotify.com", "spotify"],
  ["spotify.com", "spotify"],
  ["threads.net", "threads"],
  ["twitch.tv", "twitch"],
  ["linkedin.com", "linkedin"],
  ["pinterest.com", "pinterest"],
  ["pin.it", "pinterest"],
];

function normalizePlatformHint(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function detectPlatformFromHost(hostname) {
  const host = String(hostname || "")
    .replace(/^www\./, "")
    .toLowerCase();

  for (const [needle, platform] of HOST_PLATFORM_MAP) {
    if (host === needle || host.endsWith(`.${needle}`)) {
      return platform;
    }
  }

  return "";
}

function cleanSegment(value) {
  return String(value || "")
    .trim()
    .replace(/^@+/, "")
    .split(/[?#]/)[0]
    .replace(/\/+$/, "")
    .toLowerCase();
}

function extractInstagramTarget(pathname) {
  const parts = String(pathname || "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);

  if (!parts.length) {
    return "";
  }

  const reserved = new Set(["p", "reel", "reels", "tv", "stories", "explore", "accounts"]);
  const head = parts[0].toLowerCase();

  if (reserved.has(head) && parts[1]) {
    return `${head}:${cleanSegment(parts[1])}`;
  }

  return cleanSegment(parts[0]);
}

function extractYouTubeTarget(pathname, searchParams) {
  const parts = String(pathname || "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);

  if (!parts.length) {
    const videoId = cleanSegment(searchParams.get("v") || "");
    return videoId ? `video:${videoId}` : "";
  }

  const head = parts[0].toLowerCase();
  if (head === "watch") {
    const videoId = cleanSegment(searchParams.get("v") || parts[1] || "");
    return videoId ? `video:${videoId}` : "";
  }
  if (head === "shorts" && parts[1]) {
    return `shorts:${cleanSegment(parts[1])}`;
  }
  if ((head === "channel" || head === "c") && parts[1]) {
    return `${head}:${cleanSegment(parts[1])}`;
  }
  if (head.startsWith("@")) {
    return cleanSegment(head);
  }
  if (parts[1]) {
    return `${head}:${cleanSegment(parts[1])}`;
  }

  return cleanSegment(head);
}

function extractGenericTarget(pathname) {
  const parts = String(pathname || "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => cleanSegment(part));

  if (!parts.length) {
    return "";
  }

  if (parts[0].startsWith("@")) {
    return parts[0];
  }

  if (parts.length >= 2) {
    return `${parts[0]}:${parts[1]}`;
  }

  return parts[0];
}

function extractTarget(platform, url) {
  const pathname = decodeURIComponent(String(url.pathname || ""));
  const searchParams = url.searchParams;

  if (platform === "instagram") {
    return extractInstagramTarget(pathname);
  }
  if (platform === "youtube") {
    if (url.hostname.replace(/^www\./, "").toLowerCase() === "youtu.be") {
      const videoId = cleanSegment(pathname.replace(/^\/+/, ""));
      return videoId ? `video:${videoId}` : "";
    }
    return extractYouTubeTarget(pathname, searchParams);
  }
  if (platform === "twitter") {
    const parts = pathname.split("/").filter(Boolean);
    if (parts[0] && ["i", "intent", "home", "explore", "search"].includes(parts[0].toLowerCase())) {
      return parts[1] ? cleanSegment(parts[1]) : "";
    }
    return parts[0] ? cleanSegment(parts[0]) : "";
  }
  if (platform === "tiktok") {
    const parts = pathname.split("/").filter(Boolean);
    const handle = parts.find((part) => part.startsWith("@"));
    if (handle) {
      return cleanSegment(handle);
    }
    if (parts[0] === "video" && parts[1]) {
      return `video:${cleanSegment(parts[1])}`;
    }
    return parts[0] ? cleanSegment(parts[0]) : "";
  }
  if (platform === "telegram") {
    const parts = pathname.split("/").filter(Boolean);
    return parts[0] ? cleanSegment(parts[0]) : "";
  }
  if (platform === "reddit") {
    const parts = pathname.split("/").filter(Boolean);
    if (parts.length >= 2 && ["r", "u", "user"].includes(parts[0].toLowerCase())) {
      return `${parts[0].toLowerCase()}:${cleanSegment(parts[1])}`;
    }
    return extractGenericTarget(pathname);
  }

  return extractGenericTarget(pathname);
}

function normalizeOrderLink(rawLink, platformHint = "") {
  const raw = String(rawLink || "").trim();
  if (!raw) {
    return null;
  }

  const hintedPlatform = normalizePlatformHint(platformHint);
  let url;

  try {
    const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw.replace(/^\/+/, "")}`;
    url = new URL(candidate);
  } catch (_error) {
    const fallbackTarget = cleanSegment(raw.replace(/^@/, ""));
    if (hintedPlatform && fallbackTarget) {
      return {
        platform: hintedPlatform,
        normalizedTarget: fallbackTarget,
      };
    }
    return null;
  }

  const platform = detectPlatformFromHost(url.hostname) || hintedPlatform;
  const normalizedTarget = extractTarget(platform, url);

  if (!platform || !normalizedTarget) {
    const fallbackTarget = cleanSegment(raw.replace(/^@/, ""));
    if (hintedPlatform && fallbackTarget) {
      return {
        platform: hintedPlatform,
        normalizedTarget: fallbackTarget,
      };
    }
    return null;
  }

  return {
    platform,
    normalizedTarget,
  };
}

module.exports = {
  normalizeOrderLink,
};
