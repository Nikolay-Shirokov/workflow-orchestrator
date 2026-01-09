# Ядро Workflow Orchestrator

## Компоненты

### WorkflowConfigParser

Парсер конфигурации рабочих процессов, отвечающий за загрузку, валидацию и построение графа зависимостей.

#### Основные возможности

1. **Загрузка конфигурации из файлов**
   - Поддержка YAML и JSON форматов
   - Автоматическое определение формата по расширению файла

2. **Валидация структуры**
   - Проверка обязательных полей
   - Валидация типов шагов
   - Проверка уникальности ID шагов
   - Обнаружение ссылок на несуществующие шаги

3. **Обнаружение циклических зависимостей**
   - DFS-алгоритм для поиска циклов
   - Детальные сообщения об ошибках с путями циклов

4. **Построение графа зависимостей**
   - Топологическая сортировка шагов
   - Определение порядка выполнения

#### Пример использования

```typescript
import { WorkflowConfigParser } from './core/workflow-config-parser.js';

const parser = new WorkflowConfigParser();

// Загрузка из файла
const config = await parser.loadFromFile('workflow.yaml');

// Валидация
const validationResult = parser.validate(config);
if (!validationResult.valid) {
  console.error('Ошибки валидации:', validationResult.errors);
  process.exit(1);
}

// Построение графа зависимостей
const graph = parser.buildDependencyGraph(config.steps);
console.log('Порядок выполнения:', graph.executionOrder);
```

#### Формат конфигурации

```yaml
workflow:
  name: "my-workflow"
  version: "1.0"
  settings:
    artifacts_dir: "artifacts"
  steps:
    - id: "step1"
      name: "First Step"
      type: "model"
    - id: "step2"
      name: "Second Step"
      type: "model"
      depends_on: ["step1"]
```

#### Коды ошибок валидации

- `MISSING_NAME` - Отсутствует имя рабочего процесса
- `MISSING_VERSION` - Отсутствует версия
- `MISSING_SETTINGS` - Отсутствуют настройки
- `MISSING_ARTIFACTS_DIR` - Не указана директория артефактов
- `NO_STEPS` - Нет шагов в конфигурации
- `MISSING_STEP_ID` - Отсутствует ID шага
- `DUPLICATE_STEP_ID` - Дублирующийся ID шага
- `MISSING_STEP_NAME` - Отсутствует имя шага
- `MISSING_STEP_TYPE` - Не указан тип шага
- `INVALID_STEP_TYPE` - Невалидный тип шага
- `INVALID_DEPENDENCY` - Ссылка на несуществующий шаг
- `CIRCULAR_DEPENDENCY` - Обнаружена циклическая зависимость
- `PARALLEL_NO_STEPS` - Параллельный шаг без вложенных шагов

### Logger

Система логирования на основе Winston.

#### Пример использования

```typescript
import { Logger, LogLevel } from './core/logger.js';

const logger = new Logger({
  level: LogLevel.INFO,
  enableConsole: true,
  enableFile: true,
  logFilePath: 'app.log'
});

logger.info('Приложение запущено');
logger.error('Произошла ошибка', new Error('Test error'));
```

### Types

Все TypeScript интерфейсы и типы для системы.

## Тестирование

Все компоненты покрыты property-based тестами с использованием fast-check:

- **Property 6**: Парсинг YAML и JSON производит эквивалентные результаты
- **Property 7**: Валидация обнаруживает циклические зависимости и невалидные ссылки
- **Property 9**: Все поля конфигурации сохраняются после парсинга

Запуск тестов:

```bash
npm test
```
