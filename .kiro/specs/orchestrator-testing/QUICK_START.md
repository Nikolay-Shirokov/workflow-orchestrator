# 🚀 Быстрый старт: Комплексное тестирование оркестратора

## 📋 Что нужно знать перед началом

### Текущее состояние
- ✅ Базовая функциональность работает
- ✅ Mock-адаптеры протестированы
- ✅ UTF-8 кодировка исправлена
- ✅ Передача контекста работает
- ⏳ Реальные адаптеры не протестированы
- ⏳ Обработка ошибок частично протестирована
- ⏳ Resume не протестирован
- ⏳ Производительность не измерена

### Что будем делать
Систематически протестируем все аспекты оркестратора по 7 фазам:
1. Инфраструктура тестирования
2. Интеграция с CLI-адаптерами
3. Обработка ошибок
4. Resume функциональность
5. Пользовательский ввод
6. Производительность
7. Дополнительные тесты

## 🎯 Начало работы

### Шаг 1: Ознакомиться с документацией

```bash
# Прочитать требования (5 минут)
cat .kiro/specs/orchestrator-testing/requirements.md

# Прочитать дизайн (10 минут)
cat .kiro/specs/orchestrator-testing/design.md

# Открыть план задач
code .kiro/specs/orchestrator-testing/tasks.md
```

### Шаг 2: Подготовить окружение

```bash
# Убедиться, что все зависимости установлены
npm install

# Запустить существующие тесты
npm test

# Проверить покрытие
npm run test:coverage
```

### Шаг 3: Создать ветку для работы

```bash
# Создать feature ветку
git checkout -b feature/orchestrator-testing

# Или создать отдельные ветки для каждой фазы
git checkout -b feature/testing-phase-1-infrastructure
```

## 📝 Рекомендуемый порядок выполнения

### Вариант 1: Последовательное выполнение (рекомендуется)

Выполнять фазы строго по порядку:

```
Фаза 1 → Checkpoint → Фаза 2 → Checkpoint → ... → Фаза 7
```

**Преимущества:**
- Систематический подход
- Каждая фаза строится на предыдущей
- Легко отслеживать прогресс

**Недостатки:**
- Требует больше времени
- Нельзя пропустить фазы

### Вариант 2: Приоритетное выполнение

Выполнять только критические фазы:

```
Фаза 1 → Фаза 2 → Фаза 3 → Фаза 4
(Пропустить Фазы 5, 6, 7)
```

**Преимущества:**
- Быстрее получить результат
- Фокус на критических функциях

**Недостатки:**
- Неполное тестирование
- Могут остаться скрытые проблемы

### Вариант 3: Параллельное выполнение

Разделить работу между несколькими разработчиками:

```
Разработчик 1: Фазы 1, 2
Разработчик 2: Фаза 3
Разработчик 3: Фазы 4, 5
Разработчик 4: Фазы 6, 7
```

**Преимущества:**
- Быстрое выполнение
- Эффективное использование ресурсов

**Недостатки:**
- Требует координации
- Возможны конфликты в коде

## 🏃 Быстрый старт: Фаза 1

Если хочешь начать прямо сейчас, вот что нужно сделать:

### Задача 1.1: Создать структуру директорий

```bash
# Создать директории для тестов
mkdir -p tests/integration/cli-adapters
mkdir -p tests/integration/error-handling
mkdir -p tests/integration/resume
mkdir -p tests/integration/user-input
mkdir -p tests/performance
mkdir -p tests/fixtures/workflows
mkdir -p tests/fixtures/adapters
mkdir -p tests/fixtures/artifacts

# Проверить структуру
tree tests/
```

### Задача 1.2: Создать TestAdapter интерфейс

```typescript
// tests/helpers/test-adapter.ts

export interface TestAdapter {
  name: string;
  command: string;
  available: boolean;
  
  // Проверка доступности
  checkAvailability(): Promise<boolean>;
  
  // Выполнение с таймаутом
  execute(prompt: string, timeout?: number): Promise<string>;
  
  // Мокирование для тестов
  mock(response: string | Error): void;
  unmock(): void;
}

export class BaseTestAdapter implements TestAdapter {
  // Реализация...
}
```

### Задача 1.3: Создать первый тест

```typescript
// tests/integration/cli-adapters/base.test.ts

import { BaseTestAdapter } from '../../helpers/test-adapter';

describe('TestAdapter', () => {
  it('should check availability', async () => {
    const adapter = new BaseTestAdapter('test', 'echo');
    const available = await adapter.checkAvailability();
    expect(available).toBe(true);
  });
  
  it('should execute command', async () => {
    const adapter = new BaseTestAdapter('test', 'echo');
    const result = await adapter.execute('Hello');
    expect(result).toContain('Hello');
  });
});
```

### Запустить тест

```bash
# Запустить новый тест
npm test -- tests/integration/cli-adapters/base.test.ts

# Если тест проходит - переходить к следующей задаче
```

