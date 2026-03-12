const express = require("express");
const cors = require("cors");
const { MongoClient } = require("mongodb");

require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT || 3000);
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || "pushgo_viral";
const DEFAULT_COP_PER_USD = Number(process.env.DEFAULT_COP_PER_USD || 4100);
const MERCADOPAGO_ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN || "";
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || "https://pushgoviral.com";

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
  }
  return db;
}

function normalizeStatus(input) {
  const value = String(input || "pending").toLowerCase();
  const allowed = new Set(["pending", "in_progress", "completed", "canceled"]);
  return allowed.has(value) ? value : "pending";
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
