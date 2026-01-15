# Repository Guidelines

## Структура проекта и модули
- `src/`: основной TypeScript-код (ядро, CLI, адаптеры, парсеры).
- `tests/`: тесты Jest; структура повторяет `src/`, шаблон `**/*.test.ts`.
- `docs/`: документация и гайды по функциям.
- `examples/`: примеры workflow-конфигов.
- `dist/`: результат сборки (`npm run build`).
- `artifacts/` и `state/`: генерируемые артефакты и сохраненные сессии.

## Команды сборки, тестов и разработки
- `npm run build`: сборка TypeScript в `dist/`.
- `npm start`: запуск собранного кода (`dist/index.js`).
- `npm test`: тихий прогон Jest (с `LOG_LEVEL=silent`).
- `npm run test:verbose`: подробный вывод тестов.
- `npm run test:watch`: watch-режим для локальной разработки.
- `npm run test:coverage`: сбор покрытия в `coverage/`.
- `npm run lint`: проверка `src/**/*.ts` через ESLint.

## Стиль кода и нейминг
- Язык: TypeScript (ES2022, ESM), настройки в `tsconfig.json`.
- Линтер: ESLint + `@typescript-eslint` (см. `.eslintrc.json`).
- Строгий режим: `strict` включен, избегайте неявного `any`.
- Именование: тесты `*.test.ts`, файлы в `src/` — kebab-case (например, `workflow-engine.ts`).
- Для намеренно неиспользуемых параметров используйте префикс `_`.

## Правила тестирования
- Фреймворк: Jest + `ts-jest` (`jest.config.js`).
- Расположение: `tests/**/**.test.ts`.
- Покрытие: запускайте `npm run test:coverage`, отчеты в `coverage/`.
- Property-based: доступен `fast-check`, держите генераторы детерминированными.

## Коммиты и Pull Request
- История использует Conventional Commits, часто со scope.\n- В сообщениях коммитов желательно описывать изменения на русском языке.
  - Примеры: `feat(cli): add resume selector`, `test: fix flaky cases`.
- В PR указывайте:
  - Что изменилось и какие новые настройки добавлены.
  - Связанные issue (если есть).
  - Результаты тестов (`npm test`, при крупных правках — `npm run test:coverage`).
  - Чистую сборку и линт (`npm run lint`, `npm run build`).

## Настройки окружения
- Node.js: требуется >= 18 (см. README).
