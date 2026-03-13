const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const { MongoClient, ObjectId } = require("mongodb");
const { renderVerificationEmail, renderPasswordResetEmail } = require("./email-templates/codes");

require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT || 3000);
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || "pushgo_viral";
const DEFAULT_COP_PER_USD = Number(process.env.DEFAULT_COP_PER_USD || 4100);
const MERCADOPAGO_ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN || "";
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || "https://pushgoviral.com";
const ADMIN_SESSION_TTL_MS = Number(process.env.ADMIN_SESSION_TTL_MS || 1000 * 60 * 60 * 8);
const BREVO_API_KEY = process.env.BREVO_API_KEY || "";
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || "PushGo Viral";
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || "";
const CODE_EXPIRES_MINUTES = Number(process.env.AUTH_CODE_EXPIRES_MINUTES || 10);
const CODE_MAX_ATTEMPTS = Number(process.env.AUTH_CODE_MAX_ATTEMPTS || 5);
const CODE_RESEND_COOLDOWN_SECONDS = Number(process.env.AUTH_CODE_RESEND_COOLDOWN_SECONDS || 60);
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";
const TELEGRAM_THREAD_ID = process.env.TELEGRAM_THREAD_ID || "";

const adminSessions = new Map();

function buildMongoUri() {
  if (process.env.MONGODB_URI) {
    return process.env.MONGODB_URI;
  }

  const template = process.env.MONGODB_URI_TEMPLATE;
  if (!template) {
    return "";
  }

  const dbUser = process.env.MONGODB_DB_USER;
  const dbPassword = process.env.MONGODB_DB_PASSWORD;

  if (template.includes("<db_username>") && !dbUser) {
    return "";
  }
  if (template.includes("<db_password>") && !dbPassword) {
    return "";
  }

  return template
    .replace("<db_username>", encodeURIComponent(dbUser || ""))
    .replace("<db_password>", encodeURIComponent(dbPassword || ""));
}

const MONGODB_URI = buildMongoUri();

if (!MONGODB_URI) {
  console.error(
    "Missing Mongo config. Set MONGODB_URI or MONGODB_URI_TEMPLATE (+ MONGODB_DB_USER/MONGODB_DB_PASSWORD)."
  );
  process.exit(1);
}

const mongo = new MongoClient(MONGODB_URI, {
  serverSelectionTimeoutMS: 10000,
});

let db;

async function getDb() {
  if (!db) {
    await mongo.connect();
    db = mongo.db(MONGODB_DB_NAME);
    await db.collection("orders").createIndex({ userId: 1, createdAt: -1 });
    await db.collection("email_codes").createIndex({ email: 1, purpose: 1, createdAt: -1 });
    await db.collection("email_codes").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  }
  return db;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function sanitizeName(value) {
  return String(value || "").trim();
}

function generateSixDigitCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashAuthCode({ email, purpose, code, salt }) {
  return crypto
    .createHash("sha256")
    .update(`${email}:${purpose}:${code}:${salt}`)
    .digest("hex");
}

function getUpdatedDocument(result) {
  if (!result) {
    return null;
  }
  if (typeof result === "object" && "value" in result) {
    return result.value || null;
  }
  return result;
}

async function sendBrevoEmail({ toEmail, toName, subject, htmlContent }) {
  if (!BREVO_API_KEY || !BREVO_SENDER_EMAIL) {
    throw new Error("Missing BREVO_API_KEY or BREVO_SENDER_EMAIL");
  }

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": BREVO_API_KEY,
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender: {
        name: BREVO_SENDER_NAME,
        email: BREVO_SENDER_EMAIL,
      },
      to: [
        {
          email: toEmail,
          name: toName || toEmail,
        },
      ],
      subject,
      htmlContent,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Brevo send failed (${response.status}): ${errorText}`);
  }
}

function escapeTelegramHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function sendTelegramOrderNotification({ order, user }) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    return;
  }

  const createdAt = new Date(order.createdAt || Date.now()).toISOString();
  const userLabel = user
    ? `${escapeTelegramHtml(user.firstName || "")} ${escapeTelegramHtml(user.lastName || "")}`.trim()
    : "Unknown";

  const text = [
    "<b>New Order - PushGo Viral</b>",
    "",
    `<b>Order Number:</b> ${escapeTelegramHtml(order.orderNumber)}`,
    `<b>User ID:</b> ${escapeTelegramHtml(order.userId)}`,
    `<b>User:</b> ${userLabel || "Unknown"}`,
    `<b>Username:</b> ${escapeTelegramHtml(user?.username || "-")}`,
    `<b>Email:</b> ${escapeTelegramHtml(user?.email || "-")}`,
    `<b>Service:</b> ${escapeTelegramHtml(order.service)}`,
    `<b>Platform:</b> ${escapeTelegramHtml(order.platform)}`,
    `<b>Link:</b> ${escapeTelegramHtml(order.link)}`,
    `<b>Quantity:</b> ${escapeTelegramHtml(order.quantity)}`,
    `<b>Charge USD:</b> ${escapeTelegramHtml(Number(order.chargeUsd || 0).toFixed(2))}`,
    `<b>Status:</b> ${escapeTelegramHtml(order.status)}`,
    `<b>Created At:</b> ${escapeTelegramHtml(createdAt)}`,
  ].join("\n");

  const payload = {
    chat_id: TELEGRAM_CHAT_ID,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };

  const threadId = Number(TELEGRAM_THREAD_ID);
  if (Number.isFinite(threadId) && threadId > 0) {
    payload.message_thread_id = threadId;
  }

  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Telegram send failed (${response.status}): ${details}`);
  }
}

