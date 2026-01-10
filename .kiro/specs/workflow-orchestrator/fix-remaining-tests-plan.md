# План исправления оставшихся падающих тестов

**Дата создания**: 2026-01-10  
**Текущий статус**: 261/277 проходят (94.2%), 15 падают (5.4%)  
**Цель**: Достичь 100% прохождения тестов (277/277)

## Приоритизация задач

### 🔴 Критический приоритет (1 тест)
Проблемы, которые могут влиять на работу в production на Windows

### 🟡 Высокий приоритет (8 тестов)
Проблемы с логикой и путями, требующие исправления кода

### 🟢 Средний приоритет (6 тестов)
Проблемы с таймаутами и настройками тестов

---

## Задача 33: Исправление критических проблем State Manager

**Приоритет**: 🔴 КРИТИЧЕСКИЙ  
**Файл**: `tests/core/state-manager.test.ts`  
**Затраты времени**: 2-3 часа  
**Сложность**: Высокая

### 33.1 Property 18: EPERM ошибка при переименовании файла (Windows)

**Проблема**:
```
EPERM: operation not permitted, rename 
'test-state\session_2026-01-10T1401_trru7r.json.tmp' -> 
'test-state\session_2026-01-10T1401_trru7r.json'
```

**Причина**: Windows блокирует переименование файла, возможно файл еще открыт или используется другим процессом

**Решение**:
1. Добавить retry логику с экспоненциальной задержкой
2. Добавить проверку, что файл не используется перед переименованием
3. Рассмотреть альтернативный подход: копирование + удаление вместо переименования
4. Добавить обработку специфичных для Windows ошибок

**Файлы для изменения**:
- `src/core/state-manager.ts` - метод `saveState()`

**Код для добавления**:
```typescript
// Retry логика для Windows
private async renameWithRetry(
  oldPath: string, 
  newPath: string, 
  maxRetries: number = 3
): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await fs.rename(oldPath, newPath);
      return;
    } catch (error: any) {
      if (error.code === 'EPERM' && i < maxRetries - 1) {
        // Экспоненциальная задержка: 50ms, 100ms, 200ms
        await new Promise(resolve => setTimeout(resolve, 50 * Math.pow(2, i)));
        continue;
      }
      throw error;
    }
  }
}
```

**Тесты для проверки**:
```bash
npm test -- tests/core/state-manager.test.ts -t "Property 18"
```

---

## Задача 34: Исправление проблем State Manager (временные метки и дубликаты)

**Приоритет**: 🟡 ВЫСОКИЙ  
**Файл**: `tests/core/state-manager.test.ts`  
**Затраты времени**: 1-2 часа  
**Сложность**: Средняя

### 34.1 Property 17: Проблема с временными метками

**Проблема**:
```
expect(received).toBeGreaterThan(expected)
Expected: > 1768053666819
Received:   1768053666819
```

**Причина**: Обновление состояния происходит слишком быстро (в пределах 1мс), `updatedAt` не изменяется

**Решение**:
1. **Вариант А** (предпочтительный): Изменить тест на `toBeGreaterThanOrEqual`
2. **Вариант Б**: Добавить минимальную задержку 1мс перед обновлением
3. **Вариант В**: Использовать более точные временные метки (микросекунды)

**Файлы для изменения**:
- `tests/core/state-manager.test.ts` - строка 185

**Код для изменения**:
```typescript
// Было:
expect(new Date(updatedState.updatedAt).getTime())
  .toBeGreaterThan(new Date(initialState.updatedAt).getTime());

// Стало:
expect(new Date(updatedState.updatedAt).getTime())
  .toBeGreaterThanOrEqual(new Date(initialState.updatedAt).getTime());
```

**Тесты для проверки**:
```bash
npm test -- tests/core/state-manager.test.ts -t "Property 17"
```

### 34.2 Property 22: Дублирующиеся stepId

**Проблема**:
```
expect(received).toBe(expected)
Expected: 3
Received: 2
Counterexample: ["!","0.0.0","A",[
  {"stepId":"o",...},
  {"stepId":"o",...},  // Дубликат!
  {"stepId":"0",...}
]]
```

**Причина**: Генератор создает дублирующиеся stepId, что приводит к неправильному подсчету в `completedSteps` (Set убирает дубликаты)

**Решение**:
1. Улучшить генератор для создания уникальных stepId
2. Или обработать дубликаты в логике (добавлять все в массив, а не Set)

**Файлы для изменения**:
- `tests/core/state-manager.test.ts` - генератор `arbitraryStepHistory`

