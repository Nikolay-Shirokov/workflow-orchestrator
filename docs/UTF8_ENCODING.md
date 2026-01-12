# Поддержка UTF-8 в Workflow Orchestrator

## Обзор

Workflow Orchestrator полностью поддерживает UTF-8 кодировку для всех артефактов и файлов. Это обеспечивает корректную работу с:

- Русским языком и кириллицей
- Многоязычным контентом (китайский, японский, арабский, иврит и др.)
- Эмодзи и специальными символами
- Математическими символами и символами валют

## Технические детали

### Сохранение файлов

Все файлы артефактов сохраняются с явным указанием кодировки UTF-8:

```typescript
await fs.writeFile(artifactPath, content, { encoding: 'utf-8' });
```

### Загрузка файлов

При загрузке также используется UTF-8:

```typescript
const content = await fs.readFile(artifactPath, { encoding: 'utf-8' });
```

### Потоковая передача

Для больших файлов (>1MB) используется потоковая передача с сохранением UTF-8:

```typescript
const writable = createWriteStream(artifactPath, { encoding: 'utf-8' });
```

## UTF-8 без BOM

Файлы сохраняются в UTF-8 **без BOM** (Byte Order Mark). Это стандартная практика для:

- Совместимости с Git
- Работы с различными редакторами кода
- Кросс-платформенной совместимости

## Особенности Windows

На Windows консоль (`cmd.exe`) по умолчанию использует кодировку CP866 или Windows-1251, поэтому команда `type` может некорректно отображать UTF-8 файлы. Это **не проблема** самих файлов - они сохранены корректно.

Для просмотра UTF-8 файлов в Windows используйте:

- Visual Studio Code
- Notepad++
- PowerShell с правильной кодировкой: `Get-Content -Encoding UTF8 file.md`
- Любой современный текстовый редактор

## Тестирование

Для проверки корректности работы с UTF-8 запустите:

```bash
npm test -- artifact-manager-utf8
```

Тесты проверяют:

- ✅ Русский текст и кириллицу
- ✅ Многоязычный контент
- ✅ Эмодзи
- ✅ Специальные символы
- ✅ Отсутствие BOM
- ✅ Большие файлы (потоковая передача)
- ✅ Переносы строк и пустые строки

## Примеры использования

### Создание артефакта с русским текстом

```typescript
import { createArtifactManager } from './dist/core/artifact-manager.js';

const artifactManager = createArtifactManager({
  baseDir: './artifacts',
});

const russianContent = `# Заголовок

Это текст на русском языке.`;

const path = await artifactManager.save(
  'session-id',
  'step-id',
  'document.md',
  russianContent
);
```

### Загрузка артефакта

```typescript
const content = await artifactManager.load(path);
console.log(content); // Корректно отображает русский текст
```

## Решение проблем

### Проблема: Кракозябры в консоли Windows

**Причина**: Консоль Windows использует устаревшую кодировку.

**Решение**: Используйте современный редактор или PowerShell:

```powershell
Get-Content -Encoding UTF8 artifacts/session_xxx/file.md
```

### Проблема: Файлы не читаются в старых программах

**Причина**: Программа не поддерживает UTF-8.

**Решение**: Используйте современный редактор, поддерживающий UTF-8.

## Совместимость

- ✅ Windows 10/11
- ✅ macOS
- ✅ Linux
- ✅ Git
- ✅ Visual Studio Code
- ✅ Все современные текстовые редакторы
- ✅ Node.js 18+

## Дополнительная информация

- [UTF-8 на Wikipedia](https://ru.wikipedia.org/wiki/UTF-8)
- [Node.js Buffer Encoding](https://nodejs.org/api/buffer.html#buffers-and-character-encodings)
- [File System API](https://nodejs.org/api/fs.html)
