const { formatDateTime, renderEmailLayout, renderDetailsPanel } = require("./layout");

function renderRegistrationNotificationEmail({ user }) {
  const providerLabel = user.provider === "google" ? "Google OAuth" : "Email & Password";
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || "-";

  const bodyHtml = renderDetailsPanel([
    ["User ID", user.id || user._id],
    ["Full Name", fullName],
    ["Username", user.username],
    ["Email", user.email],
    ["Provider", providerLabel],
    ["Status", user.status || "active"],
    ["Registered At (UTC)", formatDateTime(user.createdAt)],
  ]);

  return renderEmailLayout({
    badgeLabel: "NEW ACCOUNT",
    badgeColor: "#00c2a8",
    accentColor: "#00c2a8",
    title: "New User Registration",
    subtitle: "A new client has completed registration on PushGo Viral.",
    bodyHtml,
  });
}

function renderOrderNotificationEmail({ order, user, serviceDisplayName }) {
  const userLabel = user
    ? [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || "-"
    : "Unknown";
  const chargeUsd = Number(order.chargeUsd || 0).toFixed(2);
  const fulfillment = order.providerOrderId
    ? `Auto (MarketFollowers #${order.providerOrderId})`
    : order.fulfillmentError
      ? `Manual required — ${order.fulfillmentError}`
      : "Manual";

  const bodyHtml = renderDetailsPanel([
    ["Order Number", order.orderNumber],
    ["User ID", order.userId],
    ["Customer", userLabel],
    ["Username", user?.username],
    ["Email", user?.email],
    ["Service", serviceDisplayName],
    ["Platform", order.platform],
    ["Target Link", order.link],
    ["Quantity", order.quantity],
    ["Charge (USD)", `$${chargeUsd}`],
    ["Status", order.status],
    ["Fulfillment", fulfillment],
    ["Created At (UTC)", formatDateTime(order.createdAt)],
  ]);

  return renderEmailLayout({
    badgeLabel: "NEW ORDER",
    badgeColor: "#3ec2ff",
    accentColor: "#3ec2ff",
    title: `Order #${order.orderNumber}`,
    subtitle: "A new order has been placed and the wallet has been debited.",
    bodyHtml,
  });
}

module.exports = {
  renderRegistrationNotificationEmail,
  renderOrderNotificationEmail,
};
