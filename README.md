# ClockIn

Система учёта посещаемости сотрудников на основе данных СКУД (система контроля и управления доступом).
Загрузка Excel-отчётов из турникетов, автоматическое сопоставление сотрудников, статистика опозданий, переработок и пропусков.

---

## Стек технологий

| Слой | Технологии |
|---|---|
| **Backend** | Python 3.11, FastAPI, SQLAlchemy 2.0 (async), Alembic, Pydantic v2 |
| **База данных** | PostgreSQL 16 |
| **Frontend** | React 19, TypeScript, Vite, Mantine UI 7, TanStack Query, Recharts |
| **Аутентификация** | JWT (access + refresh), TOTP 2FA (PyOTP), одноразовые invite-ссылки |
| **Парсинг данных** | Pandas, OpenPyXL, TheFuzz (нечёткое сопоставление имён) |
| **Экспорт** | xlsx-js-style (стилизованные Excel-отчёты) |
| **Контейнеризация** | Docker, Docker Compose, Nginx |

---

## Требования

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (включает Docker Compose)
- Порты **8000**, **3000** и **5433** должны быть свободны

Для локальной разработки без Docker: Python 3.11+, PostgreSQL 16, Node.js 18+.

---

## Быстрый старт

### 1. Клонировать и настроить

```bash
git clone https://github.com/Darlykn/ClockIn
cd ClockIn
cp .env.example .env   # Windows: Copy-Item .env.example .env
```

При необходимости измените значения в `.env` (особенно `SECRET_KEY` для продакшена).

### 2. Запустить

```bash
docker compose up --build
```

Первый запуск занимает несколько минут. При последующих запусках: `docker compose up`.

### 3. Проверить

| Сервис | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| Swagger UI | http://localhost:8000/docs |
| Health check | http://localhost:8000/health |
| PgAdmin | http://localhost:5050 |
| PostgreSQL | localhost:5433 |

### 4. Создать тестовые данные (опционально)

```bash
docker exec -it attendtrack-backend-1 python -m app.db.seed
```

Скрипт создаст администратора (`admin`) и сотрудников. Пароль выводится в консоль.

### 5. Остановить

```bash
docker compose down        # сохранить данные БД
docker compose down -v     # удалить все данные
```

---

## Переменные окружения

| Переменная | По умолчанию | Описание |
|---|---|---|
| `POSTGRES_USER` | `attend` | Пользователь PostgreSQL |
| `POSTGRES_PASSWORD` | `attend_secret` | Пароль PostgreSQL |
| `POSTGRES_DB` | `attendtrack` | Имя базы данных |
| `DATABASE_URL` | `postgresql+asyncpg://...@db:5432/attendtrack` | Строка подключения (asyncpg) |
| `SECRET_KEY` | `change-me-in-production` | Секрет для подписи JWT |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `15` | Время жизни access-токена (мин) |
| `REFRESH_TOKEN_EXPIRE_MINUTES` | `15` | Время жизни refresh-токена (мин) |

Дополнительные параметры в `backend/app/core/config.py`:

| Параметр | По умолчанию | Описание |
|---|---|---|
| `LATE_YELLOW_MINUTES` | `15` | Допустимое опоздание (мин) |
| `FUZZY_MATCH_THRESHOLD` | `90` | Порог нечёткого сопоставления имён (0–100) |
| `PRODUCTION_CALENDAR_API_ENABLED` | `true` | Производственный календарь РФ (isdayoff.ru) |

---

## Аутентификация и invite-ссылки

### Двухфакторная аутентификация (TOTP)

Все пользователи проходят 2FA при каждом входе через Google Authenticator, Yandex Key или аналоги.

### Invite-ссылки

Администратор генерирует одноразовую ссылку для сотрудника (кнопка на странице «Сотрудники»):

- Ссылка действует **10 минут**
- Каждая новая ссылка **аннулирует** предыдущую
- После использования ссылка становится недействительной
- При переходе по ссылке пользователь задаёт пароль и настраивает 2FA
- Если email уже задан — поле email не показывается

---

## Роли пользователей

| Роль | Возможности |
|---|---|
| **admin** | Полный доступ: управление пользователями, загрузка файлов, история загрузок, вся статистика, генерация invite-ссылок |
| **manager** | Загрузка файлов, просмотр статистики всех сотрудников, управление пользователями (без создания/удаления) |
| **employee** | Просмотр только своей статистики, календаря и рабочих часов |

---

## API-эндпоинты

Интерактивная документация: http://localhost:8000/docs

### Auth (`/api/auth`)

