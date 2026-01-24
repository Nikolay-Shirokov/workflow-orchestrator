# План реализации: Поддержка инструмента записи файлов для адаптеров

## Обзор

Данный план описывает задачи для реализации универсального механизма поддержки записи результатов в файлы для CLI-адаптеров, включая систему разрешений для безопасного ограничения действий модели.

## Задачи

### Фаза 1: Расширение типов ✅ ЗАВЕРШЕНО

- [x] 1. Расширение типов для поддержки permissions и outputFile
  - [x] 1.1 Добавить интерфейс `StepPermissions` в `src/core/types.ts`
    ```typescript
    interface StepPermissions {
      read?: string[];      // Паттерны файлов для чтения
      write?: string[];     // Паттерны файлов для записи
      execute?: boolean;    // Разрешено ли выполнять shell-команды
      fullAccess?: boolean; // Режим полного доступа (ОПАСНО)
    }
    ```
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 1.2 Добавить поле `outputFile?: string` в интерфейс `AdapterRequest`
    - _Requirements: 3.5_

  - [x] 1.3 Добавить поле `permissions?: StepPermissions` в интерфейс `AdapterRequest`
    - _Requirements: 4.5_

  - [x] 1.4 Расширить `metadata` в `AdapterResponse`
    - Добавить `outputFile?: string`
    - Добавить `resultSource?: 'file' | 'stdout'`
    - Добавить `sandboxMode?: string`
    - _Requirements: 6.4_

### Фаза 2: Общие методы в BaseCLIAdapter ✅ ЗАВЕРШЕНО

- [x] 2. Реализация общих методов в BaseCLIAdapter
  - [x] 2.1 Реализовать метод `appendFileWriteInstruction(prompt, outputPath, toolName?): string`
    - Добавляет инструкцию записи в файл в конец промпта
    - Использует имя инструмента если указано
    - Включает fallback-инструкцию для вывода в stdout
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 2.2 Реализовать метод `readResultFromFile(outputPath, stdout, options?): Promise<{content, source}>`
    - Использует polling с интервалом 200мс и таймаутом 5 секунд
    - Возвращает контент из файла если файл существует и не пустой
    - Fallback на stdout если файл не найден
    - Логирует действия для отладки
    - _Requirements: 6.1, 6.2, 6.3, 6.5, 8.2, 8.5_

  - [x] 2.3 Добавить абстрактный метод `mapPermissionsToArgs(permissions): string[]`
    - Каждый адаптер реализует свой маппинг permissions на флаги CLI
    - _Requirements: 5.3_

  - [x] 2.4 Реализовать метод `validatePermissions(permissions): void`
    - Проверка что fullAccess не комбинируется с read/write
    - Проверка паттернов на path traversal (..)
    - _Requirements: 9.4_

### Фаза 3: Обновление Codex адаптера ✅ ЗАВЕРШЕНО

- [x] 3. Обновление CodexCLIAdapter
  - [x] 3.1 Реализовать метод `mapPermissionsToArgs(permissions): string[]`
    - Без permissions или пустой write: `--sandbox read-only`
    - С permissions.write: `--sandbox workspace-write`
    - С permissions.execute: добавить `--full-auto`
    - С permissions.fullAccess: `--yolo` (ОПАСНО)
    - _Requirements: 1.2, 1.3, 1.6, 9.1_

  - [x] 3.2 Обновить метод `prepareArguments()` для добавления флага `--output-last-message`
    - Если `request.outputFile` указан, добавить `--output-last-message <путь>`
    - Добавить флаги из `mapPermissionsToArgs()`
    - _Requirements: 1.1_

  - [x] 3.3 Обновить метод `execute()` для чтения файла после выполнения
    - После выполнения команды вызвать `readResultFromFile()`
    - Обновить метаданные ответа с `outputFile`, `resultSource`, `sandboxMode`
    - _Requirements: 1.4, 1.5_

  - [x] 3.4 Удалить использование `--yolo` по умолчанию
    - Убедиться что yolo используется ТОЛЬКО при явном permissions.fullAccess
    - _Requirements: 1.6, 9.1_

### Фаза 4: Обновление Claude адаптера ✅ ЗАВЕРШЕНО

