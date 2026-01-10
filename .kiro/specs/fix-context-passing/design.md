# Design Document: Исправление передачи контекста между шагами

## Overview

Этот документ описывает дизайн решения для исправления проблем с передачей контекста между шагами workflow. Решение включает улучшение обработки вложенных подстановок, двойную передачу контекста (содержимое + путь), и опциональное обрамление контекста в теги.

## Architecture

### Компоненты системы

```
┌─────────────────────────────────────────────────────────────┐
│                     Workflow Engine                          │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              Step Executor                             │ │
│  │  - executeModelStep()                                  │ │
│  │  - Создает outputs с содержимым и путями              │ │
│  └────────────────────────────────────────────────────────┘ │
│                           ↓                                  │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              Context Manager                           │ │
│  │  - Хранит переменные контекста                        │ │
│  │  - output_name → содержимое                           │ │
│  │  - output_name_file → путь к файлу                    │ │
│  └────────────────────────────────────────────────────────┘ │
│                           ↓                                  │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              Template Engine                           │ │
│  │  - render()                                            │ │
│  │  - evaluateExpression()                                │ │
│  │  - evaluateArtifact()                                  │ │
│  │  - wrapInTags()                                        │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Template Engine - Улучшенная обработка артефактов

#### Новый синтаксис

```typescript
// Существующий синтаксис (продолжает работать)
${variable}                          // Простая переменная
${artifact:path/to/file}             // Прямой путь к файлу

// Новый синтаксис
${artifact:${variable}}              // Вложенная переменная (путь из контекста)
${artifact:${variable}:tag_name}     // С обрамлением в теги
```

#### Метод evaluateArtifact (улучшенный)

```typescript
private evaluateArtifact(expression: string, context: TemplateContext): string {
  // Парсим выражение: artifact:path[:tag]
  const parts = expression.slice(9).split(':');
  const pathExpression = parts[0].trim();
  const tagName = parts[1]?.trim();
  
  // Если путь содержит переменные, они будут разрешены на следующей итерации
  if (pathExpression.includes('${')) {
    throw new Error(`Переменная в пути артефакта еще не разрешена: ${pathExpression}`);
  }
  
  // Загружаем содержимое
  let content = this.loadArtifactContent(pathExpression, context);
  
  // Обрамляем в теги, если указано
  if (tagName) {
    content = this.wrapInTags(content, tagName);
  }
  
  return content;
}

private loadArtifactContent(path: string, context: TemplateContext): string {
  // Проверяем кэш
  const cached = this.artifactCache.get(path);
  if (cached && !this.isCacheExpired(cached)) {
    return cached.content;
  }
  
  // Загружаем из файла
  const content = context.loadArtifact(path);
  
  // Кэшируем
  this.artifactCache.set(path, {
    content,
    timestamp: Date.now()
  });
  
  return content;
}

private wrapInTags(content: string, tagName: string): string {
  // Экранируем специальные символы в имени тега
  const safeName = tagName.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `<${safeName}>\n${content}\n</${safeName}>`;
}
```

### 2. Step Executor - Двойная передача контекста

#### Улучшенный метод executeModelStep

```typescript
private async executeModelStep(
  step: WorkflowStep,
  context: ExecutionContext
): Promise<StepResult> {
  // ... существующий код ...
  
  // Сохранение артефактов
  const artifacts: string[] = [];
  
  if (step.outputs) {
    for (const [outputName, outputPath] of Object.entries(step.outputs)) {
      const renderedPath = context.templateEngine.render(
        outputPath,
        this.createTemplateContext(context)
      );
      
      // Сохранение артефакта
      const artifactPath = await context.artifactManager.save(
        context.state.sessionId,
        step.id,
        renderedPath,
        response.content
      );
      
      artifacts.push(artifactPath);
      
      // ДВОЙНАЯ ПЕРЕДАЧА КОНТЕКСТА:
      // 1. Содержимое напрямую (для быстрого доступа)
      context.state.context[outputName] = response.content;
      
      // 2. Путь к файлу (для явной загрузки)
      context.state.context[`${outputName}_file`] = artifactPath;
      
      // 3. Сохраняем в artifacts для отслеживания
      context.state.artifacts[outputName] = artifactPath;
      
      context.logger.debug(
        `Добавлено в контекст: ${outputName} (${response.content.length} символов), ` +
        `${outputName}_file (${artifactPath})`
      );
    }
  }
  
  return {
    stepId: step.id,
    status: 'success',
    outputs: { content: response.content },
    artifacts,
    executionTime: response.executionTime
  };
}
```

### 3. Обновление промптов - Рекомендуемые практики

#### Вариант 1: Прямое использование содержимого (рекомендуется)

```markdown
## Вопросы второго пилота

