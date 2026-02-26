"""
Excel parser for attendance log uploads.

Supports standard formats and Parsec ACS exports (Parsec PERCo/NC-8000 systems).

Expected columns (case-insensitive, any of the aliases):
  ФИО / full_name / name / субъект / subject
  Время / event_time / time / datetime / дата/время
  Событие / event_type / type
  Точка / checkpoint / источник / source
"""

from __future__ import annotations

import logging
from typing import IO

import pandas as pd
from pydantic import ValidationError

from app.schemas.attendance import AttendanceRecord

logger = logging.getLogger(__name__)

COLUMN_ALIASES: dict[str, list[str]] = {
    "raw_name": [
        "фио", "full_name", "name", "имя", "сотрудник",
        "субъект", "subject",
    ],
    "event_time": [
        "время", "event_time", "time", "datetime",
        "дата_время", "дата/время",
    ],
    "event_type": [
        "событие", "event_type", "type", "тип", "тип события",
    ],
    "checkpoint": [
        "точка", "checkpoint", "point", "точка прохода",
        "источник", "source", "область",
    ],
}

# Flat set of all known aliases — used for header row detection
_ALL_ALIASES: frozenset[str] = frozenset(
    alias for aliases in COLUMN_ALIASES.values() for alias in aliases
)

EVENT_TYPE_MAP: dict[str, str] = {
    # Standard Russian
    "вход": "entry",
    "вход (инициировано картой)": "entry",
    "выход": "exit",
    "выход (инициировано картой)": "exit",
    # English
    "entry": "entry",
    "exit": "exit",
    "in": "entry",
    "out": "exit",
    # Parsec ACS exports
    "нормальный вход по ключу": "entry",
    "нормальный выход по ключу": "exit",
    "нормальный вход": "entry",
    "нормальный выход": "exit",
    "вход по ключу": "entry",
    "выход по ключу": "exit",
    "считывание карты на входе": "entry",
    "считывание карты на выходе": "exit",
    "открытие двери на вход": "entry",
    "открытие двери на выход": "exit",
}

# Все системные события СКУД — пропускаем (не считаем проходами)
_SKIP_EVENTS: frozenset[str] = frozenset({
    "нет входа - идентификатора нет в бд",
    "нет выхода по временному профилю",
    "нет выхода - идентификатора нет в бд",
    "нет входа по временному профилю",
    "нет входа - нет разрешения",
    "нет выхода - нет разрешения",
    "изменена/назначена фотография",
    'изменение объекта "идентификатор"',
    'изменение объекта "персона"',
    'создание объекта "идентификатор"',
    'создание объекта "персона"',
    "занесение данных пользователя",
    "удаление объекта",
    "изменение прав доступа",
})

# Только эти события показываем в отчёте (нет входа/нет выхода); остальные — тихо пропускаем
_SKIP_EVENTS_REPORT: frozenset[str] = frozenset({
    "нет входа - идентификатора нет в бд",
    "нет выхода по временному профилю",
    "нет выхода - идентификатора нет в бд",
    "нет входа по временному профилю",
    "нет входа - нет разрешения",
    "нет выхода - нет разрешения",
})


def _find_header_row(file: IO[bytes]) -> int:
    """
    Scan the first 20 rows looking for the one that contains the most
    column-alias matches.  Returns the 0-based row index to pass as
    ``header=`` to ``pd.read_excel``.
    """
    try:
        probe = pd.read_excel(file, engine="openpyxl", dtype=str, nrows=20, header=None)
    except Exception:
        return 0
    finally:
        # Always reset so the caller can read the file again
        try:
            file.seek(0)
        except Exception:
            pass

    best_row, best_score = 0, 0
    for row_idx, row in probe.iterrows():
        score = sum(
            1 for cell in row
            if isinstance(cell, str) and cell.lower().strip() in _ALL_ALIASES
        )
        if score > best_score:
            best_score = score
            best_row = int(row_idx)

    return best_row if best_score >= 2 else 0