- [x] 4. Обновление ClaudeCLIAdapter
  - [x] 4.1 Реализовать метод `mapPermissionsToArgs(permissions): string[]`
    - Базовые инструменты: `Read,Grep,Glob`
    - С permissions.write: добавить `Write` в --tools и --allowedTools
    - С permissions.execute: добавить `Bash` в --tools и --allowedTools
    - С permissions.fullAccess: `--dangerously-skip-permissions` (ОПАСНО)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.7, 9.1_

  - [x] 4.2 Обновить метод `prepareArguments()` для использования permissions
    - Добавить флаги из `mapPermissionsToArgs()`
    - Если `outputFile` указан, добавить инструкцию записи с инструментом `Write`
    - _Requirements: 2.1, 3.2_

  - [x] 4.3 Обновить метод `execute()` для чтения файла
    - После выполнения команды вызвать `readResultFromFile()`
    - Обновить метаданные ответа
    - _Requirements: 2.5, 2.6_

  - [x] 4.4 Убедиться что `--dangerously-skip-permissions` не используется по умолчанию
    - _Requirements: 2.7, 9.1_

### Фаза 5: Рефакторинг Gemini адаптера ✅ ЗАВЕРШЕНО

- [x] 5. Рефакторинг GeminiCLIAdapter
  - [x] 5.1 Обновить метод `execute()` для использования `outputFile` из request
    - Если `request.outputFile` указан, использовать его вместо извлечения из промпта
    - Использовать общий метод `readResultFromFile()` с polling
    - _Requirements: 5.2_

  - [x] 5.2 Реализовать метод `mapPermissionsToArgs(permissions): string[]`
    - Без permissions: безопасный режим (без --yolo и --allowed-tools)
    - С permissions.write: добавить `write_file` в --allowed-tools + --yolo
    - С permissions.execute: добавить `shell` в --allowed-tools + --yolo
    - С permissions.fullAccess: только --yolo
    - _Requirements: 5.3_

  - [x] 5.3 Обновить метаданные ответа
    - Добавить `outputFile`, `resultSource`, `permissionsMode`
    - _Requirements: 5.2_

### Фаза 6: Checkpoint - Базовая функциональность ✅ ЗАВЕРШЕНО

- [x] 6. Checkpoint - Базовая функциональность работает
  - Убедиться что все адаптеры компилируются без ошибок ✅
  - Проверить что базовые методы работают корректно ✅
  - Проверить что yolo/dangerously-skip-permissions НЕ используются по умолчанию ✅
  - Обновлены тесты для нового поведения ✅

### Фаза 7: Unit-тесты

- [ ] 7. Unit-тесты для BaseCLIAdapter
  - [ ]* 7.1 Тесты для `appendFileWriteInstruction()`
    - Проверить добавление инструкции с toolName
    - Проверить добавление инструкции без toolName
    - Проверить формат инструкции
    - _Requirements: 3.2_

  - [ ]* 7.2 Тесты для `readResultFromFile()`
    - Тест успешного чтения файла
    - Тест polling механизма (файл появляется с задержкой)
    - Тест fallback на stdout при отсутствии файла
    - Тест обработки пустых файлов
    - Тест таймаута
    - _Requirements: 6.1, 6.3, 6.5, 8.2_

  - [ ]* 7.3 Тесты для `validatePermissions()`
    - Тест валидации fullAccess + read/write
    - Тест валидации path traversal
    - _Requirements: 9.4_

- [ ] 8. Unit-тесты для CodexCLIAdapter
  - [ ]* 8.1 Тесты для `mapPermissionsToArgs()`
    - Тест без permissions → `--sandbox read-only`
    - Тест с permissions.write → `--sandbox workspace-write`
    - Тест с permissions.execute → добавляет `--full-auto`
    - Тест с permissions.fullAccess → `--yolo`
    - _Requirements: 1.2, 1.3, 1.6_

  - [ ]* 8.2 Тесты для `prepareArguments()` с outputFile
    - Проверить добавление `--output-last-message`
    - Проверить комбинацию с permissions
    - _Requirements: 1.1_

  - [ ]* 8.3 Тесты для `execute()` с файловым выводом
    - Мокировать чтение файла и проверить результат
    - Проверить fallback на stdout
    - Проверить метаданные ответа
    - _Requirements: 1.4, 1.5_