${copilot_questions}
```

**Преимущества:**
- Быстрее (нет чтения файла)
- Проще синтаксис
- Меньше операций I/O

#### Вариант 2: Загрузка из файла с тегами

```markdown
## Вопросы второго пилота

${artifact:${copilot_questions_file}:copilot_questions}
```

**Результат:**
```markdown
## Вопросы второго пилота

<copilot_questions>
# Вопросы второго пилота
1. Какова основная бизнес-цель?
...
</copilot_questions>
```

**Преимущества:**
- Четкие границы контекста для AI
- Полезно для больших вложенных данных
- Помогает модели различать разные части промпта

#### Вариант 3: Загрузка из файла без тегов

```markdown
## Вопросы второго пилота

${artifact:${copilot_questions_file}}
```

**Использовать когда:**
- Нужно явно загрузить из файла
- Содержимое может быть обновлено внешним процессом
- Нужна гарантия актуальности данных

## Data Models

### Context Structure

```typescript
interface WorkflowContext {
  // Системные переменные
  workflow_name: string;
  workflow_version: string;
  session_id: string;
  timestamp: string;
  artifacts_dir: string;
  default_adapter: string;
  
  // Пользовательские переменные
  user_request: string;
  
  // Outputs шагов (содержимое)
  architect_questions: string;
  copilot_questions: string;
  architect_analysis: string;
  copilot_analysis: string;
  
  // Outputs шагов (пути к файлам)
  architect_questions_file: string;
  copilot_questions_file: string;
  architect_analysis_file: string;
  copilot_analysis_file: string;
  