async function requestEmailCode({ database, email, purpose, firstName }) {
  const now = new Date();
  const cooldownDate = new Date(now.getTime() - CODE_RESEND_COOLDOWN_SECONDS * 1000);

  const recentCode = await database.collection("email_codes").findOne(
    {
      email,
      purpose,
      createdAt: { $gte: cooldownDate },
      usedAt: null,
      expiresAt: { $gt: now },
    },
    { sort: { createdAt: -1 } }
  );

  if (recentCode) {
    return { ok: false, reason: "cooldown" };
  }

  const code = generateSixDigitCode();
  const salt = crypto.randomBytes(12).toString("hex");
  const codeHash = hashAuthCode({ email, purpose, code, salt });
  const expiresAt = new Date(now.getTime() + CODE_EXPIRES_MINUTES * 60 * 1000);

  await database.collection("email_codes").insertOne({
    email,
    purpose,
    salt,
    codeHash,
    attempts: 0,
    maxAttempts: CODE_MAX_ATTEMPTS,
    createdAt: now,
    expiresAt,
    usedAt: null,
  });

  const htmlContent =
    purpose === "email_verification"
      ? renderVerificationEmail({ firstName, code, expiresMinutes: CODE_EXPIRES_MINUTES })
      : renderPasswordResetEmail({ firstName, code, expiresMinutes: CODE_EXPIRES_MINUTES });

  const subject =
    purpose === "email_verification"
      ? "PushGo Viral | Verify Your Email"
      : "PushGo Viral | Password Reset Code";

  await sendBrevoEmail({
    toEmail: email,
    toName: firstName,
    subject,
    htmlContent,
  });

  return { ok: true };
}

async function verifyEmailCode({ database, email, purpose, code }) {
  const now = new Date();
  const latest = await database.collection("email_codes").findOne(
    {
      email,
      purpose,
      usedAt: null,
      expiresAt: { $gt: now },
    },
    { sort: { createdAt: -1 } }
  );

  if (!latest) {
    return { ok: false, reason: "expired_or_missing" };
  }

  if (Number(latest.attempts || 0) >= Number(latest.maxAttempts || CODE_MAX_ATTEMPTS)) {
    return { ok: false, reason: "max_attempts" };
  }

  const expectedHash = hashAuthCode({
    email,
    purpose,
    code,
    salt: String(latest.salt || ""),
  });

  if (expectedHash !== latest.codeHash) {
    await database.collection("email_codes").updateOne(
      { _id: latest._id },
      { $inc: { attempts: 1 } }
    );
    return { ok: false, reason: "invalid_code" };
  }

  await database.collection("email_codes").updateOne(
    { _id: latest._id },
    { $set: { usedAt: new Date() } }
  );

  return { ok: true };
}

