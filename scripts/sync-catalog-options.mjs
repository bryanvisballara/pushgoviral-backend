import { MongoClient } from "mongodb";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { backfillCatalogOptions } = require("../catalog-options.js");

function buildMongoUri() {
  if (process.env.MONGODB_URI) {
    return process.env.MONGODB_URI;
  }

  const template = process.env.MONGODB_URI_TEMPLATE;
  if (!template) {
    return "";
  }

  return template
    .replace("<db_username>", encodeURIComponent(process.env.MONGODB_DB_USER || ""))
    .replace("<db_password>", encodeURIComponent(process.env.MONGODB_DB_PASSWORD || ""));
}

const uri = buildMongoUri();
const dbName = process.env.MONGODB_DB_NAME || "pushgo_viral";

if (!uri) {
  console.error("Missing Mongo config. Set MONGODB_URI or MONGODB_URI_TEMPLATE (+ credentials).");
  process.exit(1);
}

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });

try {
  await client.connect();
  const db = client.db(dbName);
  const result = await backfillCatalogOptions(db);
  console.log(`Synced catalog_options for ${result.categoriesProcessed} categories.`);
} catch (error) {
  console.error("sync-catalog-options-failed", error);
  process.exitCode = 1;
} finally {
  await client.close();
}
