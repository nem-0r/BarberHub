from pydantic import BaseModel, Field
from typing import List, Optional


class BarberEvalRequest(BaseModel):
    years_experience_cat: str = Field(
        ..., description="Experience bracket: '0' | '1-3' | '3-5' | '5-10' | '10+'"
    )
    skills: List[str] = Field(
        ...,
        description="Skill IDs: classic, machine, fade, beard, razor, coloring, correction, extensions, camouflage",
    )
    education_count: int = Field(
        0,
        ge=0,
        le=20,
        description="Number of completed professional courses (recency-adjusted by frontend)",
    )


class RadarPoint(BaseModel):
    skill: str
    value: float


class BarberEvalResponse(BaseModel):
    role: str
    level: str
    confidence: float
    salary_min: int
    salary_max: int
    salary_currency: str = "KZT"
    salary_period: str = "month"
    reasoning: List[str]
    radar_data: List[RadarPoint]
    next_level: Optional[str]
    tips: List[str]
