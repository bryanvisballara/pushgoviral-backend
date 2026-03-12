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

## Run locally

```bash
npm install
npm start
```
