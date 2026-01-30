# Руководство по установке и настройке

## Системные требования

- **Node.js**: версия 18.x или выше
- **npm**: версия 9.x или выше
- **Операционная система**: Windows, macOS, Linux

## Установка

> **Примечание:** Пакет пока не опубликован на npm. Используйте установку из исходников.

### Вариант 1: Установка из исходников (рекомендуется)

#### 1. Клонирование репозитория

```bash
git clone https://github.com/Nikolay-Shirokov/workflow-orchestrator.git
cd workflow-orchestrator
```

#### 2. Установка зависимостей

```bash
npm install
```

#### 3. Сборка проекта

```bash
npm run build
```

#### 4. Глобальная установка

```bash
npm link
```

После этого команда `workflow-orchestrator` будет доступна глобально.

### Вариант 2: Запуск без глобальной установки

Если не хотите делать `npm link`, можно запускать напрямую:

```bash
node dist/cli/cli.js run config.yaml
```

### Вариант 3: Установка из npm (после публикации)

> Этот вариант будет доступен после публикации пакета на npm.

```bash
npm install -g workflow-orchestrator
workflow-orchestrator run config.yaml
```

## Настройка CLI-адаптеров

### Claude CLI (Anthropic)

1. **Установка claude-cli**:

```bash
npm install -g @anthropic-ai/claude-cli
```

2. **Авторизация**:

Claude CLI использует собственную систему авторизации:

```bash
claude auth login
```

Следуйте инструкциям в терминале для входа в ваш аккаунт Anthropic.

3. **Проверка установки**:

```bash
claude --version
claude auth status  # Проверка статуса авторизации
```

### OpenAI (через openai-compatible адаптер)

> **Примечание:** Для OpenAI рекомендуется использовать встроенный `openai-compatible` адаптер вместо CLI-утилит.

**Настройка через конфигурацию workflow**:

```yaml
adapters:
  - name: "openai"
    type: "openai-compatible"
    baseUrl: "https://api.openai.com/v1"
    apiKey: "${OPENAI_API_KEY}"

roles:
  assistant:
    adapter: "openai"
    model: "gpt-4"
```

**Установка API ключа**:

```bash
export OPENAI_API_KEY="your-api-key-here"
```

Или добавьте в `.env` файл:
```bash
OPENAI_API_KEY=your-api-key-here
```

### Google Gemini CLI

1. **Установка gemini-cli**:

```bash
npm install -g @google/generative-ai-cli
```

2. **Авторизация**:

Gemini CLI может использовать несколько методов авторизации:

**Вариант 1: Google Cloud SDK (рекомендуется)**
```bash
gcloud auth application-default login
```

**Вариант 2: API ключ**
```bash
export GOOGLE_API_KEY="your-api-key-here"
```

3. **Проверка установки**:

```bash
gemini --version
```

### Ollama (локальные модели)

1. **Установка Ollama**:

