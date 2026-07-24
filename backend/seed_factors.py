# EcoTrack/backend/seed_factors.py
"""
One-off script that fills the emissionFactors collection in Firestore.

RUN IT ONCE, from inside the backend folder:
    python seed_factors.py

It is safe to run again. Each factor is written to a document with a predictable
id (for example "transport_petrol_car"), so a second run overwrites the existing
document instead of creating a duplicate. That means you can edit a value in the
list below, re-run the script, and the change appears in the app immediately.

WHY A SCRIPT INSTEAD OF TYPING THEM INTO THE FIREBASE CONSOLE
--------------------------------------------------------------
17 factors x 6 fields = 102 values to type by hand, with no spell-check. The
script also documents the source of every number in version control, which is
what makes the figures defensible in the report.

THIS IS NOT PART OF THE RUNNING APPLICATION. It never gets imported by app.py
and it is not deployed to Render - it is a developer tool that you run from
your own machine.
"""

from google.cloud import firestore as gcloud_firestore

from config import Config, get_db

# ---------------------------------------------------------------------------
# THE FACTOR DATA
#
# Every value below is a published figure, not an estimate we invented. Cite
# these sources in the report - a marker can check them.
#
# The maths is always:  emission (kgCO2) = quantity x factorValue
# ---------------------------------------------------------------------------

EMISSION_FACTORS = [
    # --- TRANSPORT: kg CO2 per kilometre travelled ---
    {"category": "transport", "subType": "petrol_car", "factorValue": 0.141,
     "unit": "km", "region": "Global", "source": "DEFRA 2023"},
    {"category": "transport", "subType": "diesel_car", "factorValue": 0.132,
     "unit": "km", "region": "Global", "source": "DEFRA 2023"},
    {"category": "transport", "subType": "motorbike", "factorValue": 0.071,
     "unit": "km", "region": "Global", "source": "DEFRA 2023"},
    {"category": "transport", "subType": "bus", "factorValue": 0.082,
     "unit": "km", "region": "Global", "source": "DEFRA 2023"},
    {"category": "transport", "subType": "train", "factorValue": 0.041,
     "unit": "km", "region": "Global", "source": "DEFRA 2023"},
    {"category": "transport", "subType": "flight_domestic", "factorValue": 0.255,
     "unit": "km", "region": "Global", "source": "DEFRA 2023"},
    # Cycling emits nothing at the point of use, which is exactly the message
    # the app wants to send - so it stays in the list with a value of zero
    {"category": "transport", "subType": "bicycle", "factorValue": 0.000,
     "unit": "km", "region": "Global", "source": "DEFRA 2023"},

    # --- ELECTRICITY: kg CO2 per kilowatt-hour ---
    # India's grid is coal-heavy, which is why this number is high compared to
    # European grids. This is the clearest example of why factors are stored
    # per region rather than hardcoded.
    {"category": "electricity", "subType": "grid_electricity", "factorValue": 0.710,
     "unit": "kWh", "region": "India", "source": "CEA India 2023"},
    # Solar is not zero: manufacturing and installing the panels has a cost,
    # spread across the energy they produce over their lifetime
    {"category": "electricity", "subType": "solar", "factorValue": 0.050,
     "unit": "kWh", "region": "Global", "source": "IPCC lifecycle assessment"},

    # --- FUEL: note the different units per fuel type ---
    {"category": "fuel", "subType": "lpg", "factorValue": 2.983,
     "unit": "kg", "region": "Global", "source": "IPCC 2006"},
    {"category": "fuel", "subType": "petrol_generator", "factorValue": 2.310,
     "unit": "liter", "region": "Global", "source": "IPCC 2006"},
    {"category": "fuel", "subType": "diesel_generator", "factorValue": 2.680,
     "unit": "liter", "region": "Global", "source": "IPCC 2006"},

    # --- DIET: kg CO2 per meal ---
    {"category": "diet", "subType": "non_vegetarian", "factorValue": 3.300,
     "unit": "meal", "region": "Global", "source": "Our World in Data"},
    {"category": "diet", "subType": "vegetarian", "factorValue": 1.700,
     "unit": "meal", "region": "Global", "source": "Our World in Data"},
    {"category": "diet", "subType": "vegan", "factorValue": 1.100,
     "unit": "meal", "region": "Global", "source": "Our World in Data"},

    # --- WASTE: kg CO2 per kilogram of waste ---
    # Landfill waste rots and releases methane; recycling avoids most of that
    {"category": "waste", "subType": "landfill", "factorValue": 0.580,
     "unit": "kg", "region": "Global", "source": "IPCC waste sector guidelines"},
    {"category": "waste", "subType": "recycled", "factorValue": 0.100,
     "unit": "kg", "region": "Global", "source": "IPCC waste sector guidelines"},

    # --- WATER: kg CO2 per litre ---
    # Water itself emits nothing. This factor covers the electricity used to
    # pump, treat and deliver it - known as the water-energy nexus.
    {"category": "water", "subType": "municipal_supply", "factorValue": 0.0003,
     "unit": "liter", "region": "India", "source": "Water-energy nexus estimate"},

    # --- CONSUMPTION: kg CO2 per item bought ---
    # These cover the whole life of the product: raw materials, manufacturing,
    # shipping and disposal - not just the shop it was bought from
    {"category": "consumption", "subType": "clothing_item", "factorValue": 8.000,
     "unit": "item", "region": "Global", "source": "Fast fashion lifecycle average"},
    {"category": "consumption", "subType": "electronics_item", "factorValue": 85.000,
     "unit": "item", "region": "Global", "source": "Small electronics lifecycle average"},
]