function normalizeStatus(input) {
  const value = String(input || "pending").toLowerCase();
  const allowed = new Set(["pending", "in_progress", "completed", "canceled"]);
  return allowed.has(value) ? value : "pending";
}

function startOfDay(date = new Date()) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function startOfWeek(date = new Date()) {
  const value = startOfDay(date);
  const day = value.getDay();
  const diff = day === 0 ? 6 : day - 1;
  value.setDate(value.getDate() - diff);
  return value;
}

function startOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function toObjectId(id) {
  if (!id || !ObjectId.isValid(id)) {
    return null;
  }
  return new ObjectId(id);
}

async function getAdminFromToken(req) {
  const authHeader = req.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    return null;
  }

  const currentSession = adminSessions.get(token);
  if (!currentSession || currentSession.expiresAt < Date.now()) {
    adminSessions.delete(token);
    return null;
  }

  const database = await getDb();
  const admin = await database.collection("admin_users").findOne(
    { _id: currentSession.adminId },
    { projection: { password: 0 } }
  );
  if (!admin || admin.status !== "active") {
    adminSessions.delete(token);
    return null;
  }

  return { token, admin };
}

async function requireAdmin(req, res, next) {
  try {
    const session = await getAdminFromToken(req);
    if (!session) {
      return res.status(401).json({ error: "Admin authentication required" });
    }
    req.adminSession = session;
    return next();
  } catch (error) {
    console.error("admin-auth-error", error);
    return res.status(401).json({ error: "Admin authentication failed" });
  }
}

function resolveWebhookBaseUrl(req) {
  const explicitBase = process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL;
  if (explicitBase) {
    return String(explicitBase).replace(/\/+$/, "");
  }
  const host = req.get("host");
  return `https://${host}`;
}

async function creditWalletBalance(database, userId, amountUsd) {
  const numericAmount = Number(amountUsd || 0);
  if (!userId || !Number.isFinite(numericAmount) || numericAmount <= 0) {
    return;
  }

  await database.collection("wallets").updateOne(
    { userId: String(userId) },
    {
      $setOnInsert: { userId: String(userId), currency: "USD" },
      $inc: { balance: numericAmount },
      $set: { updatedAt: new Date() },
    },
    { upsert: true }
  );
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "pushgoviral-backend",
    webhookHint: "Use /api/payments/mercadopago/webhook for Mercado Pago notifications",
  });
});

app.post("/api/auth/email-verification/request", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const firstName = sanitizeName(req.body?.firstName);

    if (!email) {
      return res.status(400).json({ error: "email is required" });
    }

    const database = await getDb();
    const result = await requestEmailCode({
      database,
      email,
      purpose: "email_verification",
      firstName,
    });

    if (!result.ok && result.reason === "cooldown") {
      return res.status(429).json({
        error: `Please wait ${CODE_RESEND_COOLDOWN_SECONDS} seconds before requesting a new code.`,
      });
    }

    return res.json({ ok: true, message: "Verification code sent" });
  } catch (error) {
    console.error("email-verification-request-error", error);
    return res.status(500).json({ error: "Could not send verification code" });
  }
});

