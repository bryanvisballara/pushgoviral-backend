# PushGo Viral Backend

Minimal Express + MongoDB backend for PushGo Viral order flow.

## Required environment variables

- `MONGODB_URI` (recommended)
- OR `MONGODB_URI_TEMPLATE` + `MONGODB_DB_USER` + `MONGODB_DB_PASSWORD`
- `MONGODB_DB_NAME` (optional, defaults to `pushgo_viral`)
- `PORT` (optional)

## Endpoints

- `GET /health`
- `POST /api/orders/create`
- `GET /api/orders/history?userId=u1`
- `GET /api/public/settings/exchange-rate`
- `POST /api/payments/mercadopago/preference`
- `POST /api/payments/mercadopago/webhook`

## Mercado Pago webhook test URL

Use this exact URL in Mercado Pago notifications:

`https://pushgoviral-backend.onrender.com/api/payments/mercadopago/webhook`

Do not use only the domain root (`https://pushgoviral-backend.onrender.com`) for webhook tests.

## Run locally

```bash
npm install
npm start
```