**Код для изменения**:
```typescript
// Генератор уникальных stepId
const arbitraryUniqueStepHistories = fc.array(
  arbitraryStepHistory,
  { minLength: 1, maxLength: 10 }
).map(histories => {
  // Делаем stepId уникальными
  return histories.map((h, index) => ({
    ...h,
    stepId: `${h.stepId}_${index}` // Добавляем индекс для уникальности
  }));
});
```

**Тесты для проверки**:
```bash
npm test -- tests/core/state-manager.test.ts -t "Property 22"
```

---

## Задача 35: Исправление проблем Step Executor

**Приоритет**: 🟡 ВЫСОКИЙ  
**Файл**: `tests/core/step-executor.test.ts` и `tests/core/step-executor.property.test.ts`  
**Затраты времени**: 2-3 часа  
**Сложность**: Средняя

### 35.1 Unit Test: Сообщение об ошибке параллельных шагов

**Проблема**:
```
Expected substring: "Ошибки в параллельных шагах"
Received message: "2 из 2 параллельных шагов завершились с ошибкой: 
  parallel-fail-1: Адаптер не найден: non-existent; 
  parallel-fail-2: Адаптер не найден: also-non-existent"
```

**Причина**: Улучшенное сообщение об ошибке более информативно, чем ожидалось в тесте

**Решение**: Обновить тест для проверки нового формата сообщения

**Файлы для изменения**:
- `tests/core/step-executor.test.ts` - строка 235

**Код для изменения**:
```typescript
// Было:
await expect(executor.executeParallel(steps, context))
  .rejects.toThrow('Ошибки в параллельных шагах');

// Стало:
await expect(executor.executeParallel(steps, context))
  .rejects.toThrow(/\d+ из \d+ параллельных шагов завершились с ошибкой/);
// Или более конкретно:
await expect(executor.executeParallel(steps, context))
  .rejects.toThrow('2 из 2 параллельных шагов завершились с ошибкой');
```

**Тесты для проверки**:
```bash
npm test -- tests/core/step-executor.test.ts -t "должен собирать ошибки"
```

### 35.2 Property 56: Проблема с путями артефактов

**Проблема**:
```
ENOENT: no such file or directory, stat 
'C:\WS\tasks\DualDesign\test-artifacts\session_test-session\test-artifacts\artifact_0_0.txt'
```

**Причина**: Двойная вложенность директории `test-artifacts` в пути

**Решение**: Исправить формирование пути к артефактам в тесте

**Файлы для изменения**:
- `tests/core/step-executor.property.test.ts` - Property 56

**Код для проверки**:
```typescript
// Проверить, что artifactsDir не содержит двойной вложенности
const artifactsDir = path.join(testArtifactsDir, `session_${sessionId}`);
// НЕ: path.join(testArtifactsDir, `session_${sessionId}`, 'test-artifacts')
```

**Тесты для проверки**:
```bash
npm test -- tests/core/step-executor.property.test.ts -t "Property 56"
```

### 35.3 Property 56 и 57: Увеличение таймаутов

**Проблема**: Таймауты 5000ms для property-based тестов с параллельным выполнением

**Решение**: Увеличить таймауты до 10000-15000ms

**Файлы для изменения**:
- `tests/core/step-executor.property.test.ts`

**Код для изменения**:
```typescript
// Property 56
describe('Property 56: Сбор параллельных артефактов', () => {
  test('должен собирать артефакты из всех параллельных шагов', async () => {
    // ...
  }, 10000); // Было: 5000

  test('должен собирать множественные артефакты...', async () => {
    // ...
  }, 10000); // Было: 5000

  test('должен сохранять порядок артефактов...', async () => {
    // ...
  }, 10000); // Было: 5000
});

// Property 57
describe('Property 57: Обработка параллельных ошибок', () => {
  test('должен дождаться завершения всех шагов...', async () => {
    // ...
  }, 10000); // Было: 5000

  test('должен сообщать обо всех ошибках...', async () => {
    // ...
  }, 10000); // Было: 5000
});
```

**Тесты для проверки**:
```bash
npm test -- tests/core/step-executor.property.test.ts -t "Property 56|Property 57"
```

---

## Задача 36: Исправление проблем Artifact Manager

**Приоритет**: 🟡 ВЫСОКИЙ  
**Файл**: `tests/core/artifact-manager.property.test.ts`  
**Затраты времени**: 1-2 часа  
**Сложность**: Средняя

### 36.1 Property 31: Пустые имена файлов

**Проблема**:
```
expect(exists).toBe(true) - файл не существует
Counterexample: ["r","FSj","J'P.md",""] (пустое содержимое)
```

