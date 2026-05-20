"""
Generates barber_dataset.csv (131 rows: 100 clean + 31 borderline).
Run standalone: python3 ml/generate_dataset.py
Also called automatically by ml/train.py.
"""
import os
import random
import pandas as pd
import numpy as np

random.seed(42)
np.random.seed(42)

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

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "barber_dataset.csv")


def generate():
    rows = []

    # Junior (25): 0 exp, basic + maybe 1 beginner-friendly advanced
    adv_beginner = ["fade", "beard", "scissors", "waxing"]
    for _ in range(25):
        skls = random.sample(BASIC_SKILLS + adv_beginner[:2], random.randint(1, 3))
        soft = random.sample(SOFT_SKILLS, 1) if random.random() < 0.15 else []
        skls = list(set(skls + soft))
        edu  = random.randint(0, 1)
        rows.append({
            "years_experience_cat": "0", "skills": ",".join(skls),
            "education_count": edu, "courses": ",".join(random.sample(COURSES, min(edu, len(COURSES)))),
            "avg_rating": round(random.uniform(3.0, 4.0), 1),
            "completed_bookings": random.randint(0, 40), "label": "Junior",
        })

    # Middle (25): 70% 1-3 yrs, 30% 3-5 yrs stagnant
    for _ in range(25):
        pool    = BASIC_SKILLS + ADVANCED_SKILLS
        skls    = random.sample(pool, min(random.randint(2, 5), len(pool)))
        soft    = random.sample(SOFT_SKILLS, 1) if random.random() < 0.25 else []
        skls    = list(set(skls + soft))
        edu     = random.randint(0, 2)
        exp_cat = random.choices(["1-3", "3-5"], weights=[70, 30], k=1)[0]
        rows.append({
            "years_experience_cat": exp_cat, "skills": ",".join(skls),
            "education_count": edu, "courses": ",".join(random.sample(COURSES, min(edu, len(COURSES)))),
            "avg_rating": round(random.uniform(3.4, 4.3), 1),
            "completed_bookings": random.randint(30, 200), "label": "Middle",
        })

    # Senior (25): 3-10 yrs, advanced + some expert, 2-4 courses
    for _ in range(25):
        pool = ADVANCED_SKILLS + EXPERT_SKILLS[:4]  # perm reserved mainly for Top
        skls = random.sample(pool, min(random.randint(4, 7), len(pool)))
        if random.random() > 0.5:
            skls += random.sample(BASIC_SKILLS, 1)
        soft = random.sample(SOFT_SKILLS, random.randint(0, 2)) if random.random() < 0.4 else []
        skls = list(set(skls + soft))
        edu  = random.randint(2, 4)
        rows.append({
            "years_experience_cat": random.choice(["3-5", "5-10"]), "skills": ",".join(skls),
            "education_count": edu, "courses": ",".join(random.sample(COURSES, min(edu, len(COURSES)))),
            "avg_rating": round(random.uniform(4.0, 5.0), 1),
            "completed_bookings": random.randint(150, 350), "label": "Senior",
        })

    # Top (25): 5-10+ yrs, MUST have specialist skills
    for _ in range(25):
        expert_skls = random.sample(EXPERT_SKILLS, random.randint(2, len(EXPERT_SKILLS)))
        adv_skls    = random.sample(ADVANCED_SKILLS, random.randint(2, len(ADVANCED_SKILLS)))
        basic_skls  = random.sample(BASIC_SKILLS, random.randint(1, len(BASIC_SKILLS)))
        soft_skls   = random.sample(SOFT_SKILLS, random.randint(1, len(SOFT_SKILLS)))
        skls        = list(set(expert_skls + adv_skls + basic_skls + soft_skls))
        edu         = random.randint(3, len(COURSES))
        rows.append({
            "years_experience_cat": random.choice(["5-10", "10+"]), "skills": ",".join(skls),
            "education_count": edu, "courses": ",".join(random.sample(COURSES, min(edu, len(COURSES)))),
            "avg_rating": round(random.uniform(4.3, 5.0), 1),
            "completed_bookings": random.randint(250, 600), "label": "Top",
        })

    # Borderline cases (31) — at decision boundaries for realistic confidence scores
    rows += [
        # Junior boundary
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
        # Middle with trending services
        {"years_experience_cat": "1-3",  "skills": "classic,machine,waxing,black_mask,scissors",                                                    "education_count": 1, "avg_rating": 4.0, "completed_bookings": 60,  "courses": "Barbering Basics",                                                                       "label": "Middle"},
        # Senior with trending advanced skills
        {"years_experience_cat": "3-5",  "skills": "classic,fade,beard,waxing,hair_tattoo,scissors",                                                 "education_count": 2, "avg_rating": 4.2, "completed_bookings": 160, "courses": "Barbering Basics,Fade Mastery",                                                           "label": "Senior"},
        # Chemical perm alone ≠ Top — needs full specialist portfolio
        {"years_experience_cat": "5-10", "skills": "classic,fade,beard,perm,waxing",                                                                 "education_count": 3, "avg_rating": 4.3, "completed_bookings": 290, "courses": "Barbering Basics,Fade Mastery,Color Theory",                                              "label": "Senior"},
        # Soft skills alone don't push level
        {"years_experience_cat": "1-3",  "skills": "classic,machine,consulting,products",                                                            "education_count": 1, "avg_rating": 3.9, "completed_bookings": 55,  "courses": "Barbering Basics",                                                                       "label": "Middle"},
        # Complete Master — all categories
        {"years_experience_cat": "10+",  "skills": "classic,machine,fade,beard,razor,scissors,hair_tattoo,waxing,black_mask,coloring,correction,extensions,camouflage,perm,consulting,products", "education_count": 7, "avg_rating": 5.0, "completed_bookings": 600, "courses": "Barbering Basics,Fade Mastery,Color Theory,Beard Styling Pro,Advanced Razor Techniques,Men's Hair Design,Salon Management", "label": "Top"},
        # Senior with trending + specialist (no perm, no camouflage) + consulting
        {"years_experience_cat": "5-10", "skills": "classic,machine,fade,beard,scissors,waxing,hair_tattoo,black_mask,coloring,consulting",           "education_count": 4, "avg_rating": 4.4, "completed_bookings": 320, "courses": "Barbering Basics,Fade Mastery,Color Theory,Beard Styling Pro",                         "label": "Senior"},
        # Top via chemical perm + coloring + correction (expert_c=3 ≥ 2)
        {"years_experience_cat": "5-10", "skills": "classic,machine,fade,beard,razor,scissors,perm,coloring,correction,consulting,products",          "education_count": 5, "avg_rating": 4.6, "completed_bookings": 400, "courses": "Barbering Basics,Fade Mastery,Color Theory,Beard Styling Pro,Advanced Razor Techniques",  "label": "Top"},
        # Stagnant with trending services only — still Middle
        {"years_experience_cat": "5-10", "skills": "classic,machine,waxing,black_mask",                                                              "education_count": 1, "avg_rating": 3.8, "completed_bookings": 300, "courses": "Barbering Basics",                                                                       "label": "Middle"},
    ]

    random.shuffle(rows)
    return pd.DataFrame(rows)


if __name__ == "__main__":
    df = generate()
    df.to_csv(OUT, index=False)
    print(f"Saved {len(df)} rows → {OUT}")
    print(df["label"].value_counts().to_string())
