const {
  isMarketFollowersConfigured,
  addOrder,
  getOrderStatus,
  mapProviderStatusToPushGo,
} = require("./marketfollowers");

function shouldAutoFulfill(serviceConfig) {
  return Boolean(
    serviceConfig?.autoFulfillment
    && serviceConfig?.providerServiceId
    && String(serviceConfig?.provider || "marketfollowers").toLowerCase() === "marketfollowers"
  );
}

async function tryFulfillOrder(database, orderId, order, serviceConfig) {
  if (!shouldAutoFulfill(serviceConfig)) {
    return { fulfilled: false, reason: "manual" };
  }

  if (!isMarketFollowersConfigured()) {
    await database.collection("orders").updateOne(
      { _id: orderId },
      {
        $set: {
          fulfillmentProvider: "marketfollowers",
          fulfillmentMode: "auto",
          fulfillmentError: "MarketFollowers API key is not configured on the server",
          updatedAt: new Date(),
        },
      }
    );
    return { fulfilled: false, reason: "not_configured" };
  }

  try {
    const result = await addOrder({
      serviceId: serviceConfig.providerServiceId,
      link: order.link,
      quantity: order.quantity,
    });

    await database.collection("orders").updateOne(
      { _id: orderId },
      {
        $set: {
          fulfillmentProvider: "marketfollowers",
          fulfillmentMode: "auto",
          providerServiceId: Number(serviceConfig.providerServiceId),
          providerServiceName: String(serviceConfig.providerServiceName || ""),
          providerOrderId: String(result.order),
          providerStatus: "Pending",
          status: "in_progress",
          fulfillmentError: "",
          fulfilledAt: new Date(),
          updatedAt: new Date(),
        },
      }
    );

    return {
      fulfilled: true,
      providerOrderId: String(result.order),
    };
  } catch (error) {
    const message = String(error?.message || error || "Unknown fulfillment error");
    await database.collection("orders").updateOne(
      { _id: orderId },
      {
        $set: {
          fulfillmentProvider: "marketfollowers",
          fulfillmentMode: "auto",
          fulfillmentError: message,
          updatedAt: new Date(),
        },
      }
    );
    return { fulfilled: false, reason: "api_error", error: message };
  }
}

async function syncProviderOrderStatuses(database) {
  if (!isMarketFollowersConfigured()) {
    return { scanned: 0, updated: 0 };
  }

  const openOrders = await database
    .collection("orders")
    .find({
      fulfillmentProvider: "marketfollowers",
      providerOrderId: { $exists: true, $ne: "" },
      status: { $in: ["pending", "in_progress"] },
    })
    .limit(100)
    .toArray();

  let updated = 0;

  for (const order of openOrders) {
    try {
      const statusPayload = await getOrderStatus(order.providerOrderId);
      const providerStatus = String(statusPayload?.status || "").trim() || "Pending";
      const nextStatus = mapProviderStatusToPushGo(providerStatus);
      const providerChargeUsd = Number(statusPayload?.charge || 0);
      const remains = Number(statusPayload?.remains || 0);
      const startCount = Number(statusPayload?.start_count || 0);

      const patch = {
        providerStatus,
        status: nextStatus,
        providerRemains: Number.isFinite(remains) ? remains : null,
        providerStartCount: Number.isFinite(startCount) ? startCount : null,
        providerSyncedAt: new Date(),
        updatedAt: new Date(),
      };

      if (Number.isFinite(providerChargeUsd) && providerChargeUsd >= 0) {
        patch.providerChargeUsd = providerChargeUsd;
      }

      const result = await database.collection("orders").updateOne(
        { _id: order._id },
        { $set: patch }
      );

      if (result.modifiedCount > 0) {
        updated += 1;
      }
    } catch (error) {
      await database.collection("orders").updateOne(
        { _id: order._id },
        {
          $set: {
            providerSyncError: String(error?.message || error || "Sync failed"),
            providerSyncedAt: new Date(),
            updatedAt: new Date(),
          },
        }
      );
    }
  }

  return { scanned: openOrders.length, updated };
}

module.exports = {
  shouldAutoFulfill,
  tryFulfillOrder,
  syncProviderOrderStatuses,
};
