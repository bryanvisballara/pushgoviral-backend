import fs from "node:fs";
import process from "node:process";
import { MongoClient } from "mongodb";

function parseEnvFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return Object.fromEntries(
      raw
        .split(/\r?\n/)
        .filter((line) => line && !line.trim().startsWith("#") && line.includes("="))
        .map((line) => {
          const idx = line.indexOf("=");
          return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
        })
    );
  } catch {
    return {};
  }
}

function getArg(name) {
  const found = process.argv.find((arg) => arg.startsWith(`${name}=`));
  return found ? found.slice(name.length + 1) : "";
}

const fileEnv = parseEnvFile(new URL("../../.env", import.meta.url));
const env = { ...fileEnv, ...process.env };
const txId = getArg("--tx");

if (!txId) {
  console.error("Usage: node scripts/repair-topup-credit.mjs --tx=<wallet_transaction_id>");
  process.exit(1);
}

const template = env.MONGODB_URI || env.MONGODB_URI_TEMPLATE || "";
const user = encodeURIComponent(env.MONGODB_DB_USER || "");
const pass = encodeURIComponent(env.MONGODB_DB_PASSWORD || "");
const uri = template.replace("<db_username>", user).replace("<db_password>", pass);

if (!uri) {
  console.error("Missing MongoDB URI configuration.");
  process.exit(1);
}

const dbName = env.MONGODB_DB_NAME || "pushgo_viral";
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });

try {
  await client.connect();
  const db = client.db(dbName);

  const tx = await db.collection("wallet_transactions").findOne({ _id: txId });
  if (!tx) {
    console.error(`Transaction not found: ${txId}`);
    process.exit(1);
  }

  const metadata = tx.paymentPayload?.metadata || {};
  const resolvedUserId = String(metadata.userId || metadata.user_id || tx.userId || "");
  const resolvedAmountUsd = Number(
    metadata.creditedAmountUsd || metadata.credited_amount_usd || tx.creditedAmountUsd || 0
  );

  if (!resolvedUserId || !Number.isFinite(resolvedAmountUsd) || resolvedAmountUsd <= 0) {
    console.error("Cannot repair transaction due to missing userId or amount.", {
      resolvedUserId,
      resolvedAmountUsd,
    });
    process.exit(1);
  }

  if (!tx.creditedAt) {
    await db.collection("wallets").updateOne(
      { userId: resolvedUserId },
      {
        $setOnInsert: { userId: resolvedUserId, currency: "USD" },
        $inc: { balance: resolvedAmountUsd },
        $set: { updatedAt: new Date() },
      },
      { upsert: true }
    );
  }

  await db.collection("wallet_transactions").updateOne(
    { _id: txId },
    {
      $set: {
        userId: resolvedUserId,
        creditedAmountUsd: resolvedAmountUsd,
        creditedAt: tx.creditedAt || new Date(),
        updatedAt: new Date(),
      },
    }
  );

  const wallet = await db.collection("wallets").findOne({ userId: resolvedUserId });
  const updatedTx = await db.collection("wallet_transactions").findOne(
    { _id: txId },
    { projection: { _id: 1, status: 1, userId: 1, creditedAmountUsd: 1, creditedAt: 1 } }
  );

  console.log(
    JSON.stringify(
      {
        repaired: true,
        tx: updatedTx,
        walletBalanceUsd: Number(wallet?.balance || 0),
      },
      null,
      2
    )
  );
} catch (error) {
  console.error("Repair failed:", error?.message || error);
  process.exit(1);
} finally {
  await client.close();
}