Следуйте инструкциям на [ollama.ai](https://ollama.ai):

```bash
# macOS/Linux
curl -fsSL https://ollama.ai/install.sh | sh

# Windows
# Скачайте установщик с ollama.ai
```

2. **Загрузка моделей**:

```bash
ollama pull llama2
ollama pull mistral
ollama pull codellama
```

3. **Проверка установки**:

```bash
ollama list
```

### Azure OpenAI

1. **Установка Azure CLI**:

Следуйте инструкциям на [docs.microsoft.com](https://docs.microsoft.com/cli/azure/install-azure-cli)

2. **Аутентификация**:

```bash
az login
```

3. **Настройка переменных окружения**:

```bash
export AZURE_OPENAI_KEY="your-key"
export AZURE_OPENAI_ENDPOINT="https://your-resource.openai.azure.com/"
```

## Настройка MCP-инструментов

### Веб-поиск

1. **Установка mcp-web-search**:

```bash
npm install -g @mcp/web-search
```

2. **Настройка API ключей** (если требуется):

```bash
export SEARCH_API_KEY="your-search-api-key"
```

### Доступ к файлам

1. **Установка mcp-file-access**:

```bash
npm install -g @mcp/file-access
```

2. **Настройка разрешений**:

Создайте файл конфигурации `~/.mcp/file-access.json`:

```json
{
  "allowedPaths": [
    "/path/to/your/project",
    "/path/to/documents"
  ],
  "deniedPaths": [
    "/path/to/sensitive/data"
  ]
}
```

## Проверка установки

### Проверка Workflow Orchestrator

```bash
# Если делали npm link
workflow-orchestrator --version
workflow-orchestrator --help

# Или без npm link
node dist/cli/cli.js --version
node dist/cli/cli.js --help
```

### Проверка адаптеров

Создайте тестовый файл `test-config.yaml`:

```yaml
workflow:
  name: "test"
  version: "1.0"
  
  settings:
    artifacts_dir: "test-artifacts"
  
  roles:
    tester:
      adapter: "claude-cli"
      model: "claude-sonnet-3.5"
  
  steps:
    - id: "test"
      name: "Тест"
      type: "model"
      role: "tester"
      prompt_template: "Скажите 'Hello, World!'"
      outputs:
        result: "${artifacts_dir}/result.txt"
```

Запустите dry-run:

```bash
# С npm link
workflow-orchestrator dry-run test-config.yaml

# Или без npm link
node dist/cli/cli.js dry-run test-config.yaml
```

Если все настроено правильно, вы увидите:

```
✓ Конфигурация валидна
✓ Все адаптеры доступны
✓ Все зависимости разрешены
✓ Готово к выполнению
```

## Настройка переменных окружения

### Важно: CLI-утилиты vs API ключи

**CLI-утилиты** (claude-cli, gemini-cli) используют собственную авторизацию и **НЕ требуют** переменных окружения с API ключами.

**API ключи нужны только** для:
- OpenAI-compatible адаптеров (прямое HTTP подключение)
- Azure OpenAI
- MCP инструментов (если требуется)

### Создание файла .env

Создайте файл `.env` в корне проекта **только если** используете прямое API подключение:

```bash
# API ключи (только для openai-compatible адаптеров)
OPENAI_API_KEY=your-openai-key           # Для OpenAI API
GOOGLE_API_KEY=your-google-key           # Для Gemini API (если не через gcloud)

# Azure OpenAI (если используется)
AZURE_OPENAI_KEY=your-azure-key
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/

# MCP инструменты (если требуется)
SEARCH_API_KEY=your-search-key

# Настройки оркестратора
WORKFLOW_ARTIFACTS_DIR=./artifacts
WORKFLOW_LOG_LEVEL=info
WORKFLOW_DEFAULT_ADAPTER=claude-cli
```

### Загрузка переменных

Установите `dotenv`:

```bash
npm install dotenv
```

Добавьте в начало вашего скрипта:

```javascript
require('dotenv').config();
```

## Настройка логирования

### Уровни логирования

Установите уровень логирования через переменную окружения:

```bash
export WORKFLOW_LOG_LEVEL=debug  # debug, info, warning, error
```

Или в конфигурации процесса:

```yaml
settings:
  log_level: "debug"
```

### Логирование в файл

```bash
# С npm link
workflow-orchestrator run config.yaml 2>&1 | tee workflow.log

# Или без npm link
node dist/cli/cli.js run config.yaml 2>&1 | tee workflow.log
```

## Настройка директорий

### Структура директорий по умолчанию

```
project/
├── workflows/          # Конфигурации процессов
├── prompts/           # Шаблоны промптов
├── artifacts/         # Результаты выполнения
│   └── session_*/     # Директории сессий
├── exports/           # Экспортированные конфигурации
└── .env              # Переменные окружения
```

### Настройка путей

В конфигурации процесса:

```yaml
settings:
  artifacts_dir: "artifacts/session_${timestamp}"
  prompts_dir: "prompts"
  exports_dir: "exports"
```

## Обновление

### Обновление Workflow Orchestrator

```bash
git pull origin main
npm install
npm run build
```

### Обновление CLI-адаптеров

```bash
# Claude CLI
npm update -g @anthropic-ai/claude-cli

# OpenAI CLI
pip install --upgrade openai-cli

# Gemini CLI
npm update -g @google/generative-ai-cli

# Ollama
ollama update
```

## Устранение проблем

### Проблема: "Command not found: workflow-orchestrator"

**Решение**:
```bash
npm link
# или
export PATH="$PATH:$(pwd)/dist"
```

### Проблема: "API key not found" или "Authentication failed"

**Для CLI-утилит** (claude-cli, gemini-cli):
Проверьте авторизацию CLI:
```bash
# Claude CLI
claude auth status
claude auth login  # Если не авторизованы

# Gemini CLI (через gcloud)
gcloud auth application-default login
```

**Для OpenAI-compatible адаптеров**:
Убедитесь, что переменная окружения установлена:
```bash
echo $OPENAI_API_KEY
```

Если пусто, установите:
```bash
export OPENAI_API_KEY="your-key"
```

### Проблема: "Adapter not available"

**Решение**:
Проверьте установку CLI-утилиты:
```bash
which claude
which openai
which gemini
```

Если не найдено, переустановите адаптер.

### Проблема: "Permission denied"

**Решение**:
Проверьте права доступа:
```bash
chmod +x dist/cli/cli.js
```

### Проблема: "Module not found"

**Решение**:
Переустановите зависимости:
```bash
rm -rf node_modules package-lock.json
npm install
npm run build
```

## Настройка для разработки

### Режим разработки

```bash
npm run dev
```

### Запуск тестов

```bash
# Все тесты
npm test

# Тесты с покрытием
npm run test:coverage

# Тесты в режиме наблюдения
npm run test:watch

# Конкретный тест
npm test -- workflow-engine.test.ts
```

### Линтинг

```bash
npm run lint
npm run lint:fix
```

### Форматирование

```bash
npm run format
```

## Настройка для продакшена

### Оптимизация сборки

```bash
npm run build:prod
```

### Настройка systemd (Linux)

Создайте файл `/etc/systemd/system/workflow-orchestrator.service`:

```ini
[Unit]
Description=Workflow Orchestrator
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/workflow-orchestrator
ExecStart=/usr/bin/node /path/to/workflow-orchestrator/dist/index.js
Restart=on-failure
# API ключи только для openai-compatible адаптеров
Environment="OPENAI_API_KEY=your-key"
# CLI-утилиты используют собственную авторизацию (~/.config/claude, gcloud auth)

[Install]
WantedBy=multi-user.target
```

Активируйте сервис:

```bash
sudo systemctl enable workflow-orchestrator
sudo systemctl start workflow-orchestrator
sudo systemctl status workflow-orchestrator
```

### Docker (опционально)

Создайте `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
```

Сборка и запуск:

```bash
docker build -t workflow-orchestrator .

# Для OpenAI-compatible адаптеров
docker run -e OPENAI_API_KEY=your-key workflow-orchestrator

# Для CLI-утилит - монтируйте директории с конфигурацией
docker run -v ~/.config/claude:/root/.config/claude workflow-orchestrator
```

## Дополнительные ресурсы

- [Документация по DSL](DSL_SYNTAX.md)
- [Примеры конфигураций](../examples/)
- [API документация](API.md)
- [Руководство по разработке](CONTRIBUTING.md)

## Поддержка

При возникновении проблем:

1. Проверьте [раздел устранения проблем](#устранение-проблем)
2. Изучите [примеры](../examples/)
3. Создайте [issue на GitHub](https://github.com/Nikolay-Shirokov/workflow-orchestrator/issues)
4. Посмотрите [существующие issues](https://github.com/Nikolay-Shirokov/workflow-orchestrator/issues?q=is%3Aissue)

## Следующие шаги

После установки:

1. Изучите [примеры процессов](../examples/)
2. Создайте свой первый процесс
3. Настройте роли и адаптеры
4. Экспериментируйте с DSL
5. Интегрируйте в свой workflow
