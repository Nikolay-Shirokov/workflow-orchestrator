# План реализации: Система capabilities для CLI-адаптеров

## Обзор

План реализации системы capabilities для расширения возможностей CLI-адаптеров. Позволит управлять веб-поиском, MCP-инструментами и интеграцией с браузером.

**Оценка сложности:** Средняя
**Зависимости:** file-output-tool-support (завершён)

---

## Фаза 1: Типы и интерфейсы ✅

### Задача 1.1: Добавить StepCapabilities в types.ts ✅
- [x] Создать интерфейс `StepCapabilities`
- [x] Добавить поля: `web_search`, `web_fetch`, `mcp_tools`, `browser`
- [x] Добавить JSDoc документацию с описанием маппинга на CLI

**Файл:** `src/core/types.ts`

**Код:**
```typescript
export interface StepCapabilities {
  web_search?: boolean;  // Claude: WebSearch, Codex: --search, Gemini: google_web_search
  web_fetch?: boolean;   // Claude: WebFetch (только Claude)
  mcp_tools?: boolean | string[];
  browser?: boolean;
}
```

### Задача 1.2: Расширить StepPermissions ✅
- [x] Добавить поле `capabilities?: StepCapabilities` в `StepPermissions`
- [x] Обновить JSDoc

**Файл:** `src/core/types.ts`

### Задача 1.3: Расширить RoleConfig ✅
- [x] Добавить поле `default_capabilities?: StepCapabilities`
- [x] Обновить JSDoc

**Файл:** `src/core/types.ts`

### Задача 1.4: Добавить CapabilitySupport интерфейс ✅
- [x] Создать интерфейс `CapabilitySupport`
- [x] Создать интерфейс `CapabilityAwareAdapter`

**Файл:** `src/core/types.ts`

**Код:**
```typescript
export interface CapabilitySupport {
  supported: boolean;
  flags?: string[];
  note?: string;
}

export interface CapabilityAwareAdapter extends CLIAdapter {
  getCapabilitySupport(): Record<keyof StepCapabilities, CapabilitySupport>;
  mapCapabilitiesToArgs(capabilities: StepCapabilities): string[];
}
```

---

## Фаза 2: Базовый адаптер ✅

### Задача 2.1: Добавить метод mapCapabilitiesToArgs в BaseCLIAdapter ✅
- [x] Добавить protected метод `mapCapabilitiesToArgs`
- [x] Базовая реализация возвращает пустой массив
- [x] Логирование предупреждений для неподдерживаемых capabilities

**Файл:** `src/adapters/base-cli-adapter.ts`

### Задача 2.2: Интегрировать capabilities в prepareArguments ✅
- [x] Вызывать `mapCapabilitiesToArgs` если capabilities указаны
- [x] Объединять с результатом `mapPermissionsToArgs`

**Файл:** `src/adapters/base-cli-adapter.ts`

### Задача 2.3: Добавить метод getCapabilitySupport ✅
- [x] Добавить метод с базовой реализацией (все не поддерживаются)
- [x] Переопределять в конкретных адаптерах

**Файл:** `src/adapters/base-cli-adapter.ts`

---

## Фаза 3: Claude CLI адаптер ✅

### Задача 3.1: Реализовать getCapabilitySupport для Claude ✅
- [x] `web_search`: supported: true (инструмент WebSearch)
- [x] `web_fetch`: supported: true (инструмент WebFetch)
- [x] `mcp_tools`: supported: true
- [x] `browser`: supported: true, flags: ['--chrome']

**Файл:** `src/adapters/claude-cli-adapter.ts`

### Задача 3.2: Реализовать mapCapabilitiesToArgs для Claude ✅
- [x] `web_search: true` → добавить WebSearch в --tools и --allowedTools
- [x] `web_fetch: true` → добавить WebFetch в --tools и --allowedTools
- [x] `browser: true` → `--chrome`
- [x] `mcp_tools: true` → не ограничивать --tools по MCP
- [x] `mcp_tools: ["tool1"]` → добавить в `--allowedTools`

**Файл:** `src/adapters/claude-cli-adapter.ts`

### Задача 3.3: Интегрировать с существующим mapPermissionsToArgs ✅
- [x] Убедиться что capabilities и permissions не конфликтуют
- [x] `--allowedTools` должен объединять из обоих источников

**Файл:** `src/adapters/claude-cli-adapter.ts`

---

## Фаза 4: Codex CLI адаптер ✅

### Задача 4.1: Реализовать getCapabilitySupport для Codex ✅
- [x] `web_search`: supported: true, flags: ['--search']
- [x] `web_fetch`: supported: false
- [x] `mcp_tools`: supported: true, note: 'MCP доступен если настроен через codex mcp add'
- [x] `browser`: supported: false

**Файл:** `src/adapters/codex-cli-adapter.ts`

