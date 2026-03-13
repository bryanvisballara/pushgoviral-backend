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
- `FRONTEND_BASE_URL` (optional, defaults to `https://pushgoviral.com`)
- `AUTH_CODE_EXPIRES_MINUTES` (optional, defaults to `10`)
- `AUTH_CODE_MAX_ATTEMPTS` (optional, defaults to `5`)
- `AUTH_CODE_RESEND_COOLDOWN_SECONDS` (optional, defaults to `60`)
- `TELEGRAM_BOT_TOKEN` (optional, enables order notifications)
- `TELEGRAM_CHAT_ID` (required to receive Telegram order notifications)
- `TELEGRAM_THREAD_ID` (optional, for Telegram topics)

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
- `PUT /api/admin/service-prices/:key`
- `GET /api/admin/overview`

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
