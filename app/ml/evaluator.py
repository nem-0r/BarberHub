from pathlib import Path
from typing import List

# joblib and pandas are imported lazily to stay within the Render Free memory budget.

_ML_DIR = Path(__file__).parent.parent.parent / "ml"
MODEL_PATH = _ML_DIR / "barber_model.pkl"

BASIC_SKILLS = frozenset(["classic", "machine"])
ADVANCED_SKILLS = frozenset(
    ["fade", "beard", "razor", "scissors", "hair_tattoo", "waxing", "black_mask"]
)
EXPERT_SKILLS = frozenset(
    ["extensions", "coloring", "camouflage", "correction", "perm"]
)
SOFT_SKILLS = frozenset(["consulting", "products"])

EXP_MAP = {"0": 0, "1-3": 1, "3-5": 2, "5-10": 3, "10+": 4}

FEATURES = [
    "exp_num",
    "skills_score",
    "education_score",
    "basic_skills_count",
    "adv_skills_count",
    "expert_skills_count",
    "total_skills_count",
    "soft_skills_count",
    "soft_skills_score",
]

ROLE_NAMES = {
    "Junior": "Junior Barber",
    "Middle": "Barber",
    "Senior": "Senior Barber",
    "Top": "Master Barber",
}

NEXT_LEVEL = {
    "Junior": "Middle",
    "Middle": "Senior",
    "Senior": "Top",
    "Top": None,
}

# KZT/month salary ranges — hh.kz data, Almaty/Astana market 2024-2025
SALARY_RANGES = {
    "Junior": (80_000, 150_000),
    "Middle": (150_000, 300_000),
    "Senior": (300_000, 500_000),
    "Top": (500_000, 1_000_000),
}
SALARY_CURRENCY = "KZT"
SALARY_PERIOD = "month"

TIPS = {
    "Junior": [
        "Gain 1–3 years of hands-on professional experience",
        "Master fade, beard sculpting, straight razor, and scissors techniques",
        "Learn trending services: waxing and face treatments are in high demand in KZ",
        "Complete at least 1 professional certification course",
    ],
    "Middle": [
        "Expand your skillset to 6+ techniques including trending services (waxing, hair tattoo, face treatments)",
        "Start offering specialist services: coloring, hair extensions, or chemical perm",
        "Develop style consulting to increase client retention",
        "Complete 3+ professional courses",
        "Build a track record of 150+ completed bookings",
    ],
    "Senior": [
        "Master all specialist services (coloring, camouflage, correction, extensions, chemical perm)",
        "Add client service skills: style consulting and product knowledge",
        "Complete 5+ advanced professional courses",
        "Reach 300+ completed bookings",
    ],
    "Top": ["You have reached the highest level — consider mentoring junior barbers!"],
}

LEVEL_ORDER = ["Junior", "Middle", "Senior", "Top"]
EXPERIENCE_MAX_LEVEL = {
    "0": "Junior",
    "1-3": "Middle",
    "3-5": "Senior",
    "5-10": "Top",
    "10+": "Top",
}

# Minimum skill requirements per level.
SKILL_FLOOR = {
    "Senior": {"adv_min": 2, "expert_min": 0},
    "Top": {"adv_min": 2, "expert_min": 2},
}

_model = None


def _load():
    global _model
    if _model is None:
        if not MODEL_PATH.exists():
            raise FileNotFoundError(
                f"Model not found at {MODEL_PATH}. "
                "Run 'python3 ml/train.py' first to generate it."
            )
        import joblib  # lazy import

        _model = joblib.load(MODEL_PATH)
    return _model