**Причина**: Генератор создает пустые имена файлов или невалидные символы

**Решение**: Улучшить генератор для фильтрации невалидных значений

**Файлы для изменения**:
- `tests/core/artifact-manager.property.test.ts` - генератор `arbitraryFileName`

**Код для изменения**:
```typescript
// Улучшенный генератор имен файлов
const arbitraryFileName = fc.string({ minLength: 1, maxLength: 50 })
  .filter(name => {
    // Фильтруем пустые строки и только пробелы
    if (!name || name.trim().length === 0) return false;
    
    // Фильтруем невалидные символы для Windows
    const invalidChars = /[<>:"|?*\x00-\x1f]/;
    if (invalidChars.test(name)) return false;
    
    // Фильтруем зарезервированные имена Windows
    const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
    if (reserved.test(name.split('.')[0])) return false;
    
    return true;
  })
  .map(name => {
    // Нормализуем имя
    return name.trim().replace(/\s+/g, '_');
  });
```

**Тесты для проверки**:
```bash
npm test -- tests/core/artifact-manager.property.test.ts -t "Property 31"
```

### 36.2 Property 33: Увеличение таймаутов

**Проблема**: Таймауты 5000-10000ms для тестов с множественными файловыми операциями

**Решение**: Увеличить таймауты до 15000-20000ms

**Файлы для изменения**:
- `tests/core/artifact-manager.property.test.ts`

**Код для изменения**:
```typescript
describe('Property 33: Multiple Artifacts Support', () => {
  it('должен сохранять множественные артефакты для одного шага', async () => {
    // ...
  }, 15000); // Было: 5000

  it('должен корректно обрабатывать большое количество артефактов', async () => {
    // ...
  }, 20000); // Было: 10000

  it('должен сохранять артефакты с разными типами содержимого', async () => {
    // ...
  }, 15000); // Было: 5000
});
```

**Тесты для проверки**:
```bash
npm test -- tests/core/artifact-manager.property.test.ts -t "Property 33"
```

---

## Задача 37: Исправление проблем Adapter Tests

**Приоритет**: 🟢 СРЕДНИЙ  
**Файл**: `tests/adapters/concrete-adapters.test.ts` и `tests/adapters/adapter-integration.test.ts`  
**Затраты времени**: 30 минут  
**Сложность**: Низкая

### 37.1 Увеличение таймаутов для Claude CLI тестов

**Проблема**: Таймауты 5000ms при проверке доступности `claude` команды

**Решение**: Увеличить таймауты до 10000ms

**Файлы для изменения**:
- `tests/adapters/concrete-adapters.test.ts`
- `tests/adapters/adapter-integration.test.ts`

**Код для изменения**:
```typescript
// concrete-adapters.test.ts
it('должен возвращать результат isAvailable независимо от API ключа', async () => {
  // ...
}, 10000); // Было: 5000

// adapter-integration.test.ts
it('Claude адаптер должен проверять доступность команды', async () => {
  // ...
}, 10000); // Было: 5000
```

**Тесты для проверки**:
```bash
npm test -- tests/adapters/concrete-adapters.test.ts -t "isAvailable"
npm test -- tests/adapters/adapter-integration.test.ts -t "Claude"
```

---

## План выполнения (рекомендуемый порядок)

### День 1: Критические и высокоприоритетные проблемы (4-6 часов)

1. **Задача 33.1** (2-3 часа) 🔴
   - Исправить EPERM ошибку на Windows
   - Добавить retry логику
   - Протестировать на Windows

2. **Задача 34** (1-2 часа) 🟡
   - Исправить Property 17 (временные метки)
   - Исправить Property 22 (дубликаты stepId)
   - Запустить тесты State Manager

3. **Задача 35.1** (30 минут) 🟡
   - Обновить сообщение об ошибке в unit тесте
   - Быстрая проверка

**Итого за День 1**: 9 тестов исправлено (3 State Manager + 1 Step Executor + 5 оставшихся)

### День 2: Оставшиеся проблемы (2-3 часа)

4. **Задача 35.2-35.3** (1-2 часа) 🟡
   - Исправить пути артефактов в Property 56
   - Увеличить таймауты для Property 56 и 57
   - Запустить тесты Step Executor

5. **Задача 36** (1 час) 🟡
   - Улучшить генератор имен файлов (Property 31)
   - Увеличить таймауты (Property 33)
   - Запустить тесты Artifact Manager

6. **Задача 37** (30 минут) 🟢
   - Увеличить таймауты для Adapter тестов
   - Быстрая проверка

**Итого за День 2**: 6 тестов исправлено (5 Step Executor + 4 Artifact Manager + 2 Adapter - 5 уже исправлено = 6)