def seed():
    """Write every factor above into Firestore."""
    db = get_db()
    collection = db.collection(Config.COLLECTION_EMISSION_FACTORS)

    print(f"Seeding {len(EMISSION_FACTORS)} emission factors "
          f"into '{Config.COLLECTION_EMISSION_FACTORS}'...")
    print(f"Firebase project: {Config.FIREBASE_PROJECT_ID}\n")

    written = 0
    # Firestore batches every write into a single network call, which is much
    # faster than sending 20 separate requests
    batch = db.batch()

    for factor in EMISSION_FACTORS:
        # A predictable document id makes re-running the script safe:
        # "transport_petrol_car" always maps to the same document
        document_id = f"{factor['category']}_{factor['subType']}"
        document_ref = collection.document(document_id)

        batch.set(document_ref, {
            "category": factor["category"],
            "subType": factor["subType"],
            "factorValue": factor["factorValue"],
            "unit": factor["unit"],
            "region": factor["region"],
            "source": factor["source"],
            "updatedAt": gcloud_firestore.SERVER_TIMESTAMP,
        })

        written += 1
        print(f"  {document_id:<38} {factor['factorValue']:>8} kgCO2/{factor['unit']}")

    batch.commit()  # nothing is saved until this line runs

    print(f"\nDone. {written} emission factors written.")
    print("Check them at: Firebase Console > Firestore Database > emissionFactors")
    print("Verify through the API at: http://localhost:5000/api/factors")


def verify():
    """Read the factors back out so you can see the seed actually worked."""
    db = get_db()
    documents = list(db.collection(Config.COLLECTION_EMISSION_FACTORS).stream())

    print(f"\nVerification: {len(documents)} documents found in Firestore.")

    # Count how many factors each category ended up with
    per_category = {}
    for doc in documents:
        category = doc.to_dict().get("category", "unknown")
        per_category[category] = per_category.get(category, 0) + 1

    for category in Config.CATEGORIES:
        count = per_category.get(category, 0)
        # A category with no factors would break that tab in the Calculator
        flag = "OK" if count > 0 else "MISSING"
        print(f"  {category:<14} {count} factor(s)  [{flag}]")


if __name__ == "__main__":
    # This block only runs when you type "python seed_factors.py" - it never
    # runs when another file imports this one
    seed()
    verify()
