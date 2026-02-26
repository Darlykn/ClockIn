import io
import logging
import math
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, status
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.middleware import get_current_user, require_role
from app.db.models import AttendanceLog, ImportHistory, User
from app.db.session import get_db
from app.schemas.attendance import ImportResultResponse
from app.services.excel_parser import parse_excel
from app.services.fuzzy_matcher import find_or_create_employee

logger = logging.getLogger(__name__)

router = APIRouter()

_ALLOWED_EXTENSIONS = {".xlsx", ".xls"}


def _file_extension(filename: str | None) -> str:
    if not filename:
        return ""
    idx = filename.rfind(".")
    return filename[idx:].lower() if idx != -1 else ""


@router.post(
    "/upload",
    response_model=ImportResultResponse,
    summary="Upload attendance Excel file",
)
async def upload_file(
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
) -> ImportResultResponse:
    ext = _file_extension(file.filename)
    logger.info("Загрузка файла: '%s' (расширение: '%s', пользователь: %s)", file.filename, ext, current_user.id)

    if ext not in _ALLOWED_EXTENSIONS:
        logger.warning(
            "Отклонён файл '%s': недопустимое расширение '%s'", file.filename, ext
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(_ALLOWED_EXTENSIONS)}",
        )

    content = await file.read()
    records, errors, skipped_events = parse_excel(io.BytesIO(content))

    logger.info(
        "Парсинг '%s': записей=%d, ошибок=%d, пропущено системных событий=%d",
        file.filename, len(records), len(errors), len(skipped_events),
    )
    if errors:
        for err_msg in errors:
            logger.warning("Ошибка парсинга [%s]: %s", file.filename, err_msg)
    if skipped_events:
        for msg in skipped_events[:5]:
            logger.info("Пропущено системное событие [%s]: %s", file.filename, msg)
        if len(skipped_events) > 5:
            logger.info("... и ещё %d пропущенных системных событий", len(skipped_events) - 5)

    # Всего строк = валидные + ошибки + пропущенные системные события (чтобы "всего" >= "добавлено")
    total = len(records) + len(errors) + len(skipped_events)
    inserted = 0
    skipped = 0

    name_cache: dict[str, object] = {}

    if records:
        rows = []
        for rec in records:
            emp_id = await find_or_create_employee(rec.raw_name, db, name_cache)
            rows.append(
                {
                    "employee_id": emp_id,
                    "raw_name": rec.raw_name,
                    "event_time": rec.event_time,
                    "event_type": rec.event_type,
                    "checkpoint": rec.checkpoint,
                }
            )

        stmt = pg_insert(AttendanceLog).values(rows)
        stmt = stmt.on_conflict_do_nothing(constraint="uq_attendance_dedup")
        result = await db.execute(stmt)
        inserted = result.rowcount
        skipped = len(rows) - inserted

        if skipped > 0:
            logger.info(
                "Дубликаты в '%s': %d строк пропущено (уже существуют в БД по ограничению uq_attendance_dedup)",
                file.filename, skipped,
            )
        logger.info(
            "Вставка в БД [%s]: добавлено=%d, дубликатов=%d, всего подготовлено=%d",
            file.filename, inserted, skipped, len(rows),
        )

    error_count = len(errors)
    if inserted == 0 and total > 0:
        import_status = "failed"
    elif error_count > 0 or skipped > 0:
        import_status = "partial"
    else:
        import_status = "success"

    logger.info(
        "Импорт завершён [%s]: статус=%s, всего=%d, добавлено=%d, дубликатов=%d, ошибок=%d",
        file.filename, import_status, total, inserted, skipped, error_count,
    )

    history = ImportHistory(
        filename=file.filename or "unknown",
        uploaded_by=current_user.id,
        uploaded_at=datetime.now(timezone.utc),
        status=import_status,
        logs={
            "total": total,
            "inserted": inserted,
            "skipped": skipped,
            "errors": errors[:100],
            "skipped_events": skipped_events[:100],
        },
    )
    db.add(history)
    await db.commit()

    return ImportResultResponse(
        filename=file.filename or "unknown",
        total=total,
        inserted_count=inserted,
        skipped=skipped,
        error_count=error_count,
        errors=errors,
        skipped_events=skipped_events,
        status=import_status,
    )


@router.get(
    "/history",
    summary="List import history (paginated)",
)
async def list_history(
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_role("admin")),
) -> dict:
    stmt = (
        select(ImportHistory)
        .options(selectinload(ImportHistory.uploader))
        .order_by(ImportHistory.uploaded_at.desc())
    )
    count_result = await db.execute(stmt)
    all_rows = count_result.scalars().all()
    total = len(all_rows)
    offset = (page - 1) * per_page
    page_rows = all_rows[offset : offset + per_page]

    items = [
        {
            "id": h.id,
            "filename": h.filename,
            "uploaded_by": str(h.uploaded_by) if h.uploaded_by else None,
            "uploaded_by_name": (h.uploader.full_name or h.uploader.username) if h.uploader else None,
            "uploaded_at": h.uploaded_at.isoformat(),
            "status": h.status,
            "logs": h.logs,
        }
        for h in page_rows
    ]

    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": math.ceil(total / per_page) if total > 0 else 1,
        "items": items,
    }
