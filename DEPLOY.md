# Deploying EcoTrack

## Where things stand

- **Frontend — LIVE ✅** → https://ecotrack-carbon-tracker-4f2a1.web.app
  Hosted on Firebase Hosting. Anyone can open this link and see the whole site.
- **Backend — not yet deployed.** Login, the dashboard, saving data, and the AI
  assistant need the Flask API running on the public internet. Right now the
  live site's marketing pages work, but signing in does not — because the app is
  still pointed at `localhost`. The steps below fix that.

Everything sensitive (`.env` files, `serviceAccountKey.json`) is git-ignored, so
pushing to GitHub will **not** leak any secret.

---

## 1. Push the code to GitHub

Render deploys from a Git repo. Create an empty repo on github.com (or use
`gh repo create`), then from the project root:

```bash
git add .
git commit -m "Add deployment config"
git remote add origin https://github.com/<your-username>/EcoTracker.git
git branch -M main
git push -u origin main
```

## 2. Grab your Firebase service-account key

Firebase Console → **Project settings → Service accounts → Generate new private
key**. This downloads a JSON file. Open it and copy the **entire** contents —
you'll paste it into Render in the next step. (Never commit this file.)

## 3. Deploy the backend on Render

1. Go to **render.com → New + → Blueprint**.
2. Connect the GitHub repo from step 1. Render reads `render.yaml` and creates a
   free web service called **ecotrack-backend**.
3. Open the service's **Environment** tab and set these four values:
   | Key | Value |
   |---|---|
   | `FIREBASE_SERVICE_ACCOUNT_JSON` | the whole JSON from step 2 |
   | `GROQ_API_KEY` | your Groq key (or leave blank to hide the assistant) |
   | `ADMIN_EMAILS` | `nebinstanly12@gmail.com` |
   | `CORS_ORIGINS` | `https://ecotrack-carbon-tracker-4f2a1.web.app` |
4. Deploy. When it's live, copy the service URL — something like
   `https://ecotrack-backend.onrender.com`.

## 4. Point the frontend at the live backend

Edit `frontend/.env` and change the API URL to your Render URL:

```
VITE_API_URL=https://ecotrack-backend.onrender.com
```

Then rebuild and redeploy the frontend:

```bash
cd frontend
npm run build
cd ..
firebase deploy --only hosting
```

## 5. Done 🎉

Open https://ecotrack-carbon-tracker-4f2a1.web.app — sign-in, the dashboard, the
admin panel, and the assistant all work now, for anyone you share the link with.

---

### Good to know

- **First load can be slow.** Render's free tier puts the service to sleep after
  ~15 minutes idle; the first request then takes 30–60s to wake it. The app
  already handles this (45s request timeout + a "reaching the server" retry
  screen), so it recovers on its own.
- **Sign-in domains.** Firebase Auth already trusts the `.web.app` and
  `.firebaseapp.com` domains, so login works from the live URL with no extra
  setup. If you later add a custom domain, add it under
  Firebase Console → Authentication → Settings → Authorized domains.
- **Redeploying the frontend later:** just `npm run build` then
  `firebase deploy --only hosting` — the config files are already in place.