app.post("/api/auth/register/verify", async (req, res) => {
  try {
    const firstName = sanitizeName(req.body?.firstName);
    const lastName = sanitizeName(req.body?.lastName);
    const email = normalizeEmail(req.body?.email);
    const username = normalizeUsername(req.body?.username || `${firstName}.${lastName}`.replace(/\s+/g, ""));
    const password = String(req.body?.password || "PushGo2026!");
    const code = String(req.body?.code || "").trim();

    if (!firstName || !lastName || !email || !username || !code) {
      return res.status(400).json({ error: "firstName, lastName, email, username and code are required" });
    }

    const database = await getDb();
    const checkCode = await verifyEmailCode({
      database,
      email,
      purpose: "email_verification",
      code,
    });

    if (!checkCode.ok) {
      return res.status(400).json({ error: "Invalid or expired verification code" });
    }

    const existing = await database.collection("users").findOne({
      $or: [{ email }, { username }],
    });

    if (existing) {
      return res.status(409).json({ error: "User already exists" });
    }

    const now = new Date();
    const userId = `u${Date.now()}`;

    await database.collection("users").insertOne({
      _id: userId,
      firstName,
      lastName,
      username,
      email,
      password,
      role: "client",
      status: "active",
      verified: true,
      createdAt: now,
      updatedAt: now,
    });

    await database.collection("wallets").updateOne(
      { userId },
      {
        $setOnInsert: { userId, currency: "USD", balance: 0 },
        $set: { updatedAt: now },
      },
      { upsert: true }
    );

    return res.status(201).json({
      ok: true,
      user: { id: userId, firstName, lastName, username, email },
    });
  } catch (error) {
    console.error("register-verify-error", error);
    return res.status(500).json({ error: "Could not complete registration" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const usernameOrEmail = normalizeEmail(req.body?.username || req.body?.email);
    const password = String(req.body?.password || "");

    if (!usernameOrEmail || !password) {
      return res.status(400).json({ error: "username/email and password are required" });
    }

    const database = await getDb();
    const user = await database.collection("users").findOne({
      $or: [{ username: usernameOrEmail }, { email: usernameOrEmail }],
    });

    const storedPassword = String(user?.password || "PushGo2026!");
    if (!user || user.status !== "active" || storedPassword !== password) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const wallet = await database.collection("wallets").findOne({ userId: String(user._id) });

    return res.json({
      ok: true,
      user: {
        id: String(user._id),
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        username: user.username || "",
        email: user.email || "",
        verified: true,
        balance: Number(wallet?.balance || 0),
      },
    });
  } catch (error) {
    console.error("auth-login-error", error);
    return res.status(500).json({ error: "Could not sign in" });
  }
});

app.post("/api/auth/password-reset/request", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!email) {
      return res.status(400).json({ error: "email is required" });
    }

    const database = await getDb();
    const user = await database.collection("users").findOne({ email });

    // Do not reveal whether a user exists.
    if (!user) {
      return res.json({ ok: true, message: "If the account exists, a reset code was sent." });
    }

    const result = await requestEmailCode({
      database,
      email,
      purpose: "password_reset",
      firstName: sanitizeName(user.firstName),
    });

    if (!result.ok && result.reason === "cooldown") {
      return res.status(429).json({
        error: `Please wait ${CODE_RESEND_COOLDOWN_SECONDS} seconds before requesting a new code.`,
      });
    }

    return res.json({ ok: true, message: "If the account exists, a reset code was sent." });
  } catch (error) {
    console.error("password-reset-request-error", error);
    return res.status(500).json({ error: "Could not process password reset request" });
  }
});

app.post("/api/auth/password-reset/confirm", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const code = String(req.body?.code || "").trim();
    const newPassword = String(req.body?.newPassword || "");

    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: "email, code and newPassword are required" });
    }

    const database = await getDb();
    const checkCode = await verifyEmailCode({
      database,
      email,
      purpose: "password_reset",
      code,
    });

    if (!checkCode.ok) {
      return res.status(400).json({ error: "Invalid or expired reset code" });
    }

    const result = await database.collection("users").findOneAndUpdate(
      { email },
      {
        $set: {
          password: newPassword,
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after" }
    );

    const updatedUser = getUpdatedDocument(result);

    if (!updatedUser) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json({ ok: true, message: "Password updated successfully" });
  } catch (error) {
    console.error("password-reset-confirm-error", error);
    return res.status(500).json({ error: "Could not reset password" });
  }
});

