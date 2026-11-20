# Тестовая среда: инструкция (НЕ развёрнута)

## Рекомендуемые сервисы
- GitHub: `antipin-aleksei/MakeMyRequest`.
- Cloudflare Pages: frontend Vite, root directory `apps/web`, build command `npm install && npm run build`, output `dist`. Build env: `VITE_API_URL=https://<api-host>`.
- Render: Rust backend Docker blueprint `render.yaml`, endpoint `https://<api-host>/health`. Бесплатный процесс может засыпать. Проверяйте актуальные квоты.
- Neon PostgreSQL: одна тестовая БД, TLS-соединение `DATABASE_URL`. Отдельная БД для production.
- Cloudflare R2: **приватный** bucket Standard storage; создать отдельный API token с read/write только на этот bucket. R2 endpoint и credentials — только в Render secrets. Запретить публичный доступ к bucket. При настройке `R2_ENDPOINT` API переключается с локальных файлов на S3-совместимый storage.

## Обязательные переменные
- Backend: `DATABASE_URL`, `ADMIN_TOKEN` (случайная строка длиной минимум 32), `WEB_ORIGIN` (точный публичный адрес Pages), `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `REQUIRE_REMOTE_STORAGE=true`, `API_PORT=10000`.
- Frontend (при сборке): `VITE_API_URL` без завершающего `/`.
- Не хранить секреты в GitHub или публичных build-логах. `VITE_*` не подходит для секретов.

## Порядок
1. Создать Neon DB, настроить регион/backup и сетевые параметры.
2. Создать приватный R2 bucket и ключ только для приложения.
3. Развернуть Rust API через Render Blueprint. После первого старта автоматически применяются SQLx migrations; убедиться, что они проходят.
4. Проверить `/health` и `GET /api/v1/artist`. Заменить тестовый профиль мастера на реальный.
5. Создать Cloudflare Pages проект, связать ветку, указать `VITE_API_URL`.
6. Указать точный `WEB_ORIGIN` в Render и повторно развернуть API.
7. Проверить полную приемку из `docs/acceptance.md` на телефоне и компьютере.

## Блокеры перед публичным использованием
- Простой ключ мастера сейчас является **тестовой авторизацией**, не полноценным login с сессиями/MFA/восстановлением.
- Потребуется ограничение частоты запросов на edge/backend, антиспам, защита от злоупотребления загрузками и лимиты расходов.
- Согласие и privacy notice требуют юридической проверки по применимому законодательству (GDPR при применимости); задать политику удаления и backup.
- Доступность/обновление секретов, мониторинг, оповещения и восстановление БД/объектов.
- Подтвердить квоты и доступность бесплатных планов у каждого провайдера.
- Никаких реальных клиентов до устранения блокеров.

## Проверки
```sh
npm --prefix apps/web install
npm --prefix apps/web run typecheck
npm --prefix apps/web run build
cargo fmt --manifest-path apps/api/Cargo.toml -- --check
cargo clippy --manifest-path apps/api/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path apps/api/Cargo.toml
```

Текущие шаги — инфраструктурный рецепт, а не подтверждение наличия запущенных ресурсов.
