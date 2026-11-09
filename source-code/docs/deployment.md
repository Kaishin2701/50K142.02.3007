# Supabase, Render and SePay

This configuration is prepared for a school demonstration. No external database, deployment, bank connection or subscription has been created. Keep the entire application inside the repository's `source-code/` directory; do not move or modify interview/design documents.

## Supabase PostgreSQL

1. Create a dedicated Supabase project. Choose a nearby region and save the database password privately.
2. Copy the PostgreSQL **session pooler** connection string from Connect for an IPv4-compatible persistent Node server. Use the database owner/server connection; the browser never receives this URL or a service-role key.
3. Copy `backend/.env.example` to `backend/.env`. Fill `DATABASE_URL`, keeping `PG_SSL=true`. URL-encode special characters in the password. Use the same environment values on Render later.
4. From `backend/`, run `npm run migrate` to apply tracked migrations and server-only RLS policies. Then fill the `ADMIN_*` values in `.env` and run `npm run seed` once. Bootstrap refuses to replace existing managers. Remove the bootstrap password from local configuration after creating the account.
5. Add actual employees, menu items, recipe definitions, ingredients, stock receipts and shift assignments using the protected APIs documented in `backend-api.md` and available UI. Local fictional demo data is never uploaded automatically.

Supabase Free projects may pause after a week of low activity. Check the project before presenting. Official guidance: https://supabase.com/docs/guides/platform/free-project-pausing and https://supabase.com/docs/guides/database/connecting-to-postgres .

## Render: one web service

Serving frontend and API from the same domain keeps session cookies straightforward.

1. After the source has been pushed, connect `Kaishin2701/50K142.02.3007` in Render and use Blueprint path `source-code/render.yaml`. This selects only `source-code/` as the application root.
2. Supply `DATABASE_URL` and `FRONTEND_ORIGINS`. The latter must be the exact public HTTPS origin, e.g. `https://me-ca-phe.onrender.com`, without a trailing slash. Replace the example with the hostname actually assigned to the service.
3. The build installs development dependencies explicitly and builds both projects. Start applies checksum-checked migrations, then serves the application. Port comes from Render; host is `0.0.0.0`. Production uses Secure/HttpOnly session cookies and one trusted proxy hop.
4. Verify `/api/health`, login, both roles, cash sale, receipt export and manager revenue using the deployed database before presenting. Review Render logs on startup failure; never paste connection URLs into logs or chat.

Render Free spins down after 15 minutes idle and has no persistent disk. The first request can be slow; keep all durable business data in Supabase. This plan is suitable for a demo; use an appropriate paid service for a real shop that needs continuous availability, especially payment callbacks.

Official guidance: https://render.com/docs/free and https://render.com/docs/blueprint-spec .

## SePay QR

First use SePay's sandbox/test mode. The account owner must link the bank account and approve the provider's terms before live use.

Set these server-only environment values:

```dotenv
QR_PROVIDER=sepay
SEPAY_BANK=<bank short code supported by vietqr.app>
SEPAY_ACCOUNT_NUMBER=<receiving bank account number>
SEPAY_WEBHOOK_API_KEY=<private webhook authentication key>
```

Create the webhook in SePay with URL `https://<actual-app-host>/api/payments/sepay/webhook`, JSON body and API-key authentication. SePay must send `Authorization: Apikey <SEPAY_WEBHOOK_API_KEY>`. Use the same key in the service configuration.

The QR contains an alphanumeric `ME` reference unique to the payment, the receiving account and the order amount. Preserve that full reference in the transfer content. The backend matches references case-insensitively, verifies the configured receiving account, ignores outgoing transfers and deduplicates transaction IDs. The endpoint responds with exactly `{"success":true}` after accepting a valid event. Webhook receipt alone does not complete payment: the employee's existing reconciliation action verifies successful receipt and sufficient funds before stock/revenue is updated.

Before live use, verify invalid authorization is rejected, wrong account/outgoing transfers are ignored, short payments cannot reconcile, retries cannot charge stock twice and unmatched transfers appear in manager notifications. A second distinct short transfer is not automatically summed; reconcile such payments with the bank/provider manually.

Without configuration, keep `QR_PROVIDER=disabled`. Cash works; attempting QR returns a configuration error instead of displaying a fictional payable code. Never simulate a successful live bank transfer.

Official payload and QR guidance: https://developer.sepay.vn/en/sepay-webhooks/tich-hop-webhook and https://developer.sepay.vn/vi/sepay-webhooks/tao-qr-va-form-thanh-toan .

## Verification limits

Automated tests cover backend rules, HTTP contracts, local restart persistence, SePay callback scenarios and selected frontend DOM flows. Full visual comparison in a supported browser and real Supabase/Render/SePay acceptance tests remain outstanding. No claim of complete pixel-level or live-payment verification is made.