app.post("/api/admin/login", async (req, res) => {
  try {
    const usernameOrEmail = String(req.body?.username || req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (!usernameOrEmail || !password) {
      return res.status(400).json({ error: "username/email and password are required" });
    }

    const database = await getDb();
    const admin = await database.collection("admin_users").findOne({
      $or: [{ username: usernameOrEmail }, { email: usernameOrEmail }],
    });

    if (!admin || admin.status !== "active" || admin.password !== password) {
      return res.status(401).json({ error: "Invalid admin credentials" });
    }

    const token = crypto.randomBytes(24).toString("hex");
    const expiresAt = Date.now() + ADMIN_SESSION_TTL_MS;
    adminSessions.set(token, { adminId: admin._id, expiresAt });

    return res.json({
      ok: true,
      token,
      expiresAt,
      admin: {
        id: admin._id,
        username: admin.username,
        email: admin.email,
        role: admin.role,
        displayName: admin.displayName || admin.username,
      },
    });
  } catch (error) {
    console.error("admin-login-error", error);
    return res.status(500).json({ error: "Could not sign in admin" });
  }
});

app.post("/api/admin/logout", requireAdmin, (req, res) => {
  adminSessions.delete(req.adminSession.token);
  return res.json({ ok: true });
});

app.get("/api/admin/me", requireAdmin, (req, res) => {
  return res.json({ ok: true, admin: req.adminSession.admin });
});

app.get("/api/admin/users", requireAdmin, async (_req, res) => {
  try {
    const database = await getDb();
    const users = await database
      .collection("users")
      .aggregate([
        {
          $lookup: {
            from: "wallets",
            localField: "_id",
            foreignField: "userId",
            as: "wallet",
          },
        },
        {
          $project: {
            _id: 1,
            firstName: 1,
            lastName: 1,
            username: 1,
            email: 1,
            role: 1,
            status: 1,
            createdAt: 1,
            balanceUsd: { $ifNull: [{ $arrayElemAt: ["$wallet.balance", 0] }, 0] },
          },
        },
        { $sort: { createdAt: -1, _id: 1 } },
      ])
      .toArray();

    return res.json({ ok: true, users });
  } catch (error) {
    console.error("admin-users-error", error);
    return res.status(500).json({ error: "Could not fetch users" });
  }
});

app.get("/api/admin/orders", requireAdmin, async (req, res) => {
  try {
    const status = String(req.query?.status || "pending").toLowerCase();
    const allowed = new Set(["pending", "in_progress", "completed", "canceled", "all"]);
    if (!allowed.has(status)) {
      return res.status(400).json({ error: "Invalid status filter" });
    }

    const filter = status === "all" ? {} : { status };
    const database = await getDb();
    const orders = await database.collection("orders").find(filter).sort({ createdAt: -1 }).limit(500).toArray();

    return res.json({
      ok: true,
      orders: orders.map((item) => ({ ...item, _id: String(item._id) })),
    });
  } catch (error) {
    console.error("admin-orders-error", error);
    return res.status(500).json({ error: "Could not fetch orders" });
  }
});

app.patch("/api/admin/orders/:id/complete", requireAdmin, async (req, res) => {
  try {
    const database = await getDb();
    const rawId = String(req.params.id || "");
    const objectId = toObjectId(rawId);
    const filter = objectId ? { _id: objectId } : { _id: rawId };

    const result = await database.collection("orders").findOneAndUpdate(
      filter,
      { $set: { status: "completed", updatedAt: new Date() } },
      { returnDocument: "after" }
    );

    const updatedOrder = getUpdatedDocument(result);

    if (!updatedOrder) {
      return res.status(404).json({ error: "Order not found" });
    }

    return res.json({ ok: true, order: { ...updatedOrder, _id: String(updatedOrder._id) } });
  } catch (error) {
    console.error("admin-order-complete-error", error);
    return res.status(500).json({ error: "Could not complete order" });
  }
});

app.get("/api/admin/service-prices", requireAdmin, async (_req, res) => {
  try {
    const database = await getDb();
    const services = await database.collection("service_prices").find({}).sort({ label: 1 }).toArray();
    return res.json({
      ok: true,
      services: services.map((item) => ({
        ...item,
        _id: String(item._id),
        costPerUnitUsd: Number(item.costPerUnitUsd || 0),
        unitPriceUsd: Number(item.unitPriceUsd || 0),
      })),
    });
  } catch (error) {
    console.error("admin-service-prices-error", error);
    return res.status(500).json({ error: "Could not fetch service prices" });
  }
});

app.put("/api/admin/service-prices/:key", requireAdmin, async (req, res) => {
  try {
    const key = String(req.params.key || "").trim();
    const unitPriceUsd = Number(req.body?.unitPriceUsd);
    const costPerUnitUsd = Number(req.body?.costPerUnitUsd);

    if (!key || !Number.isFinite(unitPriceUsd) || unitPriceUsd < 0 || !Number.isFinite(costPerUnitUsd) || costPerUnitUsd < 0) {
      return res.status(400).json({ error: "key, unitPriceUsd and costPerUnitUsd are required" });
    }

    const database = await getDb();
    const result = await database.collection("service_prices").findOneAndUpdate(
      { key },
      {
        $set: {
          unitPriceUsd,
          costPerUnitUsd,
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after" }
    );

    const updatedService = getUpdatedDocument(result);

    if (!updatedService) {
      return res.status(404).json({ error: "Service not found" });
    }

    return res.json({ ok: true, service: { ...updatedService, _id: String(updatedService._id) } });
  } catch (error) {
    console.error("admin-service-price-update-error", error);
    return res.status(500).json({ error: "Could not update service price" });
  }
});

app.get("/api/admin/overview", requireAdmin, async (_req, res) => {
  try {
    const database = await getDb();
    const now = new Date();
    const dayStart = startOfDay(now);
    const weekStart = startOfWeek(now);
    const monthStart = startOfMonth(now);

    const [ordersToday, ordersWeek, ordersMonth] = await Promise.all([
      database.collection("orders").countDocuments({ createdAt: { $gte: dayStart } }),
      database.collection("orders").countDocuments({ createdAt: { $gte: weekStart } }),
      database.collection("orders").countDocuments({ createdAt: { $gte: monthStart } }),
    ]);

    const [orderRevenueAgg, orderProfitAgg, topupRevenueAgg, topupFeeAgg] = await Promise.all([
      database.collection("orders").aggregate([{ $group: { _id: null, total: { $sum: { $toDouble: "$chargeUsd" } } } }]).toArray(),
      database
        .collection("orders")
        .aggregate([
          {
            $lookup: {
              from: "service_prices",
              localField: "service",
              foreignField: "label",
              as: "serviceCfg",
            },
          },
          {
            $addFields: {
              unitCost: { $ifNull: [{ $arrayElemAt: ["$serviceCfg.costPerUnitUsd", 0] }, 0] },
            },
          },
          {
            $addFields: {
              computedCost: {
                $multiply: [{ $toDouble: "$quantity" }, { $toDouble: "$unitCost" }],
              },
              computedCharge: { $toDouble: "$chargeUsd" },
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: { $subtract: ["$computedCharge", "$computedCost"] } },
            },
          },
        ])
        .toArray(),
      database
        .collection("wallet_transactions")
        .aggregate([
          { $match: { provider: "mercadopago", status: "approved" } },
          { $group: { _id: null, total: { $sum: { $toDouble: "$amountUsd" } } } },
        ])
        .toArray(),
      database
        .collection("wallet_transactions")
        .aggregate([
          { $match: { provider: "mercadopago", status: "approved" } },
          {
            $group: {
              _id: null,
              total: {
                $sum: {
                  $toDouble: {
                    $ifNull: ["$transactionFeeUsd", { $max: [{ $subtract: ["$amountUsd", "$creditedAmountUsd"] }, 0] }],
                  },
                },
              },
            },
          },
        ])
        .toArray(),
    ]);

    const totalOrdersRevenue = Number(orderRevenueAgg[0]?.total || 0);
    const totalOrdersProfit = Number(orderProfitAgg[0]?.total || 0);
    const totalTopupRevenue = Number(topupRevenueAgg[0]?.total || 0);
    const totalTopupFee = Number(topupFeeAgg[0]?.total || 0);
    const totalUtility = Number((totalOrdersProfit + totalTopupFee).toFixed(2));

    return res.json({
      ok: true,
      kpis: {
        ordersToday,
        ordersWeek,
        ordersMonth,
      },
      totals: {
        topupsRevenueUsd: Number(totalTopupRevenue.toFixed(2)),
        ordersRevenueUsd: Number(totalOrdersRevenue.toFixed(2)),
        ordersProfitUsd: Number(totalOrdersProfit.toFixed(2)),
        topupsFeeUsd: Number(totalTopupFee.toFixed(2)),
        totalUtilityUsd: totalUtility,
      },
    });
  } catch (error) {
    console.error("admin-overview-error", error);
    return res.status(500).json({ error: "Could not fetch overview" });
  }
});

app.get("/api/public/settings/exchange-rate", async (_req, res) => {
  try {
    const database = await getDb();
    const setting = await database.collection("app_settings").findOne({ key: "cop_per_usd" });
    const copPerUsd = Number(setting?.value || DEFAULT_COP_PER_USD);
    return res.json({ ok: true, copPerUsd });
  } catch (error) {
    console.error("exchange-rate-error", error);
    return res.status(500).json({ error: "Could not fetch exchange rate" });
  }
});

app.post("/api/payments/mercadopago/preference", async (req, res) => {
  try {
    if (!MERCADOPAGO_ACCESS_TOKEN) {
      return res.status(500).json({ error: "Missing MERCADOPAGO_ACCESS_TOKEN" });
    }

    const chargeAmountUsd = Number(req.body?.amountUsd || 0);
    const creditedAmountRaw = Number(req.body?.creditedAmountUsd);
    const transactionFeeRaw = Number(req.body?.transactionFeeUsd);
    const creditedAmountUsd =
      Number.isFinite(creditedAmountRaw) && creditedAmountRaw > 0 ? creditedAmountRaw : chargeAmountUsd;
    const transactionFeeUsd =
      Number.isFinite(transactionFeeRaw) && transactionFeeRaw >= 0
        ? transactionFeeRaw
        : Math.max(0, Number((chargeAmountUsd - creditedAmountUsd).toFixed(2)));
    const userId = String(req.body?.userId || "guest");
    const amountCop = Number(req.body?.amountCop || 0);

    if (!Number.isFinite(chargeAmountUsd) || chargeAmountUsd <= 0) {
      return res.status(400).json({ error: "amountUsd is required and must be > 0" });
    }

    const database = await getDb();
    const now = new Date();
    const txId = `mp_${Date.now()}`;

    await database.collection("wallet_transactions").insertOne({
      _id: txId,
      provider: "mercadopago",
      type: "topup",
      status: "pending",
      userId,
      amountUsd: chargeAmountUsd,
      creditedAmountUsd,
      transactionFeeUsd,
      amountCop: Number.isFinite(amountCop) ? amountCop : null,
      createdAt: now,
      updatedAt: now,
    });

    const webhookBase = resolveWebhookBaseUrl(req);
    const preferencePayload = {
      items: [
        {
          title: "PushGo Viral Balance Top-up",
          quantity: 1,
          currency_id: "USD",
          unit_price: chargeAmountUsd,
        },
      ],
      external_reference: txId,
      metadata: {
        txId,
        userId,
        amountUsd: chargeAmountUsd,
        chargeAmountUsd,
        creditedAmountUsd,
        transactionFeeUsd,
      },
      notification_url: `${webhookBase}/api/payments/mercadopago/webhook`,
      back_urls: {
        success: `${FRONTEND_BASE_URL}/add-funds.html?status=success`,
        pending: `${FRONTEND_BASE_URL}/add-funds.html?status=pending`,
        failure: `${FRONTEND_BASE_URL}/add-funds.html?status=failure`,
      },
      auto_return: "approved",
    };

    const mpResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(preferencePayload),
    });

    const mpData = await mpResponse.json().catch(() => null);
    if (!mpResponse.ok || !mpData) {
      console.error("mercadopago-preference-error", mpData || mpResponse.status);
      return res.status(502).json({ error: "Could not create Mercado Pago preference" });
    }

    await database.collection("wallet_transactions").updateOne(
      { _id: txId },
      {
        $set: {
          mpPreferenceId: mpData.id,
          initPoint: mpData.init_point || null,
          sandboxInitPoint: mpData.sandbox_init_point || null,
          updatedAt: new Date(),
        },
      }
    );

    return res.status(201).json({
      ok: true,
      txId,
      preferenceId: mpData.id,
      initPoint: mpData.init_point || null,
      sandboxInitPoint: mpData.sandbox_init_point || null,
      checkoutUrl: mpData.init_point || mpData.sandbox_init_point || null,
    });
  } catch (error) {
    console.error("mercadopago-preference-route-error", error);
    return res.status(500).json({ error: "Could not create Mercado Pago preference" });
  }
});

