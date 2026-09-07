# نبض — Backend API

FastAPI backend for the نبض platform: Google OAuth login, single-active-session
enforcement, the MCQ engine with server-side grading, professors/courses
catalog, and the store checkout (with the COD-only-for-physical-orders rule
enforced server-side, not just in the UI).

## 1. Install

**macOS / Linux:**
```bash
cd nabd-backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

**Windows (PowerShell):**
```powershell
cd nabd-backend
python -m venv venv
venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
```
If `python` isn't recognized, use `py` instead. If activation fails with a
message about scripts being disabled, run
`Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` once in the
same window, then try activating again. Every `python` in this README means
`py` on Windows if that's the command that worked here.

## 2. Get real Google OAuth credentials

The frontend's "المتابعة عبر Google" button needs a real Google Cloud OAuth
client to work end-to-end (without this, the frontend automatically falls
back to a simulated login so you can still demo the UI).

1. Go to console.cloud.google.com → **APIs & Services → Credentials**
2. **Create Credentials → OAuth client ID → Web application**
3. Under **Authorized redirect URIs**, add exactly:
   `http://localhost:8000/auth/google/callback`
4. Copy the Client ID and Client Secret into `.env`:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   ```
5. (Optional) Set `ALLOWED_UNIVERSITY_DOMAINS=uob.edu.iq` to restrict sign-in
   to university email addresses, matching the SRS. Leave empty while testing
   to allow any Google account.

## 3. Seed demo data and run

```bash
python seed.py            # creates nabd.db (SQLite) with sample content
uvicorn app.main:app --reload --port 8000
```

Visit `http://localhost:8000/docs` for interactive API docs.

Without real Google credentials yet, exercise every other endpoint via the
dev login stand-in (only active when `DEBUG=true`):

```bash
curl -X POST "http://localhost:8000/auth/dev-login?email=you@uob.edu.iq&name=Your+Name"
```

On Windows PowerShell, `curl` is aliased to `Invoke-WebRequest` and won't
accept `-X` the same way — either call the real curl explicitly:
```powershell
curl.exe -X POST "http://localhost:8000/auth/dev-login?email=you@uob.edu.iq&name=Your+Name"
```
or just open that URL's `/docs` page (`http://localhost:8000/docs`) and try
the endpoint from there — easiest option on Windows.

## 4. Connect the frontend(s)

There are two frontend files, both static HTML — served the same way:

- `nabd-home-quiz-prototype.html` — the student app
- `nabd-admin-dashboard.html` — Super Admin / Professor / Reseller control panel (role switcher built in). Log in with real email + password — every seeded admin/professor/reseller account uses the password `Nabd@2026` (e.g. `admin@nabd.app` / `Nabd@2026`, `أحمد.الجبوري@uob.edu.iq` / `Nabd@2026`, `reseller@nabd.app` / `Nabd@2026`). The three "دخول كـ..." buttons below the form are still there too, for a one-click no-password demo via `/auth/dev-login`.

Neither works opened directly (`file://`) — the OAuth redirect and API calls need a real HTTP origin:

```bash
# in the folder containing the HTML files
python3 -m http.server 5500
```

Then open `http://localhost:5500/nabd-home-quiz-prototype.html` or
`http://localhost:5500/nabd-admin-dashboard.html`. Make sure:

- `FRONTEND_URL` in `.env` matches the student app's origin (`http://localhost:5500`) — that's where Google's redirect sends the browser back to
- `API_BASE_URL` near the top of each HTML file's `<script>` matches your backend (`http://localhost:8000` by default — already set)
- CORS: in `DEBUG=true` (the default), the backend accepts requests from any origin, since auth uses Bearer tokens rather than cookies — so both files work regardless of which port serves them. Set `DEBUG=false` in production and list real origins in `CORS_ORIGINS` instead.

With the backend running, "المتابعة عبر Google" on the student app performs a
real OAuth round trip, and the admin dashboard's login form authenticates for
real via `POST /auth/login` (email + password, PBKDF2-hashed server-side —
see `password_hash` on the `User` model and `app/security.py`). If the
backend isn't reachable, both frontends silently fall back to their built-in
demo data — nothing breaks either way.

## 5. What's actually wired vs. still local-only

