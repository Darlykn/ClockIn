# AttendTrack

Система учёта посещаемости сотрудников на основе данных СКУД (система контроля и управления доступом).

## Стек технологий

- **Backend**: FastAPI + SQLAlchemy (async) + Alembic
- **Database**: PostgreSQL 16
- **Frontend**: (Agent-Frontend)
- **Контейнеризация**: Docker Compose

## Быстрый старт

1. Скопировать `.env.example` → `.env` и при необходимости изменить значения:
   ```bash
   cp .env.example .env
   ```

2. Запустить контейнеры:
   ```bash
   docker-compose up --build
   ```

3. Healthcheck backend: [http://localhost:8000/health](http://localhost:8000/health)

4. (Опционально) Наполнить БД тестовыми данными:
   ```bash
   docker exec -it attendtrack-backend-1 python -m app.db.seed
   ```

## Структура проекта

```
/
├── backend/
│   ├── app/
│   │   ├── api/            # Роутеры FastAPI
│   │   ├── core/           # Config, Security
│   │   ├── db/             # Models, Session, Seed
│   │   ├── services/       # Business Logic
│   │   ├── schemas/        # Pydantic-схемы
│   │   └── main.py
│   ├── alembic/
│   ├── alembic.ini
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
├── docker-compose.yml
├── .env.example
└── .gitignore
```

## Переменные окружения

| Переменная | Описание |
|---|---|
| `POSTGRES_USER` | Пользователь PostgreSQL |
| `POSTGRES_PASSWORD` | Пароль PostgreSQL |
| `POSTGRES_DB` | Имя базы данных |
| `DATABASE_URL` | URL подключения (asyncpg) |
| `SECRET_KEY` | Секретный ключ для JWT |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Время жизни access-токена |
| `REFRESH_TOKEN_EXPIRE_HOURS` | Время жизни refresh-токена |