  // MCP контекст
  mcp_tools?: {
    web_search_available: boolean;
    // ... другие инструменты
  };
}
```

### Artifact Cache Entry

```typescript
interface ArtifactCacheEntry {
  content: string;
  timestamp: number;
  size: number;
  path: string;
}
```

## Correctness Properties

*Свойство - это характеристика или поведение, которое должно выполняться во всех корректных выполнениях системы.*

### Property 1: Вложенные переменные разрешаются корректно

*For any* шаблон с выражением `${artifact:${variable}}`, где `variable` определена в контексте как путь к существующему файлу, рендеринг шаблона должен вернуть содержимое этого файла.

**Validates: Requirements 1.1, 1.2**

### Property 2: Двойная передача контекста

*For any* шаг, создающий артефакт с именем `output_name`, в контексте должны присутствовать обе переменные: `output_name` (содержимое) и `output_name_file` (путь).

**Validates: Requirements 2.1, 2.2, 2.3**

### Property 3: Кэширование артефактов

*For any* артефакт, загруженный из файла, повторная загрузка в течение 5 минут должна вернуть закэшированное содержимое без чтения файла.

**Validates: Requirements 3.2, 3.3**

### Property 4: Обрамление в теги

*For any* выражение `${artifact:${variable}:tag_name}`, результат должен начинаться с `<tag_name>` и заканчиваться `</tag_name>`.

**Validates: Requirements 4.1, 4.2, 4.3**

### Property 5: Обратная совместимость

*For any* существующий шаблон, использующий синтаксис `${variable}`, `${artifact:path}`, или `${if:condition:then:else}`, рендеринг должен работать без изменений.

**Validates: Requirements 6.1, 6.2, 6.3, 6.4**

### Property 6: Понятные сообщения об ошибках

*For any* ошибка разрешения переменной или загрузки артефакта, сообщение об ошибке должно содержать имя переменной/файла и список доступных альтернатив.

**Validates: Requirements 5.1, 5.2, 5.3, 5.4**

## Error Handling

### Типы ошибок

1. **UNDEFINED_VARIABLE**: Переменная не найдена в контексте
   - Сообщение: "Переменная не определена: {name}"
   - Контекст: Список доступных переменных
   - Восстановление: Невозможно

2. **ARTIFACT_NOT_FOUND**: Файл артефакта не существует
   - Сообщение: "Артефакт не найден: {path}"
   - Контекст: Шаг, который должен был создать файл
   - Восстановление: Невозможно

3. **ARTIFACT_READ_ERROR**: Ошибка чтения файла
   - Сообщение: "Не удалось прочитать артефакт: {path}"
   - Контекст: Причина ошибки (права, кодировка)
   - Восстановление: Возможно (повторная попытка)

4. **MAX_ITERATIONS_EXCEEDED**: Превышен лимит итераций
   - Сообщение: "Превышен лимит итераций (циклическая зависимость?)"
   - Контекст: Цепочка вложенных переменных
   - Восстановление: Невозможно

### Стратегии обработки

```typescript
try {
  const content = this.loadArtifactContent(path, context);
  return content;
} catch (error) {
  if (error.code === 'ENOENT') {
    throw new WorkflowErrorClass({
      code: 'ARTIFACT_NOT_FOUND',
      category: 'execution',
      severity: 'error',
      message: `Артефакт не найден: ${path}`,
      context: {
        path,
        expectedStep: this.findStepForArtifact(path, context)
      },
      recoverable: false,
      suggestions: [
        'Проверьте, что предыдущий шаг успешно создал артефакт',
        'Проверьте правильность пути к артефакту',
        'Убедитесь, что шаг завершился без ошибок'
      ]
    });
  }
  throw error;
}
```

## Testing Strategy

### Unit Tests

1. **Template Engine Tests**
   - Тест разрешения простых переменных
   - Тест разрешения вложенных переменных
   - Тест загрузки артефактов по прямому пути
   - Тест загрузки артефактов по переменной
   - Тест обрамления в теги
   - Тест кэширования артефактов
   - Тест обработки ошибок

2. **Step Executor Tests**
   - Тест создания outputs с двойной передачей
   - Тест добавления переменных в контекст
   - Тест сохранения артефактов

3. **Integration Tests**
   - Тест полного workflow с передачей контекста
   - Тест параллельных шагов с общим контекстом
   - Тест условных шагов с контекстом

### Property-Based Tests

1. **Property Test: Вложенные переменные**
   - Генерируем случайные шаблоны с вложенными переменными
   - Проверяем, что все переменные разрешаются корректно

2. **Property Test: Кэширование**
   - Генерируем случайные последовательности загрузок
   - Проверяем, что кэш работает корректно

3. **Property Test: Обратная совместимость**
   - Генерируем случайные шаблоны со старым синтаксисом
   - Проверяем, что они работают без изменений

### Performance Tests

1. **Тест производительности кэширования**
   - Измеряем время загрузки с кэшем и без
   - Цель: Кэш должен ускорять загрузку в 10+ раз

2. **Тест производительности вложенных переменных**
   - Измеряем время рендеринга с разной глубиной вложенности
   - Цель: До 10 уровней вложенности за < 100мс

## Migration Guide

### Для существующих workflow

**Хорошая новость:** Никаких изменений не требуется! Все существующие workflow продолжат работать.

### Рекомендации по оптимизации

1. **Используйте прямое содержимое вместо путей:**

   ```yaml
   # Было (медленнее)
   prompt_template: |
     ${artifact:${copilot_questions_file}}
   
   # Стало (быстрее)
   prompt_template: |
     ${copilot_questions}
   ```

2. **Добавляйте теги для больших вложенных данных:**

   ```yaml
   prompt_template: |
     Проанализируйте следующие вопросы:
     
     ${artifact:${copilot_questions_file}:questions}
     
     И предоставьте рекомендации.
   ```

3. **Используйте явную загрузку только когда нужно:**
   - Файл может быть обновлен внешним процессом
   - Нужна гарантия актуальности данных
   - Содержимое слишком большое для хранения в памяти

## Performance Considerations

### Оптимизации

1. **Кэширование артефактов**: Снижает количество операций I/O
2. **Прямая передача содержимого**: Избегает чтения файлов
3. **Ленивая загрузка**: Файлы загружаются только при необходимости

### Метрики

- Время рендеринга шаблона: < 50мс для типичных промптов
- Время загрузки артефакта: < 10мс (с кэшем), < 50мс (без кэша)
- Использование памяти: +10-20% для хранения содержимого в контексте

### Рекомендации

- Для артефактов < 100KB: Используйте прямое содержимое
- Для артефактов > 100KB: Используйте загрузку из файла
- Для часто используемых артефактов: Полагайтесь на кэш
