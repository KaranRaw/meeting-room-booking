# GitHub, Render, and Vercel

No deployment has been performed from the source PC. Follow this guide only after the local release checks in TESTING.md pass. Hosting availability and free-tier limits can change; confirm the current plan before creating a service. Keep credentials out of Git and screenshots.

## 1. Publish a public GitHub repository

Restore the local history using the bundle instructions in the root README. Alternatively initialize a new repository in the extracted source. Configure Git identity on your own PC if needed:

```powershell
git config user.name "Your Name"
git config user.email "your-email@example.com"
```

After installing and testing, commit generated lock files and any verified corrections. From the project root:

```powershell
git add .
git commit -m "Verify local setup and lock tested dependencies"
git branch -M main
```

If Git says there is nothing to commit, continue. Create an **empty public repository** on github.com with no auto-generated README/license/gitignore. Replace `YOUR_USERNAME` and `YOUR_REPO` below:

```powershell
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

Use GitHub's normal browser/credential-manager sign-in. Never paste tokens into project files. Check the public repo in a signed-out browser and confirm no secrets were committed.

## 2. PostgreSQL hosting

Choose Render PostgreSQL, Neon, or Supabase. Create a database/project and obtain a PostgreSQL connection URL. Keep the password private.

- Render-hosted API with Render PostgreSQL: use the internal URL when both services are in the same region.
- Neon: use the direct connection URL for this small app, usually with `sslmode=require`.
- Supabase: use a connection mode reachable from Render; the direct host may be IPv6-only. Prefer its session pooler when necessary. Avoid transaction-pooler settings unless you have verified their compatibility with psycopg and initialization.

The database account must be allowed to create `btree_gist`, tables, and indexes. The initializer runs `CREATE EXTENSION IF NOT EXISTS btree_gist`. If the provider requires an admin to enable the extension, enable it in its SQL console first.

Free databases can have suspension, expiration, capacity, or inactivity limits. Do not assume a free database will remain live indefinitely. Make sure it remains available during evaluation.

## 3. Deploy FastAPI to Render

In Render, choose **New > Web Service**, connect the public GitHub repository, and configure:

| Setting | Value |
| --- | --- |
| Runtime | Python |
| Root directory | `backend` |
| Build command | `pip install -r requirements.txt` |
| Start command | `python -m app.init_db && uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| Health check | `/api/health` |
| Python version env | `PYTHON_VERSION=3.12.8` |
| Database env | `DATABASE_URL=<private PostgreSQL connection URL>` |
| CORS env | `CORS_ORIGINS=["http://localhost:3000"]` initially |

Render runs a Linux shell, so the `&&` above is intentional: do not start the API if database initialization fails. It is not a Windows PowerShell command. Choose a free web-service plan where available. You can also deploy using the supplied `render.yaml` blueprint and supply its two private environment values in Render.

Wait until the deploy is successful. Open the assigned backend URL, for example:

```text
https://YOUR-API.onrender.com/api/health
https://YOUR-API.onrender.com/api/rooms
https://YOUR-API.onrender.com/docs
```

The root `/` is not an API endpoint and returns 404. Use `/api/health` to check the service. Free web services may cold-start slowly; wait for health to succeed before testing the frontend.

## 4. Deploy Next.js to Vercel

In Vercel, import the same GitHub repository:

| Setting | Value |
| --- | --- |
| Framework | Next.js |
| Root directory | `frontend` |
| Build command | Default, `npm run build` |
| Install command | Default; uses lock file if committed |
| Node version | 22.x |
| Environment | `NEXT_PUBLIC_API_URL=https://YOUR-API.onrender.com` |

Set the variable for Production, and for Preview if you plan to use previews. This URL is public; it is **not** a database URL. Do not add `/api` or `/docs` to its end.

Deploy and copy the production frontend origin, for example `https://YOUR-FRONTEND.vercel.app`.

## 5. Finish CORS

In Render, change `CORS_ORIGINS` to the exact Vercel production origin:

```json
["https://YOUR-FRONTEND.vercel.app"]
```

Save and redeploy/restart the backend. Use no trailing slash. Add additional known origins only when needed. Preview deployment URLs are different origins and must be explicitly allowed to use the API. Do not solve CORS by exposing database credentials or enabling every origin.

If you change `NEXT_PUBLIC_API_URL`, redeploy the frontend: Next.js embeds it at build time.

## 6. Verify the actual live links

In PowerShell on your own PC, replace the example URL:

```powershell
$api = "https://YOUR-API.onrender.com"
Invoke-RestMethod "$api/api/health"
Invoke-RestMethod "$api/api/rooms"
(Invoke-WebRequest "$api/docs" -UseBasicParsing).StatusCode
Invoke-RestMethod "$api/api/rooms/1/next-available?date=2026-09-15&duration=45"
```

Use a returned room ID if it is not 1. Then use the deployed frontend in a signed-out/incognito browser:

1. Confirm all five rooms load, with no console/network/CORS errors.
2. Select a date, create a 10:00-11:00 booking, and confirm the success toast.
3. Try 10:30-11:30 in the same room; confirm the toast names the first booking.
4. Book 11:00-12:00; verify it is allowed.
5. Find a 45-minute slot and book it from the suggestion.
6. Cancel the test bookings and confirm the schedule updates.
7. Reload and verify the database-backed state is correct.
8. Check the frontend at mobile width, and open the public `/docs` link.

Do not submit example or placeholder links. Record real test results after checking those exact deployed URLs.

## Submission template

Replace every placeholder before sending:

```text
GitHub: https://github.com/<username>/<repo>
Frontend: https://<frontend>.vercel.app
Backend: https://<backend>.onrender.com
API docs: https://<backend>.onrender.com/docs

Setup and booking logic: repository README
Tests run: <actual commands and results>
Live checks completed: <date and observed result>
Known limitations: no authentication/ownership; one local room timezone;
no recurring meetings or cross-client push updates.
```
