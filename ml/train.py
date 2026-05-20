"""
Bootstrap script: generates dataset + trains model with canonical feature names.
Run ONCE before starting the API server:
    python3 ml/train.py

The Jupyter notebook (barber_grader.ipynb) will later overwrite the model
with a GridSearchCV-tuned version — run that for full coursework evaluation.
"""
import os
import random
import warnings
warnings.filterwarnings("ignore")

import pandas as pd
import numpy as np
import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, f1_score, classification_report

# ── Paths ──────────────────────────────────────────────────────────────────────
ROOT_DIR     = os.path.dirname(os.path.abspath(__file__))
DATASET_PATH = os.path.join(ROOT_DIR, "barber_dataset.csv")
MODEL_PATH   = os.path.join(ROOT_DIR, "barber_model.pkl")

random.seed(42)
np.random.seed(42)

# ── Skill definitions (must match evaluator.py exactly) ───────────────────────
BASIC_SKILLS    = ["classic", "machine"]
ADVANCED_SKILLS = ["fade", "beard", "razor", "scissors", "hair_tattoo", "waxing", "black_mask"]
EXPERT_SKILLS   = ["extensions", "coloring", "camouflage", "correction", "perm"]
SOFT_SKILLS     = ["consulting", "products"]
ALL_SKILLS      = BASIC_SKILLS + ADVANCED_SKILLS + EXPERT_SKILLS + SOFT_SKILLS

COURSES = [
    "Barbering Basics", "Fade Mastery", "Color Theory",
    "Beard Styling Pro", "Advanced Razor Techniques",
    "Men's Hair Design", "Salon Management",
]

# ── Canonical feature names (must match evaluator.py and notebook) ─────────────
FEATURES = [
    "exp_num", "skills_score", "education_score",
    "basic_skills_count", "adv_skills_count", "expert_skills_count",
    "total_skills_count", "soft_skills_count", "soft_skills_score",
]