def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Rename DataFrame columns to canonical names using COLUMN_ALIASES."""
    lower_cols = {str(c).lower().strip(): c for c in df.columns}
    rename_map: dict[str, str] = {}
    for canonical, aliases in COLUMN_ALIASES.items():
        for alias in aliases:
            if alias in lower_cols:
                rename_map[lower_cols[alias]] = canonical
                break
    return df.rename(columns=rename_map)


def _clean_cell(value: str) -> str:
    """Normalize pandas NaN placeholders to empty string."""
    return "" if value.lower() in ("nan", "none", "nat") else value


def _is_repeated_header(event_time_value: str) -> bool:
    """Return True if the cell value looks like a repeated header row."""
    return event_time_value.lower().strip() in _ALL_ALIASES


def parse_excel(
    file: IO[bytes],
) -> tuple[list[AttendanceRecord], list[str], list[str]]:
    """
    Parse an Excel file and return (valid_records, error_messages, skipped_system_events).

    skipped_system_events — только строки «нет входа»/«нет выхода» (отказ доступа и т.п.);
    остальные системные события (создание персон, фото и т.д.) пропускаются без записи в отчёт.
    """
    header_row = _find_header_row(file)

    try:
        df = pd.read_excel(file, engine="openpyxl", dtype=str, header=header_row)
    except Exception as exc:
        return [], [f"Не удалось открыть файл: {exc}"], []

    df = _normalize_columns(df)

    missing = [
        c for c in ("raw_name", "event_time", "event_type", "checkpoint")
        if c not in df.columns
    ]
    if missing:
        return [], [f"Отсутствуют обязательные колонки: {', '.join(missing)}"], []

    valid_records: list[AttendanceRecord] = []
    errors: list[str] = []
    skipped_system_events: list[str] = []

    # header_row is 0-based; visible row numbers start at 1, and the header
    # itself takes one row, so data rows start at header_row + 2 (1-indexed)
    data_row_offset = header_row + 2

    skipped_empty = 0
    skipped_header = 0
    skipped_system = 0

    for i, row in enumerate(df.itertuples(index=False), start=data_row_offset):
        raw_name = _clean_cell(str(getattr(row, "raw_name", "") or "").strip())
        raw_time = _clean_cell(str(getattr(row, "event_time", "") or "").strip())
        raw_type = _clean_cell(str(getattr(row, "event_type", "") or "").strip())
        raw_checkpoint = _clean_cell(str(getattr(row, "checkpoint", "") or "").strip())

        # Skip fully-empty rows silently
        if not raw_name and not raw_time and not raw_type:
            skipped_empty += 1
            continue

        # Skip rows that are repeated header rows (e.g. Parsec per-employee sections)
        if _is_repeated_header(raw_time):
            skipped_header += 1
            logger.debug("Строка %d: повторный заголовок, пропуск (event_time='%s')", i, raw_time)
            continue

        # Skip known system / admin events — не добавляем в БД
        if raw_type.lower() in _SKIP_EVENTS:
            skipped_system += 1
            # В отчёт попадают только события "нет входа/нет выхода"
            if raw_type.lower() in _SKIP_EVENTS_REPORT:
                msg = f"Строка {i}: {raw_type}" + (f" (ФИО: {raw_name})" if raw_name else "")
                skipped_system_events.append(msg)
            logger.debug(
                "Строка %d: системное событие, пропуск (имя='%s', тип='%s')",
                i, raw_name, raw_type,
            )
            continue

        # Parse datetime
        try:
            event_time = pd.to_datetime(raw_time, dayfirst=True)
            if pd.isna(event_time):
                raise ValueError("empty or unparseable date")
        except Exception:
            msg = f"Строка {i}: некорректный формат даты '{raw_time}'"
            logger.warning("Пропуск — %s (имя='%s')", msg, raw_name)
            errors.append(msg)
            continue

        # Normalise event type
        event_type_norm = EVENT_TYPE_MAP.get(raw_type.lower())
        if event_type_norm is None:
            msg = (
                f"Строка {i}: неизвестный тип события '{raw_type}'. "
                "Допустимые значения: вход, выход, entry, exit, "
                "нормальный вход по ключу, нормальный выход по ключу"
            )
            logger.warning("Пропуск — %s (имя='%s')", msg, raw_name)
            errors.append(msg)
            continue

        try:
            record = AttendanceRecord(
                raw_name=raw_name,
                event_time=event_time.to_pydatetime(),
                event_type=event_type_norm,
                checkpoint=raw_checkpoint,
            )
            valid_records.append(record)
        except ValidationError as exc:
            for err in exc.errors():
                msg = f"Строка {i}: {err['loc'][0]} — {err['msg']}"
                logger.warning("Пропуск — %s (имя='%s')", msg, raw_name)
                errors.append(msg)

    logger.info(
        "Парсинг завершён: валидных=%d, ошибок=%d, пропущено_системных=%d "
        "(пустых=%d, заголовков=%d)",
        len(valid_records), len(errors), skipped_system,
        skipped_empty, skipped_header,
    )
    return valid_records, errors, skipped_system_events
