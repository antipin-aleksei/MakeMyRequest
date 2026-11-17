# Этап 01 — фундамент и переход на shadcn/ui

Статус: **в работе**, ветка `feat/shadcn-foundation`. Этот документ детализирует первый пункт `vibe/MVP_PLAN.md`.

## 1. UI foundation
- [x] Зафиксировать shadcn/ui + Tailwind CSS v4 как UI-стек.
- [x] Удалить Mantine-зависимости из `package.json`, отключить MantineProvider и стили.
- [x] Настроить Tailwind/Vite, aliases, `components.json`, `cn`, базовые дизайн-токены.
- [x] Добавить исходники базовых UI-примитивов (Button, Input, Textarea, Label, Card).
- [x] Перенести существующую двухшаговую форму и состояния ошибки/отправки без изменения API.
- [ ] Сверить базовые компоненты с актуальным кодом официального registry через CLI, обновить при расхождениях.
- [ ] Проверить в браузере адаптивность на 320px / WebView.

## 2. Агентские правила и архитектура
- [x] Обновить `AGENTS.md` и `.agents/skills/frontend/SKILL.md`.
- [x] Переписать ADR про выбор UI-библиотеки.
- [ ] Выделить прямые SQL-запросы из Rust HTTP-handlers в persistence-слой (долг технического фундамента).
- [ ] Добавить правила проверки контрактов API/фронтенда при появлении новых эндпоинтов.

## 3. Quality gate
- [ ] Локально выполнить `npm install && npm run typecheck && npm run build` в `apps/web`.
- [ ] Локально выполнить `cargo fmt -- --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test` в `apps/api`.
- [ ] Запустить и проверить миграции PostgreSQL, smoke-тест `GET /health`, отправку `POST /api/v1/requests`.
- [ ] Подтвердить зелёный GitHub Actions CI для ветки, исправить найденные ошибки.
- [ ] Убедиться, что Mantine полностью отсутствует в исходниках и lockfile; зафиксировать `package-lock.json` после `npm install`.

## 4. Завершение этапа
- [ ] Провести ревью, принять PR, слить в `main`.
- [ ] Отметить пункт 1 в `vibe/MVP_PLAN.md` после подтверждённых проверок.

## Принцип
Никаких LLM/AI и нововведений в продуктовый scope: цель — заменить UI foundation, сохранить отправку заявок и привести проект к воспроизводимой сборке. Невыполненные проверки нельзя считать успешными.
