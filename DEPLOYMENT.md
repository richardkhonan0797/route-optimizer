# Deploy Rute Antar to Vercel

This guide deploys the Next.js app to Vercel and stores data in a separate hosted PostgreSQL database. Commands use PowerShell from the repository root and Node.js 24.

## Free-tier eligibility

Vercel Hobby is for personal, non-commercial use. Use it for a personal demo; operating this application for business deliveries requires a paid Vercel plan. Database hosting and the routing API have their own plans and quotas; a free Vercel account does not make those services unlimited or free.

See the [Hobby plan terms](https://vercel.com/docs/plans/hobby). Platform references were checked on October 31, 2026; confirm current limits before deployment.

## 1. Prepare the repository and database

1. Push the project, including `package-lock.json` and `prisma/migrations`, to a personal GitHub repository. Do not commit `.env` or credentials; the repository already ignores `.env`.
2. Create a hosted PostgreSQL database and save its connection details privately. Vercel cannot reach the `localhost` database in `.env.example` and does not run the Docker Compose database.
3. Ensure the database supports `pg_trgm`. The initial migration runs `CREATE EXTENSION IF NOT EXISTS pg_trgm`; the migration user needs permission to enable it, or the provider must enable it beforehand.
4. Obtain a server-side routing API key from [HeiGIT](https://account.heigit.org). Without `ORS_API_KEY`, login and data management can work, but route optimization cannot.

Use the provider's Prisma-compatible pooled connection for application requests when available. Use its direct connection for migrations if required. Keep the provider's TLS and connection parameters intact. This project's Prisma schema reads only `DATABASE_URL`; setting an additional `DIRECT_URL` variable alone will not change its connection.

## 2. Import into Vercel

In Vercel, choose **Add New → Project**, connect GitHub, and import the repository.

| Setting | Value |
| --- | --- |
| Framework preset | Next.js |
| Root directory | Repository root |
| Node.js version | `24.x` |
| Install command | `npm ci` |
| Build command | `npm run db:generate && npm run build` |
| Output directory | Leave the framework default |

Generating Prisma Client on every build keeps it aligned with the committed schema, including when dependencies are cached. The existing build script uses Webpack.

Use Vercel's Next.js deployment flow. Do not configure `npm start` as a persistent Vercel server, deploy the Docker Compose stack, or change the app to a static export: authentication and API routes require server execution. The standalone configuration also supports the existing Docker deployment.

## 3. Set production environment variables

Add these in the project's **Settings → Environment Variables**, scoped to **Production**:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Hosted PostgreSQL application connection string |
| `SESSION_SECRET` | Random secret, at least 32 characters |
| `APP_URL` | Production HTTPS origin, such as `https://your-project.vercel.app` |
| `ORS_API_KEY` | Routing API key, required for optimization |

Generate a session secret locally and paste the result into Vercel:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Keep these variables server-only; do not prefix them with `NEXT_PUBLIC_`. `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, and `DB_PORT` configure the local Docker database and are not needed by the Vercel app. Admin credentials are used by the local setup command below and do not need to be stored in Vercel.

`APP_URL` must match the origin used in the browser, including HTTPS and hostname. The app rejects mutations from other origins. If the production hostname is not known until the first deployment, set the actual hostname afterward and redeploy before testing login. Use the stable production URL, rather than an individual deployment URL.

Changes to Vercel environment variables apply to new deployments. Redeploy after changing them. Changing `SESSION_SECRET` invalidates existing sessions.

## 4. Initialize the hosted database

Run this in a dedicated local PowerShell window. Replace the placeholders privately; commands containing credentials may be saved in shell history. Use a password of at least 12 characters and at most 72 UTF-8 bytes.

```powershell
npm ci
$env:DATABASE_URL = 'YOUR_HOSTED_DATABASE_MIGRATION_URL'
$env:ADMIN_USERNAME = 'admin'
$env:ADMIN_PASSWORD = 'YOUR_STRONG_ADMIN_PASSWORD'

npm run db:generate
npm run db:migrate
npm run admin:create
```

Run each command only after the preceding command succeeds. The migration URL must target the same database and schema as Vercel's application URL. Existing shell variables override values loaded from the local `.env` for these commands.

`db:migrate` applies committed migrations. Do not use `prisma migrate reset` against this database. `admin:create` creates or updates the single admin; rerunning it replaces the password and invalidates existing admin sessions. Keep it out of the Vercel build command.

After setup, close the dedicated shell or remove the overrides so later local commands do not accidentally target the hosted database:

```powershell
Remove-Item Env:DATABASE_URL, Env:ADMIN_USERNAME, Env:ADMIN_PASSWORD
```

Removing variables does not erase shell history.

## 5. Deploy and verify

Click **Deploy**, or redeploy after configuring the environment and database. Confirm that the build generates Prisma Client successfully.

Enable Fluid compute and check the function duration setting. A mixed urgent/non-urgent route can make two sequential routing requests, each with a 20-second timeout, plus database work. Allow at least 60 seconds for the function. Vercel currently documents a 300-second default and maximum on Hobby with Fluid compute; older configurations can have shorter limits.

Use the production domain to verify:

1. Open `/terms` and `/privacy`; review the operator/contact details before sharing the app.
2. Log in using the admin created above.
3. Save the warehouse and a test store.
4. Create and optimize a delivery plan. This uses real routing API quota.
5. Reload and open history to confirm the result persists.
6. Log out and confirm private pages require login again.

## Updates and preview deployments

For later releases, run `npm run lint`, `npm run typecheck`, `npm test`, and the production build locally. Generate Prisma Client before building if the schema changed.

Back up the hosted database before schema changes. Apply committed migrations with `npm run db:migrate` using the migration connection before releasing code that depends on them. Coordinate incompatible schema changes with the release; rolling back a Vercel deployment does not roll back database migrations. Routine releases do not require `admin:create`.

Keep preview deployments on a separate database and use a separate session secret. Configure their `APP_URL` to the exact preview origin and redeploy if it changes. Production `APP_URL` will cause login and writes from a preview hostname to be rejected. Do not point arbitrary preview branches or test suites at the production database.

Monitor Vercel usage, database storage/connections, and routing API quotas independently. Application routing limits are 5 requests per minute and 100 per 24 hours; a mixed urgent route consumes two requests, and failed attempts also count.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Prisma Client missing or outdated during build | Confirm the build command starts with `npm run db:generate`. |
| Database connection failure | Check the hosted URL, TLS options, provider availability, and connection limits. Do not use `localhost`. |
| Migration cannot create `pg_trgm` | Enable the extension through the provider or use a migration role with the required permission. |
| Missing table or column | Apply all committed migrations to the same database/schema used by Vercel. |
| Login fails despite correct credentials | Confirm `admin:create` succeeded against the hosted database and `SESSION_SECRET` is configured. |
| `Asal permintaan tidak diizinkan.` / HTTP 403 | Match `APP_URL` to the browser origin and redeploy. Use the stable production domain. |
| Optimization fails | Check `ORS_API_KEY`, provider quota, store coordinates, and runtime logs. |
| Function timeout / HTTP 504 | Check Fluid compute and function duration; urgent routes can require two sequential API calls. |
| Works in production but not in preview | Configure preview-specific database, secret, and exact `APP_URL`. |

## References

- [Vercel deployment guide](https://vercel.com/docs/deployments)
- [Vercel Hobby plan](https://vercel.com/docs/plans/hobby)
- [Supported Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
- [Environment variables](https://vercel.com/docs/environment-variables)
- [Function limits and duration](https://vercel.com/docs/functions/limitations)
- [Local setup and application behavior](README.md)
