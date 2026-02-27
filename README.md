# AttendTrack

Система учёта посещаемости сотрудников на основе данных СКУД (система контроля и управления доступом).  
Позволяет загружать Excel-отчёты из турникетов, автоматически сопоставлять сотрудников, строить статистику опозданий, переработок и пропусков.

---

## Содержание

- [Стек технологий](#стек-технологий)
- [Требования](#требования)
- [Быстрый старт — Docker (рекомендуется)](#быстрый-старт--docker-рекомендуется)
- [Запуск для разработки (без Docker)](#запуск-для-разработки-без-docker)
  - [Backend](#backend)
  - [Frontend](#frontend)
- [Переменные окружения](#переменные-окружения)
- [Первый вход и 2FA](#первый-вход-и-2fa)
- [Тестирование](#тестирование)
- [Структура проекта](#структура-проекта)
- [API-эндпоинты](#api-эндпоинты)
- [Роли пользователей](#роли-пользователей)

---

## Стек технологий

| Слой | Технологии |
|---|---|
| **Backend** | Python 3.11, FastAPI, SQLAlchemy (async), Alembic, Pydantic |
| **База данных** | PostgreSQL 16 |
| **Frontend** | React 19, TypeScript, Vite, Mantine UI, TanStack Query, ECharts |
| **Аутентификация** | JWT (access + refresh токены), TOTP 2FA (PyOTP) |
| **Парсинг данных** | Pandas, OpenPyXL, TheFuzz (нечёткое сопоставление имён) |
| **Контейнеризация** | Docker, Docker Compose, Nginx |

---

## Требования

### Для запуска через Docker (рекомендуется)

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (включает Docker Compose)
- Порты **8000**, **3000** и **5433** должны быть свободны

### Для запуска без Docker

- **Backend**: Python 3.11+, PostgreSQL 16
- **Frontend**: Node.js 18+, npm

---

## Быстрый старт — Docker (рекомендуется)

### 1. Клонировать репозиторий

```bash
git clone <url-репозитория>
cd AttendTrack
```

### 2. Создать файл окружения

```bash
# Linux / macOS
cp .env.example .env

# Windows PowerShell
Copy-Item .env.example .env
```

Откройте `.env` и при необходимости измените значения (особенно `SECRET_KEY` для продакшена):

```env
POSTGRES_USER=attend
POSTGRES_PASSWORD=attend_secret
POSTGRES_DB=attendtrack
DATABASE_URL=postgresql+asyncpg://attend:attend_secret@db:5432/attendtrack
SECRET_KEY=change-me-in-production
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_HOURS=24
DISABLE_2FA_FOR_TESTING=false
```

> **Важно:** `DISABLE_2FA_FOR_TESTING=false` означает, что 2FA включена.  
> Установите `true` только для разработки, чтобы входить без Google Authenticator.

### 3. Запустить контейнеры

```bash
docker-compose up --build
```

Первый запуск занимает несколько минут (сборка образов, установка зависимостей).  
При последующих запусках используйте `docker-compose up` без `--build`.

### 4. Проверить, что всё работает

| Сервис | URL |
|---|---|
| **Frontend** (приложение) | http://localhost:3000 |
| **Backend API** | http://localhost:8000 |
| **Backend healthcheck** | http://localhost:8000/health |
| **Swagger UI** (документация API) | http://localhost:8000/docs |
| **PostgreSQL** | localhost:**5433** (порт изменён, чтобы не конфликтовать с локальным Postgres) |

### 5. Заполнить базу тестовыми данными (опционально)

Seed-скрипт создаёт администратора и несколько тестовых пользователей:

```bash
docker exec -it attendtrack-backend-1 python -m app.db.seed
```

После этого войти можно с логином `admin` и паролем, который выведет скрипт в консоль.

### 6. Остановить контейнеры

```bash
# Остановить без удаления данных БД
docker-compose down

# Остановить и удалить все данные (volume с PostgreSQL)
docker-compose down -v
```

---

## Запуск для разработки (без Docker)

Этот способ удобен, если нужно активно менять код и видеть изменения мгновенно.

### Предварительно: запустить PostgreSQL

Убедитесь, что PostgreSQL запущен и доступен. Создайте базу данных:

```sql
CREATE USER attend WITH PASSWORD 'attend_secret';
CREATE DATABASE attendtrack OWNER attend;
```

### Backend

```bash
cd backend
```

**1. Создать виртуальное окружение и установить зависимости:**

```bash
# Windows
python -m venv .venv
.venv\Scripts\activate

# Linux / macOS
python -m venv .venv
source .venv/bin/activate

pip install -r requirements.txt
```

**2. Создать `.env` в папке `backend/`:**

```bash
# Скопировать пример
cp .env.example .env  # или вручную создать файл
```

Содержимое `backend/.env` (измените `@db:` на `@localhost:`):

```env
DATABASE_URL=postgresql+asyncpg://attend:attend_secret@localhost:5432/attendtrack
SECRET_KEY=my-dev-secret-key
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_HOURS=24
DISABLE_2FA_FOR_TESTING=true
```

**3. Применить миграции базы данных:**

```bash
alembic upgrade head
```

**4. (Опционально) Заполнить базу тестовыми данными:**

```bash
python -m app.db.seed
```

**5. Запустить сервер:**

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Backend будет доступен на http://localhost:8000  
Swagger UI: http://localhost:8000/docs

---

### Frontend

Откройте **новый терминал** (backend должен быть запущен):

```bash
cd frontend
```

**1. Установить зависимости:**

```bash
npm install
```

**2. Запустить dev-сервер:**

```bash
npm run dev
```

Frontend будет доступен на http://localhost:5173

> Vite автоматически проксирует запросы `/api/*` на `http://localhost:8000`, поэтому отдельно настраивать CORS не нужно.

**3. Сборка для продакшена (опционально):**

```bash
npm run build
npm run preview  # предпросмотр собранного приложения
```

---

## Переменные окружения

### Корневой `.env` (используется Docker Compose)

| Переменная | По умолчанию | Описание |
|---|---|---|
| `POSTGRES_USER` | `attend` | Пользователь PostgreSQL |
| `POSTGRES_PASSWORD` | `attend_secret` | Пароль PostgreSQL |
| `POSTGRES_DB` | `attendtrack` | Имя базы данных |
| `DATABASE_URL` | `postgresql+asyncpg://attend:attend_secret@db:5432/attendtrack` | Строка подключения к БД (asyncpg) |
| `SECRET_KEY` | `change-me-in-production` | Секретный ключ для подписи JWT (**обязательно менять в продакшене**) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `15` | Время жизни access-токена (мин) |
| `REFRESH_TOKEN_EXPIRE_HOURS` | `24` | Время жизни refresh-токена (ч) |
| `DISABLE_2FA_FOR_TESTING` | `false` | Отключить 2FA (только для разработки) |

### Дополнительные настройки backend (в `app/core/config.py`)

| Параметр | По умолчанию | Описание |
|---|---|---|
| `LATE_THRESHOLD_TIME` | `09:00` | Время начала рабочего дня (порог опоздания) |
| `OVERTIME_THRESHOLD_TIME` | `18:00` | Время конца рабочего дня (порог переработки) |
| `LATE_YELLOW_MINUTES` | `15` | Допустимое опоздание в минутах (до «жёлтого» статуса) |
| `FUZZY_MATCH_THRESHOLD` | `90` | Порог нечёткого сопоставления имён (0–100) |
| `PRODUCTION_CALENDAR_API_ENABLED` | `true` | Использовать API производственного календаря РФ |

---

## Первый вход и 2FA

AttendTrack использует **двухфакторную аутентификацию (TOTP)** через Google Authenticator или любое совместимое приложение.

### Процесс первого входа

1. Войдите на http://localhost:3000
2. Введите логин и пароль (выданные администратором)
3. Если аккаунт новый — откроется страница **настройки 2FA**:
   - Отсканируйте QR-код в приложении Google Authenticator / Authy / 1Password
   - Введите 6-значный код для подтверждения
4. При последующих входах нужно будет вводить пароль + код из приложения

### Отключение 2FA для разработки

Установите в `.env`:

```env
DISABLE_2FA_FOR_TESTING=true
```

И перезапустите сервисы. После этого при входе достаточно только логина и пароля.

### Сброс 2FA для пользователя (через Docker)

```bash
docker exec -it attendtrack-backend-1 python -m app.db.clear_admin_2fa
```

---

## Тестирование

Тесты написаны для backend на pytest с использованием асинхронных фикстур и тестовой БД.

### Запуск тестов через Docker

```bash
docker exec -it attendtrack-backend-1 pytest -v
```

### Запуск тестов локально

```bash
cd backend
source .venv/bin/activate  # или .venv\Scripts\activate на Windows

# Убедитесь, что тестовая БД доступна (или используйте SQLite в памяти — зависит от конфигурации)
pytest -v

# Запуск конкретного файла тестов
pytest tests/test_auth.py -v

# С отчётом о покрытии
pytest --cov=app --cov-report=term-missing
```

---

## Структура проекта

```
AttendTrack/
├── .env                        # Переменные окружения (не в git)
├── .env.example                # Пример конфигурации
├── docker-compose.yml          # Оркестрация контейнеров
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt        # Python-зависимости
│   ├── alembic.ini             # Конфигурация Alembic
│   ├── alembic/
│   │   └── versions/           # Файлы миграций БД
│   ├── app/
│   │   ├── main.py             # Точка входа FastAPI
│   │   ├── api/                # Роутеры (auth, users, files, stats)
│   │   ├── core/               # Конфиг, middleware, безопасность
│   │   ├── db/                 # Модели, сессия, seed-скрипт
│   │   ├── schemas/            # Pydantic-схемы
│   │   ├── services/           # Бизнес-логика (парсер Excel, fuzzy-matching)
│   │   └── holidays.py         # Интеграция с производственным календарём РФ
│   └── tests/                  # Тесты pytest
│
└── frontend/
    ├── Dockerfile
    ├── nginx.conf              # Конфигурация Nginx (продакшен)
    ├── package.json
    ├── vite.config.ts
    └── src/
        ├── App.tsx             # Роутинг приложения
        ├── api/                # HTTP-клиенты (axios)
        ├── components/         # UI-компоненты (календарь, графики, layout)
        ├── pages/              # Страницы приложения
        ├── providers/          # Провайдеры (Auth, Query, Theme)
        └── hooks/              # Кастомные React-хуки
```

---

## API-эндпоинты

Полная интерактивная документация доступна по адресу http://localhost:8000/docs

| Метод | URL | Описание | Доступ |
|---|---|---|---|
| `GET` | `/health` | Проверка состояния сервера | Публичный |
| `POST` | `/api/auth/login` | Вход (логин + пароль) | Публичный |
| `POST` | `/api/auth/verify-2fa` | Подтверждение 2FA-кода | Публичный |
| `POST` | `/api/auth/setup-2fa` | Первичная настройка 2FA | Авторизованный |
| `POST` | `/api/auth/refresh` | Обновление access-токена | Авторизованный |
| `POST` | `/api/auth/logout` | Выход | Авторизованный |
| `GET` | `/api/users/` | Список пользователей | admin, manager |
| `POST` | `/api/users/` | Создать пользователя | admin |
| `PUT` | `/api/users/{id}` | Обновить пользователя | admin |
| `DELETE` | `/api/users/{id}` | Удалить пользователя | admin |
| `POST` | `/api/files/upload` | Загрузить Excel-файл СКУД | admin, manager |
| `GET` | `/api/files/history` | История загрузок | admin, manager |
| `GET` | `/api/stats/summary` | Сводная статистика | Авторизованный |
| `GET` | `/api/stats/user/{id}` | Статистика по сотруднику | Авторизованный |

---

## Роли пользователей

| Роль | Описание | Возможности |
|---|---|---|
| `admin` | Администратор | Полный доступ: управление пользователями, загрузка файлов, просмотр статистики |
| `manager` | Менеджер | Загрузка файлов, просмотр статистики всех сотрудников, управление пользователями (без удаления) |
| `employee` | Сотрудник | Просмотр только своей статистики и календаря |