# ── Dataset generation ─────────────────────────────────────────────────────────
def generate_dataset() -> pd.DataFrame:
    rows = []

    # ── Junior (25): 0 exp, basic + maybe 1 beginner-friendly advanced ─────────
    adv_beginner = ["fade", "beard", "scissors", "waxing"]
    for _ in range(25):
        skls = random.sample(BASIC_SKILLS + adv_beginner[:2], random.randint(1, 3))
        soft = random.sample(SOFT_SKILLS, 1) if random.random() < 0.15 else []
        skls = list(set(skls + soft))
        edu  = random.randint(0, 1)
        rows.append({
            "years_experience_cat": "0",
            "skills":               ",".join(skls),
            "education_count":      edu,
            "courses":              ",".join(random.sample(COURSES, min(edu, len(COURSES)))),
            "avg_rating":           round(random.uniform(3.0, 4.0), 1),
            "completed_bookings":   random.randint(0, 40),
            "label":                "Junior",
        })

    # ── Middle (25): mostly 1-3 yrs, 30% are 3-5 yr stagnant barbers ──────────
    for _ in range(25):
        pool    = BASIC_SKILLS + ADVANCED_SKILLS
        skls    = random.sample(pool, min(random.randint(2, 5), len(pool)))
        soft    = random.sample(SOFT_SKILLS, 1) if random.random() < 0.25 else []
        skls    = list(set(skls + soft))
        edu     = random.randint(0, 2)
        exp_cat = random.choices(["1-3", "3-5"], weights=[70, 30], k=1)[0]
        rows.append({
            "years_experience_cat": exp_cat,
            "skills":               ",".join(skls),
            "education_count":      edu,
            "courses":              ",".join(random.sample(COURSES, min(edu, len(COURSES)))),
            "avg_rating":           round(random.uniform(3.4, 4.3), 1),
            "completed_bookings":   random.randint(30, 200),
            "label":                "Middle",
        })

    # ── Senior (25): 3-10 yrs, advanced + some expert, 2-4 courses ────────────
    for _ in range(25):
        pool = ADVANCED_SKILLS + EXPERT_SKILLS[:4]  # perm reserved mainly for Top
        skls = random.sample(pool, min(random.randint(4, 7), len(pool)))
        if random.random() > 0.5:
            skls += random.sample(BASIC_SKILLS, 1)
        soft = random.sample(SOFT_SKILLS, random.randint(0, 2)) if random.random() < 0.4 else []
        skls = list(set(skls + soft))
        edu  = random.randint(2, 4)
        rows.append({
            "years_experience_cat": random.choice(["3-5", "5-10"]),
            "skills":               ",".join(skls),
            "education_count":      edu,
            "courses":              ",".join(random.sample(COURSES, min(edu, len(COURSES)))),
            "avg_rating":           round(random.uniform(4.0, 5.0), 1),
            "completed_bookings":   random.randint(150, 350),
            "label":                "Senior",
        })

    # ── Top (25): 5-10+ yrs, MUST have specialist skills ─────────────────────
    for _ in range(25):
        expert_skls = random.sample(EXPERT_SKILLS, random.randint(2, len(EXPERT_SKILLS)))
        adv_skls    = random.sample(ADVANCED_SKILLS, random.randint(2, len(ADVANCED_SKILLS)))
        basic_skls  = random.sample(BASIC_SKILLS, random.randint(1, len(BASIC_SKILLS)))
        soft_skls   = random.sample(SOFT_SKILLS, random.randint(1, len(SOFT_SKILLS)))
        skls        = list(set(expert_skls + adv_skls + basic_skls + soft_skls))
        edu         = random.randint(3, len(COURSES))
        rows.append({
            "years_experience_cat": random.choice(["5-10", "10+"]),
            "skills":               ",".join(skls),
            "education_count":      edu,
            "courses":              ",".join(random.sample(COURSES, min(edu, len(COURSES)))),
            "avg_rating":           round(random.uniform(4.3, 5.0), 1),
            "completed_bookings":   random.randint(250, 600),
            "label":                "Top",
        })

    # ── Borderline cases — at class boundaries for realistic confidence ─────────
    borderlines = [
        # Junior boundary cases
        {"years_experience_cat": "0",    "skills": "fade,beard,classic,machine",                         "education_count": 2, "avg_rating": 4.0, "completed_bookings": 28,  "courses": "Barbering Basics,Fade Mastery",                                                                                                          "label": "Junior"},
        {"years_experience_cat": "1-3",  "skills": "fade,machine",                                       "education_count": 0, "avg_rating": 3.4, "completed_bookings": 22,  "courses": "",                                                                                                                                       "label": "Junior"},
        # Middle cases
        {"years_experience_cat": "1-3",  "skills": "fade,beard,razor,coloring,extensions",               "education_count": 4, "avg_rating": 4.3, "completed_bookings": 140, "courses": "Barbering Basics,Fade Mastery,Color Theory,Beard Styling Pro",                                                                            "label": "Middle"},
        {"years_experience_cat": "1-3",  "skills": "fade,beard,razor,coloring,correction",               "education_count": 3, "avg_rating": 4.1, "completed_bookings": 125, "courses": "Barbering Basics,Fade Mastery,Advanced Razor Techniques",                                                                                 "label": "Middle"},
        {"years_experience_cat": "1-3",  "skills": "classic,machine",                                    "education_count": 1, "avg_rating": 3.8, "completed_bookings": 50,  "courses": "Barbering Basics",                                                                                                                       "label": "Middle"},
        # Senior boundary
        {"years_experience_cat": "3-5",  "skills": "fade,beard,coloring,classic",                        "education_count": 2, "avg_rating": 3.9, "completed_bookings": 130, "courses": "Barbering Basics,Fade Mastery",                                                                                                          "label": "Senior"},
        {"years_experience_cat": "5-10", "skills": "fade,beard,classic,machine",                         "education_count": 2, "avg_rating": 3.8, "completed_bookings": 140, "courses": "Barbering Basics,Color Theory",                                                                                                           "label": "Senior"},
        {"years_experience_cat": "3-5",  "skills": "coloring,correction,extensions,camouflage,classic",  "education_count": 4, "avg_rating": 4.5, "completed_bookings": 200, "courses": "Barbering Basics,Color Theory,Fade Mastery,Men's Hair Design",                                                                            "label": "Senior"},
        {"years_experience_cat": "3-5",  "skills": "fade,beard,razor,classic",                           "education_count": 2, "avg_rating": 4.1, "completed_bookings": 155, "courses": "Barbering Basics,Fade Mastery",                                                                                                          "label": "Middle"},
        {"years_experience_cat": "3-5",  "skills": "fade,beard,razor,coloring,machine",                  "education_count": 3, "avg_rating": 4.2, "completed_bookings": 190, "courses": "Barbering Basics,Fade Mastery,Color Theory",                                                                                             "label": "Senior"},
        # Top boundary
        {"years_experience_cat": "10+",  "skills": "fade,beard,coloring,correction,classic,machine",     "education_count": 3, "avg_rating": 4.4, "completed_bookings": 350, "courses": "Barbering Basics,Fade Mastery,Color Theory",                                                                                             "label": "Top"},
        {"years_experience_cat": "10+",  "skills": "fade,beard,razor,coloring,classic",                  "education_count": 4, "avg_rating": 4.5, "completed_bookings": 360, "courses": "Barbering Basics,Fade Mastery,Color Theory,Beard Styling Pro",                                                                            "label": "Senior"},
        {"years_experience_cat": "10+",  "skills": "fade,beard,razor,coloring,correction,extensions,camouflage,classic,machine", "education_count": 7, "avg_rating": 5.0, "completed_bookings": 580, "courses": "Barbering Basics,Fade Mastery,Color Theory,Beard Styling Pro,Advanced Razor Techniques,Men's Hair Design,Salon Management", "label": "Top"},
        {"years_experience_cat": "1-3",  "skills": "fade,beard,razor,coloring",                          "education_count": 2, "avg_rating": 4.0, "completed_bookings": 100, "courses": "Barbering Basics,Fade Mastery",                                                                                                          "label": "Middle"},
        {"years_experience_cat": "5-10", "skills": "fade,beard,razor,coloring,extensions",               "education_count": 3, "avg_rating": 4.3, "completed_bookings": 260, "courses": "Barbering Basics,Fade Mastery,Color Theory",                                                                                             "label": "Senior"},
        # Stagnant barbers — experienced but never expanded beyond basics
        {"years_experience_cat": "5-10", "skills": "classic,machine",                                    "education_count": 1, "avg_rating": 3.5, "completed_bookings": 280, "courses": "Barbering Basics",                                                                                                                       "label": "Middle"},
        {"years_experience_cat": "5-10", "skills": "classic,machine,fade",                               "education_count": 1, "avg_rating": 3.8, "completed_bookings": 320, "courses": "Barbering Basics",                                                                                                                       "label": "Middle"},
        {"years_experience_cat": "10+",  "skills": "classic,machine,fade",                               "education_count": 2, "avg_rating": 3.7, "completed_bookings": 480, "courses": "Barbering Basics,Fade Mastery",                                                                                                          "label": "Middle"},
        {"years_experience_cat": "3-5",  "skills": "classic,machine",                                    "education_count": 0, "avg_rating": 3.4, "completed_bookings": 120, "courses": "",                                                                                                                                       "label": "Middle"},
        # Senior plateau — advanced skills but no specialist → blocked from Top
        {"years_experience_cat": "5-10", "skills": "classic,machine,fade,beard,razor",                   "education_count": 2, "avg_rating": 4.1, "completed_bookings": 360, "courses": "Barbering Basics,Fade Mastery",                                                                                                          "label": "Senior"},
        {"years_experience_cat": "10+",  "skills": "classic,machine,fade,beard",                         "education_count": 2, "avg_rating": 4.0, "completed_bookings": 420, "courses": "Barbering Basics,Color Theory",                                                                                                           "label": "Senior"},
        {"years_experience_cat": "10+",  "skills": "classic,machine,fade,beard,razor",                   "education_count": 3, "avg_rating": 4.2, "completed_bookings": 530, "courses": "Barbering Basics,Fade Mastery,Beard Styling Pro",                                                                                         "label": "Senior"},
        # Top via skills — 5-10 yrs but strong specialist portfolio
        {"years_experience_cat": "5-10", "skills": "classic,machine,fade,beard,razor,coloring,correction","education_count": 4, "avg_rating": 4.5, "completed_bookings": 380, "courses": "Barbering Basics,Fade Mastery,Color Theory,Beard Styling Pro",                                                                           "label": "Top"},
        # ── NEW: Trending KZ services (2024-2025) ─────────────────────────────
        # Middle with trending services — waxing, hair tattoo, scissors, face treatment
        {"years_experience_cat": "1-3",  "skills": "classic,machine,waxing,black_mask,scissors",                                                    "education_count": 1, "avg_rating": 4.0, "completed_bookings": 60,  "courses": "Barbering Basics",                                                                       "label": "Middle"},
        # Senior with trending advanced skills
        {"years_experience_cat": "3-5",  "skills": "classic,fade,beard,waxing,hair_tattoo,scissors",                                                 "education_count": 2, "avg_rating": 4.2, "completed_bookings": 160, "courses": "Barbering Basics,Fade Mastery",                                                           "label": "Senior"},
        # Chemical perm alone ≠ Top — needs full specialist portfolio
        {"years_experience_cat": "5-10", "skills": "classic,fade,beard,perm,waxing",                                                                 "education_count": 3, "avg_rating": 4.3, "completed_bookings": 290, "courses": "Barbering Basics,Fade Mastery,Color Theory",                                              "label": "Senior"},
        # Soft skills alone don't push level — Middle with consulting only
        {"years_experience_cat": "1-3",  "skills": "classic,machine,consulting,products",                                                            "education_count": 1, "avg_rating": 3.9, "completed_bookings": 55,  "courses": "Barbering Basics",                                                                       "label": "Middle"},
        # Complete Master — all categories including perm, trending, soft skills
        {"years_experience_cat": "10+",  "skills": "classic,machine,fade,beard,razor,scissors,hair_tattoo,waxing,black_mask,coloring,correction,extensions,camouflage,perm,consulting,products", "education_count": 7, "avg_rating": 5.0, "completed_bookings": 600, "courses": "Barbering Basics,Fade Mastery,Color Theory,Beard Styling Pro,Advanced Razor Techniques,Men's Hair Design,Salon Management", "label": "Top"},
        # Senior with trending + specialist (no perm, no camouflage) + consulting
        {"years_experience_cat": "5-10", "skills": "classic,machine,fade,beard,scissors,waxing,hair_tattoo,black_mask,coloring,consulting",           "education_count": 4, "avg_rating": 4.4, "completed_bookings": 320, "courses": "Barbering Basics,Fade Mastery,Color Theory,Beard Styling Pro",                         "label": "Senior"},
        # Top via chemical perm + coloring + correction (expert_c=3 ≥ 2 → qualifies)
        {"years_experience_cat": "5-10", "skills": "classic,machine,fade,beard,razor,scissors,perm,coloring,correction,consulting,products",          "education_count": 5, "avg_rating": 4.6, "completed_bookings": 400, "courses": "Barbering Basics,Fade Mastery,Color Theory,Beard Styling Pro,Advanced Razor Techniques",  "label": "Top"},
        # Stagnant with trending services only — still Middle
        {"years_experience_cat": "5-10", "skills": "classic,machine,waxing,black_mask",                                                              "education_count": 1, "avg_rating": 3.8, "completed_bookings": 300, "courses": "Barbering Basics",                                                                       "label": "Middle"},
    ]

    rows.extend(borderlines)
    random.shuffle(rows)
    return pd.DataFrame(rows)