- [ ] 9. Unit-тесты для ClaudeCLIAdapter
  - [ ]* 9.1 Тесты для `mapPermissionsToArgs()`
    - Тест без permissions → `--tools "Read,Grep,Glob"`
    - Тест с permissions.write → добавляет `Write` и `--allowedTools "Write"`
    - Тест с permissions.execute → добавляет `Bash` (без allowedTools)
    - Тест с permissions.fullAccess → `--dangerously-skip-permissions`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.7_

  - [ ]* 9.2 Тесты для `execute()` с файловым выводом
    - Мокировать чтение файла и проверить результат
    - Проверить fallback на stdout
    - Проверить метаданные ответа
    - _Requirements: 2.5, 2.6_

- [ ] 10. Unit-тесты для GeminiCLIAdapter
  - [ ]* 10.1 Тесты для обновленного `execute()`
    - Проверить использование `request.outputFile`
    - Проверить использование общих методов
    - _Requirements: 5.1_

### Фаза 8: Property-based тесты

- [ ] 11. Property-based тесты
  - [ ]* 11.1 Property 1: Безопасность по умолчанию
    - Генерировать случайные permissions БЕЗ fullAccess
    - Проверять что yolo/dangerously-skip-permissions НИКОГДА не используются
    - Минимум 100 итераций
    - _Validates: Requirements 1.6, 2.7, 9.1_

  - [ ]* 11.2 Property 3: Запрет execute по умолчанию
    - Генерировать случайные permissions БЕЗ execute: true
    - Проверять что Bash инструмент НЕДОСТУПЕН
    - Минимум 100 итераций
    - _Validates: Requirements 2.4, 4.3, 9.6_

  - [ ]* 11.3 Property 4: Graceful degradation
    - Генерировать случайные сценарии без файла
    - Проверять что результат всегда читается из stdout
    - Минимум 100 итераций
    - _Validates: Requirements 6.1, 8.2_

  - [ ]* 11.4 Property 5: Адаптивная инструкция
    - Генерировать случайные outputFile для разных адаптеров
    - Проверять что инструкция содержит правильное имя инструмента
    - Минимум 100 итераций
    - _Validates: Requirement 3.2_

### Фаза 9: Checkpoint - Все тесты проходят

- [ ] 12. Checkpoint - Все тесты проходят
  - Убедиться что все unit-тесты проходят
  - Убедиться что все property-тесты проходят
  - Спросить пользователя, если возникли вопросы

### Фаза 10: Документация и примеры

- [ ] 13. Обновление документации
  - [ ] 13.1 Обновить README адаптеров
    - Добавить описание поддержки `outputFile`
    - Добавить описание системы `permissions`
    - Добавить таблицу маппинга permissions на флаги CLI
    - _Requirements: 7.1_

  - [ ] 13.2 Создать примеры workflow с использованием permissions
    - Пример: Только чтение (анализ кода)
    - Пример: Запись документации
    - Пример: Генерация кода
    - Добавить в `examples/` директорию
    - _Requirements: 7.1_

  - [ ] 13.3 Создать миграционное руководство
    - Описать изменения для существующих workflow
    - Объяснить обратную совместимость
    - Объяснить новую систему permissions
    - _Requirements: 7.1, 7.2, 7.3_

## Примечания

- Задачи, помеченные `*`, являются опциональными (тесты)
- Каждая задача ссылается на конкретные требования из requirements.md
- Checkpoints позволяют проверить прогресс и задать вопросы пользователю
- Property-based тесты должны выполняться минимум 100 итераций
- **КРИТИЧНО**: yolo и dangerously-skip-permissions НИКОГДА не используются автоматически
- Все изменения должны сохранять обратную совместимость

## Ключевые изменения от исходного плана

1. **Добавлена Фаза 1** - расширение типов с StepPermissions
2. **Переработана Фаза 3** - Codex теперь использует sandbox режимы вместо yolo
3. **Добавлена Фаза 4** - полная реализация для Claude адаптера
4. **Добавлены property-тесты безопасности** - проверка что yolo не используется автоматически
5. **Добавлены примеры workflow** с разными уровнями permissions
