import { createRequire } from "module";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";

const require = createRequire(import.meta.url);
const { buildServicePriceIndex, calculateOrderPeriodMetrics } = require("../order-metrics.js");

dotenv.config();

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

  return template
    .replace("<db_username>", encodeURIComponent(dbUser || ""))
    .replace("<db_password>", encodeURIComponent(dbPassword || ""));
}

const uri = buildMongoUri();
if (!uri) {
  console.error("Missing MONGODB_URI");
  process.exit(1);
}

const client = await MongoClient.connect(uri);
const db = client.db(process.env.MONGODB_DB_NAME || "pushgo_viral");

const monthStart = (() => {
  const now = new Date();
  const ymd = now.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
  const [year, month] = ymd.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1, 5, 0, 0, 0));
})();

const orders = await db
  .collection("orders")
  .find({ status: { $ne: "canceled" }, createdAt: { $gte: monthStart } })
  .sort({ createdAt: -1 })
  .toArray();

const services = await db.collection("service_prices").find({ isActive: { $ne: false } }).toArray();
const index = buildServicePriceIndex(services);
const metrics = calculateOrderPeriodMetrics(orders, index);

console.log(`\nOrders this month: ${orders.length}`);
console.log(`Revenue: $${metrics.revenue.toFixed(2)}`);
console.log(`Profit: $${metrics.profit.toFixed(2)} (${((metrics.profit / metrics.revenue) * 100 || 0).toFixed(1)}%)`);
console.log(`Matched: ${metrics.matchedOrders} | Unmatched: ${metrics.unmatchedOrders}`);

await client.close();