# ── Feature engineering (must match evaluator.py exactly) ─────────────────────
def build_features(df: pd.DataFrame) -> pd.DataFrame:
    def skills_score(s):
        if pd.isna(s) or s == "":
            return 0
        total = 0
        for sk in s.split(","):
            sk = sk.strip()
            if sk in BASIC_SKILLS:      total += 1
            elif sk in ADVANCED_SKILLS: total += 3
            elif sk in EXPERT_SKILLS:   total += 5
        return total

    def skill_cnt(s, cat):
        if pd.isna(s) or s == "":
            return 0
        return sum(1 for sk in s.split(",") if sk.strip() in cat)

    out = df.copy()
    out["exp_num"]             = out["years_experience_cat"].map(
        {"0": 0, "1-3": 1, "3-5": 2, "5-10": 3, "10+": 4}
    )
    out["skills_score"]        = out["skills"].apply(skills_score)
    out["education_score"]     = out["education_count"] * 2
    out["basic_skills_count"]  = out["skills"].apply(lambda x: skill_cnt(x, BASIC_SKILLS))
    out["adv_skills_count"]    = out["skills"].apply(lambda x: skill_cnt(x, ADVANCED_SKILLS))
    out["expert_skills_count"] = out["skills"].apply(lambda x: skill_cnt(x, EXPERT_SKILLS))
    out["total_skills_count"]  = (
        out["basic_skills_count"] + out["adv_skills_count"] + out["expert_skills_count"]
    )
    out["soft_skills_count"]   = out["skills"].apply(lambda x: skill_cnt(x, SOFT_SKILLS))
    out["soft_skills_score"]   = out["soft_skills_count"] * 2
    # avg_rating and completed_bookings remain in CSV for documentation
    # but are excluded from model features (not available at hiring/grading time)
    return out


# ── Main training ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("=== Barber Grader — Bootstrap Training ===\n")

    # 1. Generate and save dataset
    df = generate_dataset()
    df.to_csv(DATASET_PATH, index=False)
    print(f"Dataset saved: {len(df)} rows")
    print(df["label"].value_counts().to_string())

    # 2. Feature engineering
    df = build_features(df)
    X  = df[FEATURES]
    y  = df["label"]

    # 3. Train / test split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    # 4. Train RandomForest
    rf = RandomForestClassifier(n_estimators=100, random_state=42)
    rf.fit(X_train, y_train)

    # 5. Evaluate
    preds  = rf.predict(X_test)
    acc    = accuracy_score(y_test, preds)
    f1     = f1_score(y_test, preds, average="weighted")
    print(f"\nTest accuracy : {acc:.2%}")
    print(f"Weighted F1   : {f1:.2%}")
    print("\nClassification report:")
    print(classification_report(y_test, preds))

    # 6. Save model
    joblib.dump(rf, MODEL_PATH)
    print(f"Model saved: {MODEL_PATH}")
    print("\nDone. You can now start the API server.")
    print("Run ml/barber_grader.ipynb for full GridSearchCV training + visualizations.")
