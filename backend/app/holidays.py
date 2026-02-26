"""
Нерабочие дни по производственному календарю РФ.

Источник: isdayoff.ru API (официальные переносы и праздники).
При недоступности API или отключении используется локальный календарь.
"""

import asyncio
import logging
from calendar import isleap, monthrange
from datetime import date
from typing import Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

# --- Локальный календарь (fallback) ---

_FIXED_HOLIDAYS: set[tuple[int, int]] = {
    (2, 23), (3, 8), (5, 1), (5, 9), (6, 12), (11, 4), (12, 31),
}
_NEW_YEAR_END_BY_YEAR: dict[int, int] = {2026: 11}
_TRANSFERRED_DAY_OFF: set[tuple[int, int, int]] = {(2026, 3, 9)}


def _local_is_holiday(d: date) -> bool:
    """Нерабочий день по встроенному календарю (без API)."""
    y, month, day = d.year, d.month, d.day
    if (y, month, day) in _TRANSFERRED_DAY_OFF:
        return True
    if month == 1 and 1 <= day <= _NEW_YEAR_END_BY_YEAR.get(y, 8):
        return True
    if (month, day) in _FIXED_HOLIDAYS:
        return True
    return False


# --- Кэш и запрос к isdayoff.ru ---

# Коды: 0 — рабочий, 1 — нерабочий, 2 — сокращённый (считаем рабочим)
_api_cache: dict[tuple[int, int], list[int]] = {}


def _parse_year_response(text: str, year: int) -> Optional[dict[tuple[int, int], list[int]]]:
    """
    Парсит ответ API за год (365/366 символов подряд) и раскладывает
    по месяцам. Возвращает словарь (year, month) -> [коды дней] или None.
    """
    text = text.strip().replace("\r", "").replace("\n", "")
    total_days = 366 if isleap(year) else 365
    if len(text) < total_days:
        return None

    codes = [int(c) if c.isdigit() else 0 for c in text[:total_days]]
    result: dict[tuple[int, int], list[int]] = {}
    offset = 0
    for m in range(1, 13):
        _, last = monthrange(year, m)
        result[(year, m)] = codes[offset: offset + last]
        offset += last
    return result


def _parse_month_response(text: str, year: int, month: int) -> Optional[list[int]]:
    """Парсит ответ API за месяц → список кодов или None."""
    text = text.strip().replace("\r", "").replace("\n", "")
    _, last = monthrange(year, month)
    if len(text) < last:
        return None
    return [int(c) if c.isdigit() else 0 for c in text[:last]]


def _get_month_codes(year: int, month: int) -> Optional[list[int]]:
    """Кэш по (year, month); при промахе — синхронный запрос за один месяц."""
    key = (year, month)
    if key in _api_cache:
        return _api_cache[key]

    url = (
        f"{settings.PRODUCTION_CALENDAR_API_URL.rstrip('/')}"
        f"?year={year}&month={month}&cc=ru"
    )
    try:
        with httpx.Client(
            timeout=settings.PRODUCTION_CALENDAR_API_TIMEOUT_SEC,
            follow_redirects=True,
        ) as client:
            resp = client.get(url)
            resp.raise_for_status()
    except (httpx.HTTPError, httpx.TimeoutException) as exc:
        logger.warning("isdayoff.ru month request failed: %s", exc)
        return None

    codes = _parse_month_response(resp.text, year, month)
    if codes is not None:
        _api_cache[key] = codes
    return codes


def is_holiday(d: date) -> bool:
    """
    True, если день нерабочий по производственному календарю РФ
    (выходной или праздник, в т.ч. с учётом переносов).
    """
    if not settings.PRODUCTION_CALENDAR_API_ENABLED:
        return _local_is_holiday(d)

    codes = _get_month_codes(d.year, d.month)
    if codes is None:
        return _local_is_holiday(d)

    day_index = d.day - 1
    if day_index >= len(codes):
        return _local_is_holiday(d)
    return codes[day_index] == 1


async def _fetch_year_async(year: int) -> bool:
    """
    Загружает весь год одним запросом (?year=YYYY) и заполняет кэш по всем месяцам.
    Возвращает True при успехе.
    """
    url = (
        f"{settings.PRODUCTION_CALENDAR_API_URL.rstrip('/')}"
        f"?year={year}&cc=ru"
    )
    try:
        async with httpx.AsyncClient(
            timeout=settings.PRODUCTION_CALENDAR_API_TIMEOUT_SEC,
            follow_redirects=True,
        ) as client:
            resp = await client.get(url)
            resp.raise_for_status()
    except (httpx.HTTPError, httpx.TimeoutException) as exc:
        logger.warning("isdayoff.ru year=%d request failed: %s", year, exc)
        return False

    months_data = _parse_year_response(resp.text, year)
    if months_data is None:
        logger.warning("isdayoff.ru year=%d: unexpected response length", year)
        return False

    _api_cache.update(months_data)
    logger.info("Production calendar cached: year=%d (%d months)", year, len(months_data))
    return True


async def warm_cache_for_month(year: int, month: int) -> None:
    """
    Подгружает данные за месяц, если они ещё не в кэше.
    Вызывается в get_calendar перед построением ответа.
    """
    if not settings.PRODUCTION_CALENDAR_API_ENABLED:
        return
    if (year, month) in _api_cache:
        return
    # Сначала пробуем загрузить весь год (одним запросом)
    if not await _fetch_year_async(year):
        # Fallback: только нужный месяц
        _get_month_codes(year, month)


async def warm_cache_on_startup(years: Optional[list[int]] = None) -> None:
    """
    Подгружает производственный календарь при старте приложения.
    По умолчанию — текущий и следующий год (параллельно, 2 запроса).
    """
    if not settings.PRODUCTION_CALENDAR_API_ENABLED:
        return

    today = date.today()
    if years is None:
        years = [today.year, today.year + 1]

    # Пропускаем уже закэшированные годы (все 12 месяцев присутствуют)
    to_fetch = [
        y for y in years
        if any((y, m) not in _api_cache for m in range(1, 13))
    ]
    if not to_fetch:
        logger.info("Production calendar already cached for years: %s", years)
        return

    results = await asyncio.gather(
        *[_fetch_year_async(y) for y in to_fetch],
        return_exceptions=True,
    )
    for y, ok in zip(to_fetch, results):
        if ok is not True:
            logger.warning("Production calendar NOT cached for year=%d (will use fallback)", y)
