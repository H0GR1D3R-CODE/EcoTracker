# EcoTrack — Cloud-Based Carbon Footprint Tracker

A web application that lets a person measure, understand and reduce their
personal carbon footprint across seven categories of daily activity.

Built as a BCA Specialization Project (BCA482-5), aligned with
**UN Sustainable Development Goal 13: Climate Action**.

---

## What it does

Every activity you log is converted into kilograms of CO₂ using a published
scientific emission factor:

```
emission (kgCO₂) = quantity × emissionFactor
```

For example, driving 30 km in a petrol car:
`30 km × 0.141 kgCO₂/km = 4.23 kgCO₂`

The app then shows that number as a trend over time, breaks it down by category,
measures it against reduction goals you set, and turns it into comparisons a
person can actually picture — *"the same as driving 30 km"*.

### Closing the loop: predict, prescribe, verify

Past that, the `/insights` page closes the loop from measurement to action:

- **Forecast** — a month-end projection with an 80% prediction interval, built
  from an exponentially-weighted average of your own weekday/weekend habits
  (`backend/insights_engine.py`). `evaluate_forecast.py` backtests it against a
  naive baseline across your real history.
- **Counterfactual swaps** — ranked, explainable "swap X for Y, save Z kg"
  recommendations, every one carrying the two DEFRA/IPCC/CEA factor values and
  citations it was computed from, plus a marginal-abatement curve and a
  what-if sandbox with instant client-side sliders.
- **Quick-log templates & habit mining** — one-tap re-logging for what you do
  often, and suggestions mined from patterns already in your history.
- **Streaks & challenges**, computed live from your logged dates - no stored,
  driftable streak state.
- **Cohort comparison** — your percentile against others in your region,
  k-anonymised below 10 people, with a boomerang-effect-aware framing.
- **Bill/receipt scanning** — photograph an electricity bill and Groq's
  vision model extracts the quantity for you to confirm before it ever
  saves anything.

Every recommendation shown anywhere in the app is logged to Firestore's
`interventions` collection (never with an email or name attached) - the
evaluation harness behind an admin's Research tab CSV export.

### The seven categories

| Category | Sub-types | Unit |
|---|---|---|
| Transport | petrol car, diesel car, motorbike, bus, train, domestic flight, bicycle | km |
| Electricity | grid electricity, solar | kWh |
| Fuel | LPG, petrol generator, diesel generator | kg / litre |
| Diet | non-vegetarian, vegetarian, vegan | meal |
| Waste | landfill, recycled | kg |
| Water | municipal supply | litre |
| Consumption | clothing item, electronics item | item |

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18 (Vite), Bootstrap 5, Chart.js, Framer Motion, GSAP |
| Backend | Python Flask |
| Database | Firebase Firestore (NoSQL) |
| Authentication | Firebase Authentication (email/password) |
| Hosting | Firebase Hosting (frontend) + Render (backend) |

---

## Running it locally

You need **two terminals** — one for the backend, one for the frontend.

### 1. Backend (Flask)

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

Then set up your credentials:

1. Copy `.env.example` to `.env`
2. Download your Firebase service account key from
   **Firebase Console → Project settings → Service accounts → Generate new private key**
3. Save it in the `backend` folder as `serviceAccountKey.json`

Seed the emission factors into Firestore (run this once):

```bash
python seed_factors.py
```

Start the server:

```bash
python app.py
```

The API runs at `http://localhost:5000`. Check `http://localhost:5000/api/health`
to confirm it started.

### 2. Frontend (React)

```bash
cd frontend
npm install
```

Copy `.env.example` to `.env` and fill in your Firebase web config from
**Firebase Console → Project settings → General → Your apps → Web app**.

```bash
npm run dev
```

The app runs at `http://localhost:5173`.

---

## API

Base URL: `http://localhost:5000` locally, the Vercel deployment in
production (`backend/vercel.json` - the backend moved off Render; see
`render.yaml`'s own comments if you're wondering why that file is still here).

