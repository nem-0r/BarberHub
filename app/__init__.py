def register_models() -> None:
    """Import all SQLModel modules so the metadata registry is fully populated.

    Called from main.py (FastAPI startup) and celery_app.py (worker bootstrap).
    Without this, Alembic autogenerate and any cross-table queries would miss
    tables whose modules haven't been imported yet.
    """
    import app.users.models  # noqa: F401
    import app.salons.models  # noqa: F401
    import app.staff.models  # noqa: F401
    import app.services.models  # noqa: F401
    import app.staff_services.models  # noqa: F401
    import app.schedules.models  # noqa: F401
    import app.bookings.models  # noqa: F401
    import app.reviews.models  # noqa: F401