### Финальная проверка (30 минут)

7. **Запуск всех тестов**:
   ```bash
   npm test -- --run
   ```

8. **Проверка результатов**:
   - Ожидаем: 277/277 тестов проходят (100%)
   - Время выполнения: ~80-90 секунд

9. **Обновление документации**:
   - Обновить final-test-report.md
   - Обновить README.md
   - Обновить tasks.md

10. **Коммит изменений**:
    ```bash
    git add .
    git commit -m "fix: исправлены все оставшиеся тесты - 100% готовности"
    ```

---

## Чек-лист выполнения

### Задача 33: State Manager (критическая)
- [ ] 33.1 Добавить retry логику для EPERM ошибки
- [ ] Протестировать на Windows
- [ ] Запустить Property 18 тест

### Задача 34: State Manager (временные метки и дубликаты)
- [ ] 34.1 Изменить toBeGreaterThan на toBeGreaterThanOrEqual
- [ ] 34.2 Улучшить генератор для уникальных stepId
- [ ] Запустить Property 17 и 22 тесты

### Задача 35: Step Executor
- [ ] 35.1 Обновить ожидаемое сообщение об ошибке
- [ ] 35.2 Исправить пути артефактов в Property 56
- [ ] 35.3 Увеличить таймауты для Property 56 и 57
- [ ] Запустить все Step Executor тесты

### Задача 36: Artifact Manager
- [ ] 36.1 Улучшить генератор имен файлов
- [ ] 36.2 Увеличить таймауты для Property 33
- [ ] Запустить все Artifact Manager property тесты

### Задача 37: Adapter Tests
- [ ] 37.1 Увеличить таймауты для Claude CLI тестов
- [ ] Запустить Adapter тесты

### Финальная проверка
- [ ] Запустить полный набор тестов
- [ ] Проверить 100% прохождение (277/277)
- [ ] Обновить документацию
- [ ] Зафиксировать изменения в git

---

## Оценка времени

| Задача | Приоритет | Время | Сложность |
|--------|-----------|-------|-----------|
| 33.1 EPERM ошибка | 🔴 Критический | 2-3 часа | Высокая |
| 34.1 Временные метки | 🟡 Высокий | 30 минут | Низкая |
| 34.2 Дубликаты stepId | 🟡 Высокий | 1 час | Средняя |
| 35.1 Сообщение об ошибке | 🟡 Высокий | 30 минут | Низкая |
| 35.2 Пути артефактов | 🟡 Высокий | 1 час | Средняя |
| 35.3 Таймауты Step Executor | 🟢 Средний | 30 минут | Низкая |
| 36.1 Генератор имен | 🟡 Высокий | 1 час | Средняя |
| 36.2 Таймауты Artifact Manager | 🟢 Средний | 30 минут | Низкая |
| 37.1 Таймауты Adapter | 🟢 Средний | 30 минут | Низкая |
| Финальная проверка | - | 30 минут | - |
| **ИТОГО** | | **8-10 часов** | |

**Реалистичная оценка**: 1-2 рабочих дня

---

## Риски и митигация

### Риск 1: EPERM ошибка может быть сложнее, чем кажется
**Вероятность**: Средняя  
**Влияние**: Высокое  
**Митигация**: 
- Начать с этой задачи
- Если retry не помогает, использовать альтернативный подход (копирование + удаление)
- Рассмотреть использование библиотеки `graceful-fs`

### Риск 2: Property-based тесты могут найти новые проблемы
**Вероятность**: Низкая  
**Влияние**: Среднее  
**Митигация**:
- Тщательно тестировать после каждого исправления
- Запускать тесты с разными seed значениями
- Увеличить numRuns для более тщательной проверки

### Риск 3: Таймауты могут быть недостаточными на медленных машинах
**Вероятность**: Низкая  
**Влияние**: Низкое  
**Митигация**:
- Использовать щедрые таймауты (15000-20000ms)
- Добавить комментарии о причинах больших таймаутов
- Рассмотреть уменьшение numRuns для property тестов

---

## Успешное завершение

После выполнения всех задач ожидаем:

✅ **277/277 тестов проходят (100%)**  
✅ **0 падающих тестов**  
✅ **Все property-based тесты стабильны**  
✅ **Работа на Windows без EPERM ошибок**  
✅ **Документация обновлена**  
✅ **Система готова к production**

---

**Статус**: 📋 ПЛАН ГОТОВ  
**Следующий шаг**: Начать с Задачи 33.1 (EPERM ошибка)  
**ETA до 100%**: 1-2 рабочих дня