Wired to the real API when it's reachable and you're signed in:
- Google sign-in → session issuance → `/auth/me`
- MCQ engine questions + **server-side answer grading** (`/api/subjects/{id}/questions`, `/api/questions/{id}/answer`)
- Store checkout (`/api/store/orders`), including the COD/physical rule
- Professors Hub and Video Academy (`/api/professors`, `/api/courses`)
- Account page profile (`/auth/me`)
- Admin dashboard: Overview, Accounts, Catalog, Students, Bans (active), Media, Logs
- Professor Panel: Overview, Booklets, Exams (`/api/professors/me/dashboard`)
- Reseller Panel: code balance and sales (`/api/reseller/summary`, `/api/reseller/codes`)

Still local demo data only (no backend endpoint yet):
- Ban appeals/history tabs, Import & Export (admin)

## 6. Deploying with a real database

SQLite is fine locally, but on a host with an ephemeral disk (Render's free
plan included) the file is wiped on **every deploy** — accounts, booklets,
sold codes and student progress all disappear. Use Postgres in production.

`render.yaml` already declares a free Postgres (`nabd-db`) and wires
`DATABASE_URL` to it, so deploying the blueprint provisions both. To point at
an existing database instead, set `DATABASE_URL` to the connection string
exactly as the provider gives it — a `postgres://` URL is rewritten to
`postgresql+psycopg://` automatically (see `app/database.py`).

Environment variables that must be set:

| Variable | Why |
| --- | --- |
| `JWT_SECRET` | The app refuses to start in production with the default. |
| `BOOTSTRAP_ADMIN_EMAIL` | The only email that can claim admin on an empty database. Without it nobody can reach the dashboard. |
| `DEBUG` | Must be `false`, or `/auth/dev-login` grants a session to any email with no password. |
| `GOOGLE_REDIRECT_URI`, `FRONTEND_URL`, `CORS_ORIGINS` | Your deployed URL, not localhost. |

**First run on an empty database**, in order:
1. Sign in with `BOOTSTRAP_ADMIN_EMAIL` — that account becomes admin.
2. Catalog → build section → university → stage → subject. Nothing else can
   be created until at least one subject exists.
3. Accounts → add professors. Each one needs a subject; the account is
   unusable without a teaching profile, so the form asks for it up front.

Schema changes need no migration tool: `_patch_missing_columns()` in
`app/main.py` ALTERs in any new model column on startup and backfills its
default, on SQLite and PostgreSQL alike.

## 7. File storage

Uploads have the same ephemeral-disk problem the database had: with
`STORAGE_BACKEND=local` the files live in `./uploads`, which is wiped on
every deploy, so booklets and lecture videos vanish.

Set `STORAGE_BACKEND=s3` and they go to any S3-compatible object store:

| Provider | Endpoint | Note |
| --- | --- | --- |
| **Cloudflare R2** | `https://<account-id>.r2.cloudflarestorage.com` | Recommended — no egress charge, which is what lecture video actually costs. `S3_REGION=auto`. |
| AWS S3 | leave `S3_ENDPOINT_URL` empty | Charges per GB served. |
| Backblaze B2 | `https://s3.<region>.backblazeb2.com` | S3-compatible endpoint. |
| Supabase Storage | `https://<project>.supabase.co/storage/v1/s3` | 1GB free. |

Required: `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, plus
`S3_ENDPOINT_URL` for anything that isn't AWS. The app refuses to start if
`STORAGE_BACKEND=s3` and those are missing, rather than looking healthy
until the first upload fails.

**Keep the bucket private.** Booklets and lecture videos are paid content;
with no `S3_PUBLIC_BASE_URL` set, `GET /media-files/<name>` redirects to a
signed URL that expires after `S3_URL_EXPIRY_SECONDS` (default 1 hour).
Range requests pass through, so video seeking works and the bytes never
travel through this process.

Check the credentials before deploying anything that depends on them:

```
python scripts/check_storage.py
```

It writes one test object, reads it back through a signed URL, confirms
range requests work (that's what makes video seekable), and deletes it.

The database always stores the backend-agnostic `/media-files/<name>`, so
switching backends doesn't rewrite any rows — but files already uploaded to
the old backend need copying across, since nothing migrates them for you.

## 8. Other production notes

- Add Redis for catalog caching (mentioned in the SRS) — not required to run
- Forgot-password and email-change are deliberately unimplemented: both need
  a real email service, and neither should be faked
