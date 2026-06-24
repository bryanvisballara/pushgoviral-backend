const { normalizeOrderLink } = require("./link-normalizer");

const WELCOME_BONUS_USD = 1;

function getUpdatedDocument(result) {
  if (!result) {
    return null;
  }
  return result.value ?? result;
}

async function grantWelcomeBonus(database, userId) {
  const safeUserId = String(userId || "").trim();
  if (!safeUserId) {
    return false;
  }

  const user = await database.collection("users").findOne({ _id: safeUserId });
  if (!user || user.welcomeBonusGranted) {
    return false;
  }

  const now = new Date();
  await database.collection("wallets").updateOne(
    { userId: safeUserId },
    {
      $setOnInsert: { userId: safeUserId, currency: "USD" },
      $inc: {
        balance: WELCOME_BONUS_USD,
        welcomeBonusBalance: WELCOME_BONUS_USD,
      },
      $set: { updatedAt: now },
    },
    { upsert: true }
  );

  await database.collection("users").updateOne(
    { _id: safeUserId },
    {
      $set: {
        welcomeBonusGranted: true,
        updatedAt: now,
      },
    }
  );

  await database
    .collection("wallet_transactions")
    .updateOne(
      { _id: `welcome_${safeUserId}` },
      {
        $setOnInsert: {
          _id: `welcome_${safeUserId}`,
          provider: "internal",
          type: "welcome_bonus",
          status: "completed",
          userId: safeUserId,
          amountUsd: WELCOME_BONUS_USD,
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true }
    )
    .catch(() => {});

  return true;
}

async function getWalletSnapshot(database, userId) {
  const wallet = await database.collection("wallets").findOne({ userId: String(userId) });
  return {
    balance: Number(wallet?.balance || 0),
    welcomeBonusBalance: Number(wallet?.welcomeBonusBalance || 0),
  };
}

function getWelcomeBonusUsageAmount(wallet, chargeUsd) {
  const welcomeBonusBalance = Number(wallet?.welcomeBonusBalance || 0);
  const charge = Number(chargeUsd || 0);
  if (!Number.isFinite(welcomeBonusBalance) || welcomeBonusBalance <= 0) {
    return 0;
  }
  if (!Number.isFinite(charge) || charge <= 0) {
    return 0;
  }
  return Math.min(welcomeBonusBalance, charge);
}

async function evaluateWelcomeBonusAntifraud(database, { userId, link, platform, chargeUsd }) {
  const wallet = await getWalletSnapshot(database, userId);
  const welcomeBonusUsed = getWelcomeBonusUsageAmount(wallet, chargeUsd);

  if (welcomeBonusUsed <= 0) {
    return { blocked: false, welcomeBonusUsed: 0, normalized: null };
  }

  const normalized = normalizeOrderLink(link, platform);
  if (!normalized?.platform || !normalized?.normalizedTarget) {
    return { blocked: false, welcomeBonusUsed, normalized: null };
  }

  const previousBonus = await database.collection("welcome_bonus_targets").findOne({
    platform: normalized.platform,
    normalizedTarget: normalized.normalizedTarget,
    usedWelcomeBonus: true,
  });

  if (!previousBonus) {
    return { blocked: false, welcomeBonusUsed, normalized };
  }

  return {
    blocked: true,
    reason: "TARGET_ALREADY_RECEIVED_WELCOME_BONUS",
    welcomeBonusUsed,
    normalized,
    matchedRecord: previousBonus,
  };
}

async function logWelcomeBonusFraudAttempt(database, payload) {
  const now = new Date();
  const attemptId = `fraud_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  await database.collection("welcome_bonus_fraud_attempts").insertOne({
    _id: attemptId,
    userId: String(payload.userId || ""),
    userEmail: String(payload.userEmail || ""),
    userUsername: String(payload.userUsername || ""),
    link: String(payload.link || ""),
    platform: String(payload.platform || ""),
    normalizedTarget: String(payload.normalizedTarget || ""),
    service: String(payload.service || ""),
    chargeUsd: Number(payload.chargeUsd || 0),
    reason: String(payload.reason || "TARGET_ALREADY_RECEIVED_WELCOME_BONUS"),
    matchedUserId: String(payload.matchedUserId || ""),
    matchedOrderId: String(payload.matchedOrderId || ""),
    reviewStatus: "pending_review",
    createdAt: now,
    updatedAt: now,
  });

  return attemptId;
}

async function recordWelcomeBonusTarget(database, payload) {
  const now = new Date();
  await database.collection("welcome_bonus_targets").insertOne({
    platform: String(payload.platform || ""),
    normalizedTarget: String(payload.normalizedTarget || ""),
    usedWelcomeBonus: true,
    orderId: String(payload.orderId || ""),
    userId: String(payload.userId || ""),
    link: String(payload.link || ""),
    createdAt: now,
  });
}

async function debitWalletForOrder(database, userId, amountUsd) {
  const numericAmount = Number(amountUsd || 0);
  if (!userId || !Number.isFinite(numericAmount) || numericAmount <= 0) {
    return null;
  }

  const wallet = await database.collection("wallets").findOne({ userId: String(userId) });
  const welcomeBonusUsed = getWelcomeBonusUsageAmount(wallet, numericAmount);

  const update = {
    $inc: {
      balance: -numericAmount,
    },
    $set: { updatedAt: new Date() },
  };

  if (welcomeBonusUsed > 0) {
    update.$inc.welcomeBonusBalance = -welcomeBonusUsed;
  }

  const result = await database.collection("wallets").findOneAndUpdate(
    {
      userId: String(userId),
      balance: { $gte: numericAmount },
      ...(welcomeBonusUsed > 0 ? { welcomeBonusBalance: { $gte: welcomeBonusUsed } } : {}),
    },
    update,
    { returnDocument: "after" }
  );

  const updatedWallet = getUpdatedDocument(result);
  if (!updatedWallet) {
    return null;
  }

  return {
    wallet: updatedWallet,
    welcomeBonusUsed,
  };
}

async function refundWalletDebit(database, userId, amountUsd, welcomeBonusUsed = 0) {
  const numericAmount = Number(amountUsd || 0);
  const bonusRefund = Number(welcomeBonusUsed || 0);
  if (!userId || !Number.isFinite(numericAmount) || numericAmount <= 0) {
    return;
  }

  const update = {
    $inc: { balance: numericAmount },
    $set: { updatedAt: new Date() },
  };

  if (bonusRefund > 0) {
    update.$inc.welcomeBonusBalance = bonusRefund;
  }

  await database.collection("wallets").updateOne({ userId: String(userId) }, update);
}

module.exports = {
  WELCOME_BONUS_USD,
  grantWelcomeBonus,
  evaluateWelcomeBonusAntifraud,
  logWelcomeBonusFraudAttempt,
  recordWelcomeBonusTarget,
  debitWalletForOrder,
  refundWalletDebit,
  normalizeOrderLink,
};
