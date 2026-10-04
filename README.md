# ENGINEX Engineering Marketplace — Render Ready

Full-stack engineering jobs marketplace with engineer, employer, and administrator roles.

## One-click Render deployment

1. Put this project in a GitHub repository (the `render.yaml` file must be at repository root).
2. In Render choose **New → Blueprint** and select the repository.
3. Click **Apply**. The Blueprint creates the Node web service and PostgreSQL database and connects `DATABASE_URL` automatically.
4. Open the generated `*.onrender.com` URL.

Render supports Blueprints through `render.yaml`, including wiring a web service to a Postgres connection string. The included configuration uses the free plans for testing. Free Render web services can spin down after 15 minutes idle, and free Postgres databases expire after 30 days, so upgrade the database before using this for permanent production data.

## Admin

Initial administrator:
- Email: `admin@enginex.com`
- Password: `Admin@123`

Change the admin password in production. The password is only used to seed the first administrator; the app stores a hash rather than the plain password.

## Local run

Requires Node.js 20+.

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## Included platform capabilities

- Public engineering vacancy search
- Engineer registration/login
- Employer registration/login
- Vacancy submission and admin moderation
- Engineer applications
- Employer application status workflow
- Engineer/employer profiles
- Messaging API
- Administrator dashboard
- User activation/suspension
- Job approval/rejection/closure
- Audit log
- Persistent PostgreSQL state on Render
- Health endpoint: `/api/health`
