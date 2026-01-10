# Технический дизайн: Исправление UTF-8 кодировки

## Обзор решения

Проблема заключалась в неправильном использовании Node.js File System API. При передаче кодировки как строки вместо объекта опций, Node.js игнорировал параметр кодировки на Windows.

## Архитектурные решения

### 1. Унификация API вызовов

**Проблема:** Смешанное использование форматов передачи параметров  
**Решение:** Стандартизация на объектный формат `{ encoding: 'utf-8' }`

```typescript
// До исправления
await fs.writeFile(path, content, 'utf-8');  // ❌ Не работает на Windows
await fs.readFile(path, 'utf-8');            // ❌ Не работает на Windows

// После исправления
await fs.writeFile(path, content, { encoding: 'utf-8' });  // ✅ Работает везде
await fs.readFile(path, { encoding: 'utf-8' });            // ✅ Работает везде
```

### 2. Потоковая передача

**Проблема:** Необходимо сохранить UTF-8 при работе со streams  
**Решение:** Явное указание кодировки в createWriteStream

```typescript
// Создание writable stream с UTF-8
const writable = createWriteStream(artifactPath, { encoding: 'utf-8' });

// Readable stream автоматически использует UTF-8 при чтении
const readable = createReadStream(artifactPath, { encoding: 'utf-8' });
```

### 3. Метаданные

**Проблема:** Метаданные (JSON) также должны сохраняться в UTF-8  
**Решение:** Применить те же исправления к сохранению метаданных

```typescript
await fs.writeFile(metadataPath, content, { encoding: 'utf-8' });
await fs.readFile(metadataPath, { encoding: 'utf-8' });
```

## Детали реализации

### Затронутые методы в ArtifactManager

#### 1. save() - основное сохранение
```typescript
// Строка 67: обычное сохранение
await fs.writeFile(artifactPath, content, { encoding: 'utf-8' });
```

#### 2. saveWithStreaming() - потоковое сохранение
```typescript
// Строка 95: создание writable stream
const writable = createWriteStream(artifactPath, { encoding: 'utf-8' });
```

#### 3. load() - основная загрузка
```typescript
// Строка 125: обычная загрузка
const content = await fs.readFile(artifactPath, { encoding: 'utf-8' });
```

#### 4. loadWithStreaming() - потоковая загрузка
```typescript
// Строка 141: создание readable stream
const readable = createReadStream(artifactPath, { encoding: 'utf-8' });

// Строка 147-148: преобразование chunks в строку
const result = chunks.map(chunk => 
  typeof chunk === 'string' ? chunk : chunk.toString('utf-8')
).join('');
```

#### 5. saveMetadata() - сохранение метаданных
```typescript
// Строка 318: сохранение JSON метаданных
await fs.writeFile(metadataPath, content, { encoding: 'utf-8' });
```

#### 6. loadMetadata() - загрузка метаданных
```typescript
// Строка 332: загрузка JSON метаданных
const content = await fs.readFile(metadataPath, { encoding: 'utf-8' });
```

## Стратегия тестирования

### Уровни тестирования

#### 1. Unit-тесты (Jest)
Файл: `tests/core/artifact-manager-utf8.test.ts`

**Покрытие:**
- Русский текст (кириллица)
- Многоязычный контент (китайский, японский, арабский, иврит)
- Эмодзи
- Специальные символы (математические, валюты)
- Проверка отсутствия BOM
- Большие файлы (потоковая передача)
- Переносы строк и пустые строки

#### 2. Интеграционные тесты
Файлы: `test-utf8-encoding.js`, `test-russian-workflow.js`

**Покрытие:**
- Полный цикл сохранения/загрузки
- Реальные сценарии использования
- Проверка на файловой системе

#### 3. Ручное тестирование
- Проверка файлов в различных редакторах
- Проверка в Git
- Проверка на разных платформах

### Тестовые данные

```typescript
// Русский текст
const russianText = `# Заголовок на русском
Кириллица: АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ`;

// Многоязычный
const multilingualText = `
- English: Hello World!
- Русский: Привет Мир!
- 中文: 你好世界!
- 日本語: こんにちは世界!`;

// Эмодзи
const emojiText = `🎉 🚀 💻 📝 ✅ ❌`;

// Специальные символы
const specialChars = `∑ ∏ ∫ √ ∞ € £ ¥ ₽`;
```

## Обратная совместимость

### Изменения в API
**Нет изменений** - публичный API остался прежним:
```typescript
interface ArtifactManager {
  save(sessionId: string, stepId: string, name: string, content: string): Promise<string>;
  load(path: string): Promise<string>;
  exists(path: string): Promise<boolean>;
  list(sessionId: string): Promise<ArtifactInfo[]>;
}
```

### Изменения в поведении
**Улучшение** - файлы теперь корректно сохраняются в UTF-8 на всех платформах

### Миграция существующих файлов
**Не требуется** - старые файлы остаются читаемыми, новые сохраняются корректно

## Производительность

### Влияние на производительность
**Минимальное** - изменение формата параметра не влияет на производительность

### Бенчмарки
- Небольшие файлы (<1MB): без изменений
- Большие файлы (>1MB): без изменений (используется streaming)

## Безопасность

### Уязвимости
**Нет новых уязвимостей** - изменения касаются только формата параметров

### Валидация
Существующая валидация путей и имен файлов остается без изменений

## Кросс-платформенность

### Windows
✅ **Основная цель исправления** - теперь работает корректно

### macOS
✅ **Без изменений** - продолжает работать корректно

### Linux
✅ **Без изменений** - продолжает работать корректно

## Документация

### Пользовательская документация
Файл: `docs/UTF8_ENCODING.md`

**Содержание:**
- Обзор поддержки UTF-8
- Технические детали
- Примеры использования
- Решение проблем
- Особенности Windows

### Комментарии в коде
Добавлены комментарии в критических местах:
```typescript
// Явно указываем UTF-8 для корректной работы на Windows
await fs.writeFile(artifactPath, content, { encoding: 'utf-8' });
```

### CHANGELOG
Добавлена запись в раздел `[Unreleased]`:
- Fixed: Исправлена проблема с кодировкой UTF-8
- Added: Документация и тесты

## Альтернативные решения

### Альтернатива 1: Использование Buffer
```typescript
// Явное создание Buffer с UTF-8
const buffer = Buffer.from(content, 'utf-8');
await fs.writeFile(path, buffer);
```
**Отклонено:** Более сложно, менее читаемо, нет преимуществ

### Альтернатива 2: Использование сторонних библиотек
```typescript
// Например, fs-extra
import * as fse from 'fs-extra';
await fse.writeFile(path, content, 'utf-8');
```
**Отклонено:** Добавляет зависимость, нет необходимости

### Альтернатива 3: Изменение системной кодировки
```typescript
// Установка кодировки через переменные окружения
process.env.NODE_OPTIONS = '--encoding=utf-8';
```
**Отклонено:** Не работает, влияет на весь процесс

## Выводы

Выбранное решение:
- ✅ Минимально инвазивное
- ✅ Использует стандартный API
- ✅ Не добавляет зависимостей
- ✅ Обратно совместимое
- ✅ Хорошо документированное
- ✅ Полностью протестированное

## Ссылки на код

- `src/core/artifact-manager.ts` - основная реализация
- `tests/core/artifact-manager-utf8.test.ts` - тесты
- `docs/UTF8_ENCODING.md` - документация
