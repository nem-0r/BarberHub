import logging
from fastapi import APIRouter, HTTPException, Depends, Request
from app.ml.schemas import BarberEvalRequest, BarberEvalResponse
import app.ml.evaluator as evaluator
from app.dependencies import get_current_user
from app.users.models import User
from app.limiter import limiter
from config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ml", tags=["ML"])


@router.post("/evaluate-barber", response_model=BarberEvalResponse, summary="Predict barber skill level")
@limiter.limit("10/minute;100/hour")
async def evaluate_barber(
    request: Request,
    payload: BarberEvalRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Predict a barber's skill level (Junior / Middle / Senior / Top)
    from their experience, skills, and completed courses.
    Returns level, confidence score, salary range, and improvement tips.

    Auth required: prediction runs a CPU model — gating it behind a logged-in
    user + rate limit prevents anonymous DoS / cost abuse.
    """
    try:
        result = evaluator.predict(
            years_exp_cat=payload.years_experience_cat,
            skills=payload.skills,
            education_count=payload.education_count,
        )
        return result
    except FileNotFoundError as exc:
        # Model artifact missing → infra issue, surface as 503 with the path
        # only in DEBUG so prod doesn't expose filesystem layout.
        logger.exception("[ml] model artifact missing: %s", exc)
        raise HTTPException(
            status_code=503,
            detail=str(exc) if settings.DEBUG else "Prediction service unavailable.",
        )
    except Exception as exc:
        # Full stack to logs; generic message to the client (matches main.py policy).
        logger.exception("[ml] prediction failed user=%s", current_user.id)
        raise HTTPException(
            status_code=500,
            detail=f"Prediction failed: {exc}" if settings.DEBUG else "Prediction failed.",
        )