app.post("/api/payments/mercadopago/webhook", async (req, res) => {
  try {
    const database = await getDb();

    await database.collection("mp_webhooks").insertOne({
      body: req.body || {},
      query: req.query || {},
      headers: {
        "x-signature": req.get("x-signature") || null,
        "x-request-id": req.get("x-request-id") || null,
      },
      receivedAt: new Date(),
    });

    const action = String(req.body?.action || "");
    const maybePaymentId = req.body?.data?.id || req.query?.["data.id"] || req.query?.id;

    if (action === "payment.updated" && maybePaymentId && MERCADOPAGO_ACCESS_TOKEN) {
      const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${maybePaymentId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      });

      const paymentData = await paymentResponse.json().catch(() => null);
      if (paymentResponse.ok && paymentData) {
        const externalRef = String(paymentData.external_reference || paymentData.metadata?.txId || "");
        const paymentStatus = String(paymentData.status || "pending").toLowerCase();
        const metadataUserId = String(paymentData.metadata?.userId || "");
        const chargeAmountUsd = Number(paymentData.metadata?.chargeAmountUsd || paymentData.metadata?.amountUsd || 0);
        const amountUsd = Number(
          paymentData.metadata?.creditedAmountUsd || paymentData.metadata?.amountUsd || paymentData.transaction_amount || 0
        );

        if (externalRef) {
          const updateSet = {
            mpPaymentId: String(paymentData.id || maybePaymentId),
            status: paymentStatus,
            paymentPayload: paymentData,
            updatedAt: new Date(),
          };

          if (Number.isFinite(chargeAmountUsd) && chargeAmountUsd > 0) {
            updateSet.amountUsd = chargeAmountUsd;
          }
          if (Number.isFinite(amountUsd) && amountUsd > 0) {
            updateSet.creditedAmountUsd = amountUsd;
          }

          await database.collection("wallet_transactions").updateOne(
            { _id: externalRef },
            {
              $set: updateSet,
            }
          );

          if (paymentStatus === "approved" && metadataUserId && amountUsd > 0) {
            const tx = await database.collection("wallet_transactions").findOne({ _id: externalRef });
            if (!tx?.creditedAt) {
              await creditWalletBalance(database, metadataUserId, amountUsd);
              await database.collection("wallet_transactions").updateOne(
                { _id: externalRef },
                { $set: { creditedAt: new Date() } }
              );
            }
          }
        }
      }
    }

    return res.status(200).json({ ok: true, received: true });
  } catch (error) {
    console.error("mercadopago-webhook-error", error);
    return res.status(200).json({ ok: false, received: true });
  }
});