## 📊 Отслеживание прогресса

### Обновление прогресса

После завершения каждой задачи:

1. Отметить задачу в `tasks.md`:
```markdown
- [x] 1.1 Создать структуру директорий для тестов
```

2. Обновить прогресс в `PLAN_SUMMARY.md`:
```markdown
Фаза 1: Инфраструктура       [██░░░░░░░░] 1/6   (17%)
```

3. Зафиксировать изменения:
```bash
git add .
git commit -m "feat(testing): complete task 1.1 - create test directories"
```

### Checkpoint после каждой фазы

После завершения фазы:

1. Запустить все тесты:
```bash
npm test
```

2. Проверить покрытие:
```bash
npm run test:coverage
```

3. Обновить `DEBUGGING_REPORT.md`:
```markdown
### Фаза 1: Инфраструктура ✅
**Статус:** Завершено
**Дата:** 2026-01-13
**Результат:** Все утилиты работают корректно
```

4. Создать PR или merge в main:
```bash
git push origin feature/testing-phase-1-infrastructure
# Создать Pull Request
```

## 🛠️ Полезные команды

### Тестирование

```bash
# Запустить все тесты
npm test

# Запустить тесты в watch режиме
npm test -- --watch

# Запустить конкретный тест
npm test -- tests/integration/cli-adapters/claude.test.ts

# Запустить тесты с покрытием
npm run test:coverage

# Запустить только integration тесты
npm test -- tests/integration/

# Запустить только performance тесты
npm test -- tests/performance/
```

### Отладка

```bash
# Запустить тесты с debug логами
DEBUG=* npm test

# Запустить тесты с node inspector
node --inspect-brk node_modules/.bin/jest

# Профилирование
node --prof node_modules/.bin/jest
```

### Линтинг и форматирование

```bash
# Проверить код
npm run lint

# Исправить автоматически
npm run lint:fix

# Форматировать код
npm run format
```

## 📚 Дополнительные ресурсы

### Документация проекта
- [README.md](../../../README.md) - Общая информация
- [DEBUGGING_REPORT.md](../../../DEBUGGING_REPORT.md) - Отчет об отладке
- [TESTING_STATUS.md](../../../TESTING_STATUS.md) - Статус тестов

### Документация спецификации
- [requirements.md](./requirements.md) - Требования
- [design.md](./design.md) - Дизайн
- [tasks.md](./tasks.md) - Задачи
- [PLAN_SUMMARY.md](./PLAN_SUMMARY.md) - Сводка плана
- [ROADMAP.md](./ROADMAP.md) - Дорожная карта

### Внешние ресурсы
- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [TypeScript Testing](https://www.typescriptlang.org/docs/handbook/testing.html)
- [Property-Based Testing](https://github.com/dubzzz/fast-check)

## ❓ FAQ

### Q: Нужно ли выполнять все задачи?
A: Обязательны только задачи из Фаз 1-4 (высокий приоритет). Фазы 5-7 можно пропустить для MVP.

### Q: Что делать, если реальные адаптеры недоступны?
A: Использовать mock-адаптеры. Тесты с реальными адаптерами опциональны.

### Q: Сколько времени займет полное тестирование?
A: При последовательном выполнении - около 4 недель. При параллельном - 1-2 недели.

### Q: Можно ли пропустить тесты производительности?
A: Да, они имеют низкий приоритет. Но рекомендуется выполнить хотя бы базовые тесты.

### Q: Что делать при обнаружении бага?
A: 
1. Создать issue в GitHub
2. Добавить failing test
3. Исправить баг
4. Убедиться, что тест проходит
5. Задокументировать в DEBUGGING_REPORT.md

## 🎯 Следующие шаги

1. **Прочитать документацию** (30 минут)
   - requirements.md
   - design.md
   - tasks.md

2. **Подготовить окружение** (15 минут)
   - Установить зависимости
   - Запустить существующие тесты
   - Создать ветку

3. **Начать Фазу 1** (2 дня)
   - Задача 1.1: Структура директорий
   - Задача 1.2: TestAdapter
   - Задача 1.3: AdapterTestHelper
   - Задача 1.4: WorkflowTestHelper
   - Задача 1.5: ArtifactTestHelper
   - Задача 1.6: Checkpoint

4. **Продолжить по плану**
   - Фаза 2: CLI-адаптеры
   - Фаза 3: Обработка ошибок
   - И так далее...

## 💡 Советы

- **Делай коммиты часто** - после каждой задачи
- **Пиши тесты сначала** (TDD) - это поможет лучше понять требования
- **Используй checkpoints** - не пропускай их
- **Документируй проблемы** - обновляй DEBUGGING_REPORT.md
- **Проси помощи** - если застрял, спроси в чате
- **Не торопись** - качество важнее скорости

---

**Готов начать?** Открой `tasks.md` и начни с Задачи 1.1! 🚀

```bash
code .kiro/specs/orchestrator-testing/tasks.md
```