### Задача 4.2: Реализовать mapCapabilitiesToArgs для Codex ✅
- [x] `web_search: true` → `--search`
- [x] `mcp_tools: true` → логировать что MCP доступен автоматически
- [x] Логировать warning для неподдерживаемых capabilities

**Файл:** `src/adapters/codex-cli-adapter.ts`

---

## Фаза 5: Gemini CLI адаптер ✅

### Задача 5.1: Реализовать getCapabilitySupport для Gemini ✅
- [x] `web_search`: supported: true (инструмент `google_web_search`)
- [x] `web_fetch`: supported: true (инструмент `web_fetch`)
- [x] `mcp_tools`: supported: true (через `settings.json`, `includeTools`/`excludeTools`)
- [x] `browser`: supported: false

**Файл:** `src/adapters/gemini-cli-adapter.ts`

### Задача 5.2: Рефакторинг mapPermissionsToArgs для объединения tools ✅
- [x] Собирать все --allowed-tools в один список
- [x] Источники: permissions.write → write_file, permissions.execute → shell
- [x] Capabilities: web_search → google_web_search, web_fetch → web_fetch
- [x] `--yolo` добавлять только если список непустой

**Файл:** `src/adapters/gemini-cli-adapter.ts`

### Задача 5.3: Реализовать mapCapabilitiesToArgs для Gemini ✅
- [x] `web_search: true` → добавить google_web_search в список tools
- [x] `web_fetch: true` → добавить web_fetch в список tools
- [x] Логировать warning для mcp_tools и browser

**Файл:** `src/adapters/gemini-cli-adapter.ts`

---

## Фаза 6: StepExecutor ✅

### Задача 6.1: Добавить merge capabilities ✅
- [x] Создать функцию `mergeStepCapabilities(step, roleName)`
- [x] Приоритет: step > role > defaults

**Файл:** `src/core/step-executor.ts`

### Задача 6.2: Интегрировать в executeModelStep ✅
- [x] Получать default_capabilities из роли через RoleManager
- [x] Merge с capabilities шага
- [x] Передавать в AdapterRequest

**Файл:** `src/core/step-executor.ts`

### Задача 6.3: Добавить validation/warnings ✅
- [x] Проверять поддержку capabilities адаптером через `getCapabilitySupport()`
- [x] Логировать warnings для неподдерживаемых
- [x] Не прерывать выполнение при warnings

**Файл:** `src/core/step-executor.ts`

---

## Фаза 7: Удаление MCPManager ✅

### Задача 7.1: Проанализировать использование MCPManager ✅
- [x] Найти все импорты и использования
- [x] Определить что нужно сохранить (MCPToolConfig, MCPToolInfo, MCPContext перенесены в types.ts как deprecated)

**Файлы:** Поиск по проекту

### Задача 7.2: Удалить MCPManager ✅
- [x] Удалить `src/core/mcp-manager.ts`
- [x] Удалить `src/core/MCP_INTEGRATION.md`
- [x] Удалить экспорт из index.ts
- [x] Удалить тесты `tests/core/mcp-manager.test.ts`
- [x] Обновить `workflow-engine.ts` - убрать mcpManager
- [x] Обновить `step-executor.ts` - убрать mcpManager, добавить formatMCPContext
- [x] Обновить `orchestrator.ts` - убрать mcpManager
- [x] Обновить `workflow-engine-progress-integration.test.ts`

**Файлы:** Множество файлов

### Задача 7.3: Обновить WorkflowSettings ✅
- [x] Пометить `mcp_tools` в WorkflowSettings как deprecated
- [x] Добавить warning в workflow-engine при использовании устаревшего mcp_tools

**Файл:** `src/core/types.ts`, `src/core/workflow-engine.ts`

### Задача 7.4: Создать CapabilityChecker (опционально) - ПРОПУЩЕНО
- [ ] Проверка доступности capabilities уже реализована в adapters через getCapabilitySupport()
- [ ] validateCapabilitiesSupport() в StepExecutor выполняет валидацию

**Примечание:** Отдельный CapabilityChecker не требуется, функциональность распределена между адаптерами и StepExecutor

---

## Фаза 8: Тестирование ✅

### Задача 8.1: Unit-тесты для типов ✅
- [x] Тесты для StepCapabilities
- [x] Тесты для mergeCapabilities
- [x] Тесты для StepPermissions с capabilities
- [x] Тесты для RoleConfig с default_capabilities

**Файл:** `tests/core/capabilities.test.ts` (17 тестов)

### Задача 8.2: Property-based тесты для Claude ✅
- [x] Property: browser → --chrome
- [x] Property: mcp_tools массив → --allowedTools
- [x] Property: web_search → WebSearch в tools
- [x] Property: web_fetch → WebFetch в tools
- [x] Property: getCapabilitySupport корректность
- [x] Property: нет дубликатов инструментов

**Файл:** `tests/adapters/claude-capabilities.property.test.ts` (9 тестов)