app.post("/api/orders/create", async (req, res) => {
  try {
    const {
      userId,
      service,
      platform = "Instagram",
      link,
      quantity,
      chargeUsd,
      status,
    } = req.body || {};

    if (!userId || !service || !link) {
      return res.status(400).json({ error: "userId, service and link are required" });
    }

    const qty = Number(quantity || 0);
    const charge = Number(chargeUsd || 0);

    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(charge) || charge < 0) {
      return res.status(400).json({ error: "quantity and chargeUsd are invalid" });
    }

    const now = new Date();
    const order = {
      userId: String(userId),
      orderNumber: String(Date.now()),
      service: String(service),
      platform: String(platform),
      description: `${String(service)} | ${String(platform)}`,
      link: String(link),
      quantity: qty,
      chargeUsd: charge,
      status: normalizeStatus(status),
      createdAt: now,
      updatedAt: now,
    };

    const database = await getDb();
    const result = await database.collection("orders").insertOne(order);

    try {
      const user = await database.collection("users").findOne({ _id: String(order.userId) });
      await sendTelegramOrderNotification({ order, user });
    } catch (notifyError) {
      console.error("telegram-order-notification-error", notifyError);
    }

    res.status(201).json({
      ok: true,
      order: {
        ...order,
        _id: String(result.insertedId),
      },
    });
  } catch (error) {
    console.error("create-order-error", error);
    res.status(500).json({ error: "Could not create order" });
  }
});

app.get("/api/orders/history", async (req, res) => {
  try {
    const userId = req.query?.userId;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const database = await getDb();
    const orders = await database
      .collection("orders")
      .find({ userId: String(userId) })
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();

    return res.json({
      ok: true,
      orders: orders.map((item) => ({
        ...item,
        _id: String(item._id),
      })),
    });
  } catch (error) {
    console.error("order-history-error", error);
    return res.status(500).json({ error: "Could not fetch order history" });
  }
});

app.listen(PORT, () => {
  console.log(`PushGo backend running on port ${PORT}`);
});
