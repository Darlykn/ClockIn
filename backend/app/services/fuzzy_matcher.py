"""
Fuzzy name matching service.

Maps raw ФИО strings from Excel to existing User records using
thefuzz.token_sort_ratio. Creates new employee users when no match
exceeds the configured threshold.
"""

import logging
import re
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from thefuzz import fuzz

from app.core.config import settings
from app.db.models import User

logger = logging.getLogger(__name__)

_ws_re = re.compile(r"\s+")


def _clean_name(raw: str) -> str:
    """Strip, collapse whitespace and title-case the name."""
    cleaned = _ws_re.sub(" ", raw.strip())
    return cleaned


async def find_or_create_employee(
    raw_name: str,
    db: AsyncSession,
    _cache: dict[str, uuid.UUID] | None = None,
) -> uuid.UUID:
    """
    Return employee_id for raw_name using fuzzy matching.

    Args:
        raw_name: Raw name string from Excel.
        db: Active async database session.
        _cache: Optional dict to cache name→id within a single import call.
                Pass the same dict for all rows in one file for efficiency.

    Returns:
        UUID of the matched or newly created employee.
    """
    cleaned = _clean_name(raw_name)

    if _cache is not None and cleaned in _cache:
        return _cache[cleaned]

    result = await db.execute(
        select(User.id, User.full_name).where(User.role == "employee")
    )
    employees = result.all()

    best_score = 0
    best_id: uuid.UUID | None = None

    for emp_id, emp_name in employees:
        if not emp_name:
            continue
        score = fuzz.token_sort_ratio(cleaned, emp_name)
        if score > best_score:
            best_score = score
            best_id = emp_id

    if best_score >= settings.FUZZY_MATCH_THRESHOLD and best_id is not None:
        logger.debug(
            "Совпадение найдено: '%s' → id=%s (score=%d, порог=%d)",
            cleaned, best_id, best_score, settings.FUZZY_MATCH_THRESHOLD,
        )
        if _cache is not None:
            _cache[cleaned] = best_id
        return best_id

    if employees:
        logger.info(
            "Сотрудник не найден: '%s' — лучший score=%d < порог=%d; создаётся новый пользователь",
            cleaned, best_score, settings.FUZZY_MATCH_THRESHOLD,
        )
    else:
        logger.info(
            "Сотрудник не найден: '%s' — в базе нет ни одного employee; создаётся новый пользователь",
            cleaned,
        )

    new_user = User(
        username=f"emp_{uuid.uuid4().hex[:8]}",
        password_hash="",
        role="employee",
        full_name=cleaned,
        is_active=True,
    )
    db.add(new_user)
    await db.flush()

    logger.info("Создан новый сотрудник: '%s' (id=%s)", cleaned, new_user.id)

    if _cache is not None:
        _cache[cleaned] = new_user.id

    return new_user.id