def predict(years_exp_cat: str, skills: List[str], education_count: int) -> dict:
    model = _load()
    skills_set = frozenset(skills)

    exp_num = EXP_MAP.get(years_exp_cat, 0)
    basic_c = len(skills_set & BASIC_SKILLS)
    adv_c = len(skills_set & ADVANCED_SKILLS)
    expert_c = len(skills_set & EXPERT_SKILLS)
    soft_c = len(skills_set & SOFT_SKILLS)
    total_c = basic_c + adv_c + expert_c
    skills_score = basic_c * 1 + adv_c * 3 + expert_c * 5
    soft_score = soft_c * 2
    edu_score = education_count * 2

    max_basic = len(BASIC_SKILLS)
    max_adv = len(ADVANCED_SKILLS)
    max_expert = len(EXPERT_SKILLS)
    max_soft = len(SOFT_SKILLS)
    max_score = max_basic * 1 + max_adv * 3 + max_expert * 5

    radar_data = [
        {"skill": "Foundation", "value": round((basic_c / max_basic) * 100)},
        {"skill": "Advanced", "value": round((adv_c / max_adv) * 100)},
        {"skill": "Expert", "value": round((expert_c / max_expert) * 100)},
        {"skill": "Experience", "value": round((exp_num / 4) * 100)},
        {"skill": "Education", "value": round((min(education_count, 7) / 7) * 100)},
        {"skill": "Client Service", "value": round((soft_c / max_soft) * 100)},
    ]

    # Require at least one foundation skill.
    if basic_c == 0:
        return {
            "role": "Not Qualified",
            "level": "Unqualified",
            "confidence": 0.0,
            "salary_min": 0,
            "salary_max": 0,
            "salary_currency": SALARY_CURRENCY,
            "salary_period": SALARY_PERIOD,
            "reasoning": [
                "No foundation skills selected — Classic Haircut or Clipper Cut is required for any barber role",
                f"{total_c} advanced/specialist skill(s) detected but cannot qualify without foundation competency",
                "Even the most specialized barber must demonstrate basic haircut ability",
            ],
            "radar_data": radar_data,
            "next_level": "Junior",
            "tips": [
                "Select at least Classic Haircut or Clipper Cut to qualify for any barber role",
                "Foundation skills are the professional baseline — master these before advanced techniques",
            ],
        }

    import pandas as pd  # lazy import

    X = pd.DataFrame(
        [
            [
                exp_num,
                skills_score,
                edu_score,
                basic_c,
                adv_c,
                expert_c,
                total_c,
                soft_c,
                soft_score,
            ]
        ],
        columns=FEATURES,
    )

    level = model.predict(X)[0]
    proba = model.predict_proba(X)[0]
    confidence = round(float(proba.max()) * 100, 1)

    # Cap predicted level to what the candidate's experience allows.
    max_level = EXPERIENCE_MAX_LEVEL.get(years_exp_cat, "Junior")
    original_lvl = level
    if LEVEL_ORDER.index(level) > LEVEL_ORDER.index(max_level):
        level = max_level
        confidence = round(confidence * 0.75, 1)

    reasoning = [
        f"{years_exp_cat} year(s) of professional experience",
        f"{total_c} technical skills: {basic_c} foundation, {adv_c} advanced, {expert_c} specialist",
        f"Skills complexity score: {skills_score} / {max_score}",
        f"{education_count} professional course{'s' if education_count != 1 else ''} completed",
    ]

    if soft_c > 0:
        soft_names = ", ".join(sorted(skills_set & SOFT_SKILLS))
        reasoning.append(
            f"{soft_c} client service skill{'s' if soft_c != 1 else ''} ({soft_names}) — "
            "contributes to overall profile score"
        )

    if original_lvl != level:
        reasoning.append(
            f"⚠️ Level adjusted from {original_lvl} to {max_level}: "
            f"{years_exp_cat} year(s) of experience is insufficient for {original_lvl} — "
            "professional mastery requires sustained hands-on practice over time"
        )

    # Apply skill floor after experience cap.
    if level in SKILL_FLOOR:
        req = SKILL_FLOOR[level]
        adv_ok = adv_c >= req["adv_min"]
        expert_ok = expert_c >= req["expert_min"]

        if not adv_ok or not expert_ok:
            original_lvl = level
            level = "Senior" if level == "Top" else "Middle"
            confidence = round(confidence * 0.8, 1)

            needs = []
            if not adv_ok:
                needs.append(
                    f"{req['adv_min'] - adv_c} more advanced skill(s) "
                    f"(fade, beard, razor, scissors, hair tattoo or waxing — currently have {adv_c})"
                )
            if not expert_ok:
                needs.append(
                    f"{req['expert_min'] - expert_c} more specialist skill(s) "
                    f"(coloring, correction, extensions, camouflage or chemical perm — currently have {expert_c})"
                )
            reasoning.append(
                f"⚠️ Skills check: {original_lvl} requires {' and '.join(needs)} — "
                f"adjusted to {level}"
            )

    s_min, s_max = SALARY_RANGES[level]

    return {
        "role": ROLE_NAMES[level],
        "level": level,
        "confidence": confidence,
        "salary_min": s_min,
        "salary_max": s_max,
        "salary_currency": SALARY_CURRENCY,
        "salary_period": SALARY_PERIOD,
        "reasoning": reasoning,
        "radar_data": radar_data,
        "next_level": NEXT_LEVEL[level],
        "tips": TIPS[level],
    }
