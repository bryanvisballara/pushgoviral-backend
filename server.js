const express = require("express");
const cors = require("cors");
const { MongoClient } = require("mongodb");

require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT || 3000);
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || "pushgo_viral";

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

app.get("/health", (_req, res) => {
  res.json({ ok: true });
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