### Задача 8.3: Property-based тесты для Codex ✅
- [x] Property: web_search → --search
- [x] Property: mcp_tools → логирование
- [x] Property: browser → warning
- [x] Property: web_fetch → warning
- [x] Property: getCapabilitySupport корректность
- [x] Property: нет дубликатов флагов

**Файл:** `tests/adapters/codex-capabilities.property.test.ts` (9 тестов)

### Задача 8.4: Property-based тесты для Gemini ✅
- [x] Property: web_search → google_web_search в --allowed-tools
- [x] Property: web_search + write → объединение tools + --yolo
- [x] Property: mcp_tools → логирование
- [x] Property: browser → warning
- [x] Property: --yolo только при наличии tools
- [x] Property: нет дубликатов инструментов

**Файл:** `tests/adapters/gemini-capabilities.property.test.ts` (12 тестов)

### Задача 8.5: Integration тесты ✅
- [x] Тест merge capabilities step + role
- [x] Тест validation warnings
- [x] Тест сравнения поддержки адаптеров
- [x] Тест маппинга capabilities на CLI args
- [x] Тест загрузки default_capabilities из роли
- [x] Тест вариантов mcp_tools (boolean/array)

**Файл:** `tests/integration/capabilities.test.ts` (16 тестов)

**Итого: 63 теста, все проходят**

---

## Фаза 9: Документация

### Задача 9.1: Обновить README адаптеров ✅
- [x] Добавить таблицу поддерживаемых capabilities
- [x] Добавить примеры использования
- [x] Документировать маппинг на флаги CLI

**Файл:** `src/adapters/README.md`

### Задача 9.2: Обновить FAQ ✅
- [x] Добавить вопрос о capabilities
- [x] Добавить вопрос о MCP
- [x] Обновить примеры конфигурации

**Файл:** `docs/FAQ.md`

### Задача 9.3: Обновить SECURITY.md ✅
- [x] Добавить раздел о безопасности capabilities
- [x] Документировать риски web_search и browser
- [x] Рекомендации по использованию

**Файл:** `docs/SECURITY.md`

### Задача 9.5: Обновить примеры workflow ✅
- [x] Обновить существующие примеры с capabilities
- [x] Создать новый пример research-workflow с web_search
- [x] Создать пример с mcp_tools

**Файлы:** `examples/mcp-workflow-example.yaml`

---

## Фаза 10: Финализация ✅

### Задача 10.1: Code review checklist ✅
- [x] Все тесты проходят (1163 тестов, 81 test suite)
- [x] Нет TypeScript ошибок
- [x] Документация актуальна
- [x] Breaking changes документированы (MCPManager deprecated)

### Задача 10.2: Обновить CHANGELOG ✅
- [x] Добавить запись о capabilities
- [x] Документировать deprecated MCPManager
- [x] Указать breaking changes

**Файл:** `CHANGELOG.md`

### Задача 10.3: Финальное тестирование ✅
- [x] Запустить все тесты - 1163 passed
- [x] Проверить примеры workflow - обновлены
- [ ] Тест с реальными CLI-утилитами (опционально, требует установленных CLI)

---

## Зависимости между фазами

```
Фаза 1 (Типы)
    ↓
Фаза 2 (Base Adapter) ←──────────────────┐
    ↓                                     │
┌───┴───┬───────────┐                     │
↓       ↓           ↓                     │
Фаза 3  Фаза 4      Фаза 5               │
Claude  Codex       Gemini                │
    ↓       ↓           ↓                 │
    └───────┴───────────┘                 │
            ↓                             │
        Фаза 6 (StepExecutor) ───────────┘
            ↓
        Фаза 7 (MCPManager cleanup)
            ↓
        Фаза 8 (Тестирование)
            ↓
        Фаза 9 (Документация)
            ↓
        Фаза 10 (Финализация)
```

---

## Риски и митигация

| Риск | Вероятность | Влияние | Митигация |
|------|-------------|---------|-----------|
| Breaking changes в API | Средняя | Высокое | Deprecation warnings, миграционное руководство |
| CLI-утилиты изменят флаги | Низкая | Среднее | Версионирование адаптеров, тесты с реальными CLI |
| Конфликт capabilities с permissions | Средняя | Среднее | Чёткие правила приоритета, validation |
| MCP-серверы не настроены | Высокая | Низкое | Warnings, документация |

---

## Критерии готовности

- [x] Все задачи выполнены
- [x] Все тесты проходят (unit + property + integration) - 1163 тестов
- [x] Документация обновлена (README адаптеров, FAQ, SECURITY)
- [x] Примеры обновлены с capabilities
- [x] Code review пройден
- [x] CHANGELOG обновлён

## Статус: ✅ ЗАВЕРШЕНО

**Итого реализовано:**
- 10 фаз, все задачи выполнены
- 63 новых теста для capabilities (17 unit + 30 property + 16 integration)
- Общее количество тестов: 1163
- Документация: README адаптеров, FAQ, SECURITY.md, примеры workflow
- MCPManager удалён с сохранением обратной совместимости через deprecated интерфейсы
