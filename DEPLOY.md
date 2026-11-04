# Deploying SarthiAI

One server hosts **both** the API and the website (PWA). The Android app is the same website packaged
with Capacitor; it talks to that server over HTTPS.

```
Students' browsers ─┐
                    ├──►  https://<your-app>.onrender.com   (Docker: API + website)  ──►  MongoDB Atlas
Android app (APK) ──┘
GitHub Actions ── daily 03:07 IST: scrape official sources → commit snapshot → Render redeploys → data loaded
```

## 0. Before you start (once)

1. **Merge** the pull request into `main` on GitHub. Scheduled jobs (the daily data refresh) only run on `main`.
2. Have a **GitHub** account with access to this repository.

## 1. Database: MongoDB Atlas (free)

1. Sign up at <https://www.mongodb.com/cloud/atlas/register>.
2. **Create** → **M0 Free** cluster. Region: **Mumbai (ap-south-1)** if offered, otherwise the nearest.
3. **Database Access** → *Add new database user* → username + a strong password (save it).
4. **Network Access** → *Add IP address* → `0.0.0.0/0` (Render's free plan has no fixed IP).
5. **Connect** → *Drivers* → copy the connection string. Put your password in it and add the database
   name `sarthiai` before the `?`:

   ```
   mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/sarthiai?retryWrites=true&w=majority
   ```

## 2. Server + website: Render (free to start)

1. Sign up at <https://render.com> with GitHub and allow access to this repository.
2. **New** → **Blueprint** → choose the repository. Render reads `render.yaml` and sets everything up:
   Docker build, Singapore region, health check, a generated `JWT_SECRET`, data loading on start.
3. When asked, paste your Atlas string into **`MONGODB_URI`**. `GEMINI_API_KEY` is optional
   (without it, Sarthi answers in "quick answers" mode from real data; get a key at <https://aistudio.google.com/apikey>).
4. **Apply**. The first build takes ~5–8 minutes. When it is live, open `https://<your-app>.onrender.com`
   — you should see the SarthiAI welcome screen. `https://<your-app>.onrender.com/ready` should say
   `"database":"connected"`.

**Free plan note:** the app sleeps after ~15 minutes without visitors; the first visit after that takes
~1 minute to wake. For a real launch, switch the service to the **Starter** plan (always on).

**Custom domain (optional):** Render → your service → *Settings* → *Custom Domains* (e.g. `app.sarthiai.in`);
Render issues the HTTPS certificate.

### Other hosts
The `Dockerfile` works anywhere Docker runs (Railway, Fly.io, a VPS). Set the same variables:

| Variable | Value |
|---|---|
| `MONGODB_URI` | your Atlas string |
| `JWT_SECRET` | 32+ random characters (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`) |
| `NODE_ENV` | `production` |
| `TRUST_PROXY` | `1` |
| `SEED_ON_START` | `true` (loads verified + scraped data on each start; safe to repeat) |
| `ENABLE_DAILY_REFRESH` | `false` if GitHub Actions refreshes data (recommended); `true` to scrape from the server itself |
| `GEMINI_API_KEY` | optional |

## 3. Android app

1. GitHub → repository → **Settings → Secrets and variables → Actions → Variables** → *New variable*:
   `SARTHI_API_URL` = `https://<your-app>.onrender.com` (no trailing slash).
2. GitHub → **Actions → CI → Run workflow** (or push any commit). When it finishes, download the
   **`sarthiai-android-debug-apk`** artifact, unzip it, and install the `.apk` on a phone
   (allow "install unknown apps" when Android asks).
3. The app now talks to your server. (Users can also change the server in **Profile → Developer · server**.)

### Publishing on Google Play (later)
The CI APK is a *debug* build for testing. For the Play Store:
1. Create a Play Console account (one-time fee) at <https://play.google.com/console>.
2. In Android Studio: `cd web && VITE_API_BASE_URL=https://<your-app>.onrender.com npm run android:sync && npm run android:open`,
   then **Build → Generate Signed App Bundle** and create an upload key (**keep the keystore and passwords safe — never commit them**).
3. Upload the `.aab` in Play Console, fill in the listing and the data-safety form (the app collects name, email
   and profile details; income/home state are optional and private), then submit for review.

## 4. First admin (optional, for a college placement cell)

From your computer, with the Atlas string:

```bash
cd server && npm install
MONGODB_URI="<atlas string>" JWT_SECRET="<anything 32+ chars>" npm run admin:create -- --email admin@college.edu --name "Placement Cell" --password "<strong password>" --college "KIET Group of Institutions"
```

## 5. Keeping data fresh

Nothing to do: every day at 03:07 IST, GitHub Actions scrapes the official sources, link-checks learning
resources and commits the snapshot to `main`; Render redeploys and `SEED_ON_START` loads it. Watch it under
**Actions → Refresh data** — each run's summary lists what every source returned.

## Checklist

- [ ] Pull request merged into `main`
- [ ] Atlas cluster, user, `0.0.0.0/0` access, connection string
- [ ] Render Blueprint applied, `/ready` shows `"database":"connected"`
- [ ] `SARTHI_API_URL` set, CI re-run, APK installed and signed in
- [ ] (Launch) Render Starter plan, custom domain, Play Store release