| Метод | URL | Описание | Доступ |
|---|---|---|---|
| `POST` | `/login` | Вход (логин + пароль) | Публичный |
| `POST` | `/2fa/setup` | Генерация QR-кода для TOTP | Temp-токен |
| `POST` | `/2fa/verify` | Подтверждение TOTP-кода, выдача токенов | Temp-токен |
| `POST` | `/refresh` | Обновление access-токена (cookie) | Refresh-токен |
| `POST` | `/logout` | Выход (очистка cookie) | Авторизованный |
| `POST` | `/reset-password` | Сброс пароля через TOTP | Публичный |
| `GET` | `/validate-invite` | Проверка invite-ссылки | Публичный |
| `POST` | `/first-login` | Установка пароля по invite-ссылке | Публичный |

### Users (`/api/users`)

| Метод | URL | Описание | Доступ |
|---|---|---|---|
| `GET` | `/` | Список пользователей (поиск, пагинация) | admin, manager |
| `POST` | `/` | Создать пользователя | admin |
| `PATCH` | `/{id}` | Обновить пользователя (роль, email, 2FA) | admin |
| `GET` | `/me` | Текущий пользователь | Авторизованный |
| `GET` | `/employees` | Список сотрудников для выпадающих списков | admin, manager |
| `POST` | `/{id}/generate-invite` | Генерация invite-ссылки | admin |

### Files (`/api/files`)

| Метод | URL | Описание | Доступ |
|---|---|---|---|
| `POST` | `/upload` | Загрузка Excel-файла СКУД | admin, manager |
| `GET` | `/history` | История загрузок | admin |

### Stats (`/api/stats`)

| Метод | URL | Описание | Доступ |
|---|---|---|---|
| `GET` | `/summary` | Сводная статистика (посещаемость, опоздания, переработки) | Авторизованный |
| `GET` | `/calendar` | Календарь статуса дня (месяц) | Авторизованный |
| `GET` | `/calendar-range` | Календарь статуса дня (произвольный диапазон) | Авторизованный |
| `GET` | `/trend` | Тренд посещаемости по месяцам | Авторизованный |
| `GET` | `/heatmap` | Тепловая карта проходов (день недели / час) | Авторизованный |
| `GET` | `/top-late` | Рейтинг опозданий | admin, manager |
| `GET` | `/checkpoints` | Распределение по точкам прохода | Авторизованный |
| `GET` | `/employee-logs` | Журнал проходов сотрудника | Авторизованный (свои данные) |

---

## Логика расчёта статистики

### Фильтрация «Временный пропуск»

Сотрудники с именем, содержащим «Временный пропуск», автоматически исключаются из:
- агрегатной статистики (summary, trend, heatmap, checkpoints, top-late) при просмотре «Все сотрудники»
- выпадающего списка сотрудников (`/users/employees`)

Данные конкретного сотрудника «Временный пропуск» по-прежнему доступны при прямом выборе по ID.

### Подсчёт по фактическим данным

Статистика учитывает только месяцы, в которых реально существуют данные:

- **Summary** (`attendance_pct`): рабочие дни считаются только в месяцах с данными. Выбор периода за целый год при наличии данных лишь за январь не даёт ложно низкую посещаемость.
- **Trend**: для каждого месяца рабочие дни берутся в пределах фактического диапазона данных (от первой до последней записи в месяце).
- **Calendar / Calendar-range**: дни помечаются как «absent» (красный) только внутри месяцев, за которые есть хотя бы одна запись. Месяцы без данных не генерируют ни «absent», ни «weekend» статусов.
- **Годовой календарь активности**: ячейки в месяцах без данных отображаются серыми. Красные ячейки (absent) появляются только в месяцах с реальными данными.

### Время жизни сессии

- Access-токен (JWT): **15 минут** (`ACCESS_TOKEN_EXPIRE_MINUTES`)
- Refresh-токен (HttpOnly cookie): **15 минут** (`REFRESH_TOKEN_EXPIRE_MINUTES`)
- Cookie `max_age`: **900 секунд** (15 минут)
- Сессия продлевается автоматически при активности (refresh обновляет cookie). При **15 минутах** бездействия сессия завершается.

---

## Структура проекта

```
ClockIn/
├── .env.example                # Пример конфигурации
├── docker-compose.yml          # Оркестрация контейнеров
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── alembic.ini
│   ├── alembic/versions/       # Миграции БД
│   ├── app/
│   │   ├── main.py             # Точка входа FastAPI
│   │   ├── api/                # Роутеры: auth, users, files, stats
│   │   ├── core/               # Конфиг, middleware, JWT, bcrypt
│   │   ├── db/                 # Модели SQLAlchemy, сессия, seed
│   │   ├── schemas/            # Pydantic-схемы
│   │   ├── services/           # Парсер Excel, fuzzy-matching
│   │   └── holidays.py         # Производственный календарь РФ
│   └── tests/
│
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    ├── package.json
    └── src/
        ├── App.tsx             # Роутинг
        ├── api/                # HTTP-клиенты (axios)
        ├── components/         # Графики (Recharts), календарь, layout
        ├── pages/              # Dashboard, Users, ImportHistory, FirstLogin
        ├── providers/          # Auth, Query, Theme
        └── hooks/              # useStats, useUsers, useUpload
```
