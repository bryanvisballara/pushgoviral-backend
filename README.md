# PushGo Viral Backend

Minimal Express + MongoDB backend for PushGo Viral order flow.

## Required environment variables

- `MONGODB_URI` (recommended)
- OR `MONGODB_URI_TEMPLATE` + `MONGODB_DB_USER` + `MONGODB_DB_PASSWORD`
- `MONGODB_DB_NAME` (optional, defaults to `pushgo_viral`)
- `PORT` (optional)
- `BREVO_API_KEY` (required for email verification / password reset codes)
- `BREVO_SENDER_EMAIL` (verified sender in Brevo)
- `BREVO_SENDER_NAME` (optional, defaults to `PushGo Viral`)
- `NOTIFICATIONS_EMAIL` (optional, defaults to `notifications@pushgoviral.com`)
- `ACCOUNTS_SENDER_EMAIL` (optional, defaults to `accounts@pushgoviral.com`)
- `ACCOUNTS_SENDER_NAME` (optional, defaults to `PushGo Viral Accounts`)
- `ORDERS_SENDER_EMAIL` (optional, defaults to `orders@pushgoviral.com`)
- `ORDERS_SENDER_NAME` (optional, defaults to `PushGo Viral Orders`)
- `FRONTEND_BASE_URL` (optional, defaults to `https://pushgoviral.com`)
- `AUTH_CODE_EXPIRES_MINUTES` (optional, defaults to `10`)
- `AUTH_CODE_MAX_ATTEMPTS` (optional, defaults to `5`)
- `AUTH_CODE_RESEND_COOLDOWN_SECONDS` (optional, defaults to `60`)
- `TELEGRAM_BOT_TOKEN` (optional, enables order notifications)
- `TELEGRAM_CHAT_ID` (required to receive Telegram order notifications)
- `TELEGRAM_THREAD_ID` (optional, for Telegram topics)

## MarketFollowers auto-fulfillment

- `MARKETFOLLOWERS_API_KEY` (optional until you are ready to go live)
- `MARKETFOLLOWERS_API_URL` (optional, defaults to `https://marketfollowers.com/api/v2`)
- `PROVIDER_SYNC_INTERVAL_MS` (optional, defaults to `120000`)

When a service quality row has **Auto** enabled and a provider service id saved in admin, new customer orders are sent to MarketFollowers automatically after wallet debit. Order statuses sync from the provider on a background interval.

## Endpoints

- `GET /health`
- `POST /api/orders/create`
- `GET /api/orders/history?userId=u1`
- `GET /api/public/settings/exchange-rate`
- `POST /api/payments/mercadopago/preference`
- `POST /api/payments/mercadopago/webhook`

## Auth Email Code Endpoints

- `POST /api/auth/login`
- `POST /api/auth/email-verification/request`
- `POST /api/auth/register/verify`
- `POST /api/auth/password-reset/request`
- `POST /api/auth/password-reset/confirm`

## Admin API

- `POST /api/admin/login`
- `POST /api/admin/logout`
- `GET /api/admin/me`
- `GET /api/admin/users`
- `GET /api/admin/orders?status=pending|completed|all`
- `PATCH /api/admin/orders/:id/complete`
- `GET /api/admin/service-prices`
- `POST /api/admin/service-prices`
- `PUT /api/admin/service-prices/:key`
- `DELETE /api/admin/service-prices/:key`
- `GET /api/admin/catalog-options?category=instagram`
- `PUT /api/admin/catalog-options/:category`
- `GET /api/public/service-categories`
- `GET /api/public/service-prices`
- `GET /api/admin/overview`
- `GET /api/admin/providers/marketfollowers/status`
- `GET /api/admin/providers/marketfollowers/balance`
- `GET /api/admin/providers/marketfollowers/services`
- `POST /api/admin/providers/marketfollowers/sync-orders`

## MongoDB collections

- `service_prices` — each quality variant is one document (`category`, `serviceType`, `qualityTier`, pricing, alerts, details, notes, optional `providerServiceId` + `autoFulfillment`)
- `catalog_options` — per-platform service type and quality tier catalogs (`category`, `serviceTypes[]`, `qualityTiers[]`)
- `orders`, `users`, `wallets`, `wallet_transactions`, `admin_users`, `email_codes`, `mp_webhooks`, `app_settings`

On startup the API creates indexes and backfills missing `category`, `serviceType`, `qualityTier`, and `catalog_options` data from existing services.

Manual catalog sync:

```bash
npm run sync:catalog
```

## Admin Seed

Run this once to create/update the administrative user and default service costs:

```bash
npm run seed:admin
```

Seeded admin credentials:

- username: `admin`
- email: `admin@pushgo.com`
- password: `AdminPushGo2026!`

## Mercado Pago webhook test URL

Use this exact URL in Mercado Pago notifications:

`https://pushgoviral-backend.onrender.com/api/payments/mercadopago/webhook`

Do not use only the domain root (`https://pushgoviral-backend.onrender.com`) for webhook tests.

## Run locally

```bash
npm install
npm start
```
