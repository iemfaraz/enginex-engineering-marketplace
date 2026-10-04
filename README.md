# ENGINEX Engineering Marketplace

Production-ready Node.js/PostgreSQL marketplace for engineering services, projects, jobs and professional profiles.

## Deployment

The repository includes a Render Blueprint in `render.yaml`.

1. Open Render.
2. Create **New → Blueprint**.
3. Select `iemfaraz/enginex-engineering-marketplace`.
4. Apply the Blueprint.
5. Set the secret environment variables:
   - `ADMIN_EMAIL`
   - `ADMIN_PASSWORD`
6. For production billing, configure the bank variables:
   - `BANK_NAME`
   - `BANK_ACCOUNT`
   - `BANK_IBAN`
7. Keep `DATABASE_URL` managed by Render.

## Important production settings

Do not use a default administrator password. The administrator is seeded only when both `ADMIN_EMAIL` and `ADMIN_PASSWORD` are supplied.

For permanent production data, use a paid/persistent PostgreSQL plan rather than a free trial database.

## Current marketplace capabilities

- Engineer and employer registration/login
- Public service/project/job marketplace
- Service packages and project requests
- Applications and proposals
- Messaging
- Engineer/employer profiles
- Support tickets and support chat
- Admin moderation
- User activation/suspension
- Audit logging
- Billing and bank-transfer orders
- Admin payment approval/rejection
- Persistent PostgreSQL state
- Render health endpoint: `/api/health`

## Local development

Requires Node.js 20+.

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## Production checklist

Before inviting real customers:

- Configure a strong admin secret.
- Configure business bank details in Render environment variables.
- Upgrade PostgreSQL for persistent production data.
- Configure a real payment gateway only after testing its webhook flow.
- Connect a custom domain and HTTPS.
- Test registration, service posting, proposals, orders, messaging and admin moderation.
