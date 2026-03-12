const { MongoClient } = require("mongodb");
require("dotenv").config();

function buildMongoUri() {
  if (process.env.MONGODB_URI) {
    return process.env.MONGODB_URI;
  }

  const template = process.env.MONGODB_URI_TEMPLATE || "";
  const dbUser = process.env.MONGODB_DB_USER || "";
  const dbPassword = process.env.MONGODB_DB_PASSWORD || "";

  if (!template) {
    return "";
  }

  return template
    .replace("<db_username>", encodeURIComponent(dbUser))
    .replace("<db_password>", encodeURIComponent(dbPassword));
}

async function run() {
  const uri = buildMongoUri();
  if (!uri) {
    throw new Error("Missing Mongo configuration");
  }

  const dbName = process.env.MONGODB_DB_NAME || "pushgo_viral";
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });

  await client.connect();
  const db = client.db(dbName);
  const now = new Date();

  const adminSeed = {
    _id: "admin_1",
    username: "admin",
    email: "admin@pushgo.com",
    password: "AdminPushGo2026!",
    role: "super_admin",
    displayName: "PushGo Admin",
    status: "active",
    createdAt: now,
    updatedAt: now,
  };

  await db.collection("admin_users").updateOne(
    { _id: adminSeed._id },
    {
      $set: {
        username: adminSeed.username,
        email: adminSeed.email,
        password: adminSeed.password,
        role: adminSeed.role,
        displayName: adminSeed.displayName,
        status: adminSeed.status,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );

  await db.collection("admin_users").createIndex({ username: 1 }, { unique: true });
  await db.collection("admin_users").createIndex({ email: 1 }, { unique: true });

  const services = await db.collection("service_prices").find({}).toArray();
  for (const service of services) {
    const current = Number(service.unitPriceUsd || 0);
    const suggestedCost = Number((current * 0.55).toFixed(6));
    await db.collection("service_prices").updateOne(
      { _id: service._id },
      {
        $set: {
          costPerUnitUsd: Number(service.costPerUnitUsd ?? suggestedCost),
          updatedAt: now,
        },
      }
    );
  }

  await client.close();

  console.log("Admin seed ready:");
  console.log("username: admin");
  console.log("email: admin@pushgo.com");
  console.log("password: AdminPushGo2026!");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