Every route requires a Firebase ID token in the `Authorization` header
except the ones marked **public** below - a visitor can register, browse the
published emission factors, send feedback, and donate without an account.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | **Public.** Server status |
| POST | `/api/auth/register` | **Public.** Create account (no token can exist yet) |
| POST | `/api/auth/login` | Exchange a Firebase ID token for a profile |
| GET / PUT | `/api/auth/profile` | Read / update the signed-in user's profile |
| POST | `/api/auth/forgot-password` | **Public.** Send a password reset email |
| PUT | `/api/auth/2fa` | Turn optional email-code 2FA on/off |
| POST | `/api/auth/2fa/resend`, `/api/auth/2fa/verify` | The 2FA sign-in step |
| GET | `/api/factors` | **Public.** Emission factors, grouped by category |
| GET | `/api/factors/:category/:subType` | A single factor, for the live preview |
| GET | `/api/factors/:id/impact` | **Admin only.** How many saved records used an older version of this factor |
| POST | `/api/factors/:id/recalculate` | **Admin only.** Bring those records' emissionKgco2 up to date with the current value |
| POST | `/api/carbon/calculate` | Calculate and save an emission record |
| POST | `/api/carbon/check` | Dry run: flags a quantity unusual for your own history, saves nothing |
| GET | `/api/carbon/quality-score` | How much of your recent logging was flagged as unusual |
| GET | `/api/carbon/records` | Records for `?month=YYYY-MM` or `?year=YYYY` |
| DELETE | `/api/carbon/records/:id` | Delete one of your own records |
| GET | `/api/dashboard/summary` | Every dashboard figure in one request |
| GET | `/api/dashboard/chart/monthly` | Line chart data |
| GET | `/api/dashboard/chart/category` | Doughnut and bar chart data |
| POST / GET | `/api/goals` | Create / list goals with live progress |
| PUT / DELETE | `/api/goals/:id` | Update status / delete a goal |
| POST | `/api/reports/generate` | Generate a report for a date range |
| GET | `/api/reports`, `/api/reports/:id` | List / open reports |
| GET | `/api/insights/forecast` | Month-end forecast with an 80% prediction interval |
| GET | `/api/insights/swaps` | Ranked, cited counterfactual swaps + a MACC curve |
| POST | `/api/insights/simulate` | Authoritative recompute behind the what-if sandbox |
| GET | `/api/insights/cohort` | Percentile vs. your region (k-anonymised, n≥10 only) |
| GET | `/api/insights/grid` | Time-of-day grid carbon intensity nudge for your region |
| GET | `/api/insights/appliances`, `/api/insights/appliance-schedule` | "Run this at 11pm instead of 7pm" for one appliance |
| GET | `/api/insights/air-quality` | Current AQI at your region, with a health-framed nudge |
| GET / POST | `/api/templates` | List / create quick-log templates |
| DELETE | `/api/templates/:id` | Delete a template |
| POST | `/api/templates/:id/log` | One-tap log from a saved template |
| GET | `/api/templates/suggestions` | Habit-mined template proposals from your history |
| GET | `/api/engagement/streak` | Current logging streak |
| GET | `/api/engagement/challenges` | This week's self-relative challenges |
| POST | `/api/engagement/challenges/:id/claim` | Claim a completed challenge |
| POST | `/api/engagement/interventions` | Log a client-rendered recommendation as shown |
| PATCH | `/api/engagement/interventions/:id` | Record accept/dismiss on a shown recommendation |
| POST | `/api/ingest/bill` | Groq vision-model extraction from a bill/receipt photo (saves nothing) |
| POST | `/api/assistant/chat` | Ask the AI assistant a question, grounded in your data |
| POST | `/api/assistant/summary` | AI-written summary of a report's period |
| GET | `/api/assistant/status` | Whether the assistant is configured |
| GET | `/api/assistant/public-status`, POST `/api/assistant/public-chat` | **Public.** Signed-out visitor version |
| POST | `/api/feedback` | **Public.** Send feedback |
| POST | `/api/create-order`, `/api/verify-payment` | **Public.** Razorpay donation flow |
| GET | `/api/admin/users`, `/api/admin/stats` | **Admin only.** |
| GET | `/api/admin/users/:id` | **Admin only.** Full drill-down on one user |
| DELETE | `/api/admin/users/:id` | **Admin only.** Delete a user and all their data |
| GET | `/api/admin/feedback`, `/api/admin/donations` | **Admin only.** |
| DELETE | `/api/admin/feedback/:id`, `/api/admin/donations/:id` | **Admin only.** |
| GET | `/api/admin/system` | **Admin only.** Live health of every dependency |
| GET | `/api/admin/data-quality` | **Admin only.** Platform-wide view of flagged/unusual entries |
| GET | `/api/admin/researchers` | **Admin only.** Who currently holds read-only research access |
| POST | `/api/admin/researchers` | **Admin only.** Grant research access to an existing account, by email |
| DELETE | `/api/admin/researchers/:uid` | **Admin only.** Revoke research access |
| GET | `/api/admin/research/export` | **Admin or researcher.** Anonymised CSV of every logged intervention |
| GET | `/api/admin/research/stats` | **Admin or researcher.** Adoption rates and impact, pre-aggregated |

---

## Emission factor sources

All factors are stored in the Firestore `emissionFactors` collection rather than
hardcoded in Python. This lets an admin update a value when a new report is
published, without a code change or redeployment, and supports region-specific
factors.

| Category | Source |
|---|---|
| Transport | DEFRA 2023 |
| Electricity (grid) | Central Electricity Authority, India 2023 |
| Fuel | IPCC 2006 Guidelines |
| Diet | Our World in Data |
| Waste | IPCC waste sector guidelines |
| Water | Water–energy nexus estimate |
| Consumption | Product lifecycle averages |

---

## Security notes

- Passwords are never seen or stored by the Flask backend. Firebase
  Authentication handles hashing, storage and password resets.
- Every protected route verifies the Firebase ID token's signature against
  Google's public keys before running.
- Verifying a token proves *who you are*. Every update and delete additionally
  checks that the record's `userId` matches the caller, which proves the record
  is *yours*.
- Admins live in a separate `admins` collection, not as a flag on the user
  document, so a user cannot promote themselves by editing their own profile.
- No secret is ever committed. `.env` files and service account keys are
  git-ignored; `.env.example` shows the shape without the values.

### Creating the first admin

There is deliberately no "make me an admin" endpoint — that would be a security
hole. Do it once by hand:

1. Register normally through the app
2. **Firebase Console → Authentication** → copy your User UID
3. **Firestore** → create a collection `admins` → document ID = that UID
4. Add fields: `name` (string), `email` (string), `createdAt` (timestamp)

### Granting research access

A narrower, read-only role - the anonymised intervention export and adoption
stats only, none of an admin's other powers. Unlike the first admin above,
this is a normal, in-app admin action: **Admin console → Research → Research
access**, or `POST /api/admin/researchers` with `{"email": "..."}` for an
account that has already registered.

---

## Branches

| Branch | Purpose |
|---|---|
| `main` | Deployed, stable code |
| `develop` | Active development |
| `feature/*` | One branch per feature |
