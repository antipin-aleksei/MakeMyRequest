# Последовательная передача MVP 02–07 автономным агентам

Создано: 2026-11-17. Состояние: **ожидает доступного coding-agent runtime**. Планирование не означает, что агенты выполняли задачи.

## Порядок
1. [#2](https://github.com/antipin-aleksei/MakeMyRequest/issues/2) — публичная страница мастера и UX.
2. [#3](https://github.com/antipin-aleksei/MakeMyRequest/issues/3) — анкета и приватные референсы.
3. [#4](https://github.com/antipin-aleksei/MakeMyRequest/issues/4) — защищенный кабинет мастера.
4. [#5](https://github.com/antipin-aleksei/MakeMyRequest/issues/5) — серверные границы, валидация и безопасность.
5. [#6](https://github.com/antipin-aleksei/MakeMyRequest/issues/6) — staging deployment.
6. [#7](https://github.com/antipin-aleksei/MakeMyRequest/issues/7) — E2E приемка и дефекты.

Каждый шаг поручается **отдельному свежему агенту**. Следующий стартует только после принятого PR предыдущего. Не распараллеливать. Не сливать PR автоматически при красном CI.

## Обязательный bootstrap исполнителя
- Если агент работает в **Claude Code**, установить `Superpowers` по официальной инструкции: `/plugin install superpowers@claude-plugins-official`, либо:
  ```
  /plugin marketplace add obra/superpowers-marketplace
  /plugin install superpowers@superpowers-marketplace
  ```
- Источник: https://github.com/obra/superpowers
- Прочитать `using-superpowers`, затем применить `writing-plans`, `using-git-worktrees`, `subagent-driven-development`, `verification-before-completion` по необходимости.
- **Перед каждым шагом** создать `vibe/steps/step-NN.md` с планом, критериями приемки, файловой декомпозицией и 1–3 приоритетными тестами. Никаких придуманных результатов.
- Прочитать `AGENTS.md`, `vibe/MVP_PLAN.md`, `docs/architecture.md`, ADR и skill соответствующей области.
- Работать в изолированной ветке, PR c кратким перечнем сделанного, проверок и ограничений.

## Реальное состояние
- Первый UI foundation PR #1 остается draft, CI еще не подтвержден.
- Задачи #2–#7 созданы и содержат scope/acceptance criteria.
- Попытка назначить GitHub Copilot coding agent на #2 через доступный GitHub API завершилась HTTP 403. **Ни один исполнитель не запущен.**
- В текущем окружении нет функции создания/запуска Claude Code субагентов и доступа к Claude Skills Store. Подмена самостоятельной работой основного ассистента запрещена пожеланием заказчика.

## Требуется для продолжения
Подключить Claude Code/агентную среду с доступом к репозиторию, Superpowers и возможностью создавать отдельные последовательные agent sessions; либо предоставить разрешенный GitHub coding-agent механизм. После этого агенты реализуют #2–#7 по очереди. GitHub Copilot Cloud Agent — отдельная среда, не гарантирует исполнение Claude Code skills.
