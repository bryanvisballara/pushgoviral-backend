const DEFAULT_API_URL = "https://marketfollowers.com/api/v2";

function getApiKey() {
  return String(process.env.MARKETFOLLOWERS_API_KEY || "").trim();
}

function getApiUrl() {
  return String(process.env.MARKETFOLLOWERS_API_URL || DEFAULT_API_URL).trim();
}

function isMarketFollowersConfigured() {
  return Boolean(getApiKey());
}

async function callMarketFollowersApi(params) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("MarketFollowers API key is not configured");
  }

  const body = new URLSearchParams();
  body.set("key", apiKey);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      body.set(key, String(value));
    }
  });

  const response = await fetch(getApiUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const rawText = await response.text().catch(() => "");
  let payload = null;

  try {
    payload = rawText ? JSON.parse(rawText) : null;
  } catch (_error) {
    throw new Error(`MarketFollowers returned invalid JSON (${response.status})`);
  }

  if (!response.ok) {
    const message = payload?.error || payload?.message || rawText || `HTTP ${response.status}`;
    throw new Error(String(message));
  }

  if (payload && typeof payload === "object" && payload.error) {
    throw new Error(String(payload.error));
  }

  return payload;
}

function normalizeMarketFollowersService(raw) {
  const id = Number(raw?.service);
  const rate = Number(raw?.rate || 0);
  const min = Number(raw?.min || 0);
  const max = Number(raw?.max || 0);

  return {
    id,
    name: String(raw?.name || "").trim(),
    type: String(raw?.type || "").trim(),
    category: String(raw?.category || "").trim(),
    rate,
    costPerUnitUsd: Number.isFinite(rate) ? rate / 1000 : 0,
    min: Number.isFinite(min) ? min : 0,
    max: Number.isFinite(max) ? max : 0,
    refill: Boolean(raw?.refill),
    cancel: Boolean(raw?.cancel),
  };
}

async function listServices() {
  const payload = await callMarketFollowersApi({ action: "services" });
  const services = Array.isArray(payload) ? payload : [];
  return services
    .map(normalizeMarketFollowersService)
    .filter((item) => Number.isFinite(item.id) && item.id > 0);
}

async function getBalance() {
  const payload = await callMarketFollowersApi({ action: "balance" });
  return {
    balance: Number(payload?.balance || 0),
    currency: String(payload?.currency || "USD").trim() || "USD",
  };
}

async function addOrder({ serviceId, link, quantity }) {
  const payload = await callMarketFollowersApi({
    action: "add",
    service: serviceId,
    link,
    quantity,
  });

  const providerOrderId = payload?.order;
  if (providerOrderId === undefined || providerOrderId === null || providerOrderId === "") {
    throw new Error("MarketFollowers did not return an order id");
  }

  return {
    order: providerOrderId,
    raw: payload,
  };
}

async function getOrderStatus(providerOrderId) {
  return callMarketFollowersApi({
    action: "status",
    order: providerOrderId,
  });
}

function mapProviderStatusToPushGo(providerStatus) {
  const normalized = String(providerStatus || "").trim().toLowerCase();

  if (!normalized) {
    return "pending";
  }

  if (normalized.includes("complete")) {
    return "completed";
  }

  if (normalized.includes("cancel")) {
    return "canceled";
  }

  if (
    normalized.includes("progress")
    || normalized.includes("processing")
    || normalized.includes("partial")
    || normalized.includes("pending")
  ) {
    return normalized.includes("pending") && !normalized.includes("progress")
      ? "pending"
      : "in_progress";
  }

  return "in_progress";
}

module.exports = {
  isMarketFollowersConfigured,
  listServices,
  getBalance,
  addOrder,
  getOrderStatus,
  mapProviderStatusToPushGo,
  normalizeMarketFollowersService,
};
