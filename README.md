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

Base URL: `http://localhost:5000` locally, your Render URL in production.

Every route requires a Firebase ID token in the `Authorization` header, with
exactly three deliberate exceptions marked **public** below.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | **Public.** Server status |
| POST | `/api/auth/register` | **Public.** Create account (no token can exist yet) |
| POST | `/api/auth/login` | Exchange a Firebase ID token for a profile |
| GET / PUT | `/api/auth/profile` | Read / update the signed-in user's profile |
| GET | `/api/factors` | **Public.** Emission factors, grouped by category |
| GET | `/api/factors/:category/:subType` | A single factor, for the live preview |
| POST | `/api/carbon/calculate` | Calculate and save an emission record |
| GET | `/api/carbon/records` | Records for `?month=YYYY-MM` or `?year=YYYY` |
| DELETE | `/api/carbon/records/:id` | Delete one of your own records |
| GET | `/api/dashboard/summary` | Every dashboard figure in one request |
| GET | `/api/dashboard/chart/monthly` | Line chart data |
| GET | `/api/dashboard/chart/category` | Doughnut and bar chart data |
| POST / GET | `/api/goals` | Create / list goals with live progress |
| PUT / DELETE | `/api/goals/:id` | Update status / delete a goal |
| POST | `/api/reports/generate` | Generate a report for a date range |
| GET | `/api/reports`, `/api/reports/:id` | List / open reports |
| GET | `/api/admin/users`, `/api/admin/stats` | **Admin only.** |
| DELETE | `/api/admin/users/:id` | **Admin only.** Delete a user and all their data |

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

---

## Branches

| Branch | Purpose |
|---|---|
| `main` | Deployed, stable code |
| `develop` | Active development |
| `feature/*` | One branch per feature |
