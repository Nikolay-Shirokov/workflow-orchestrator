# Руководство по публикации в npm

Это руководство для мейнтейнеров проекта по публикации новых версий в npm.

## Предварительные требования

1. Аккаунт на [npmjs.com](https://www.npmjs.com/)
2. Права на публикацию пакета `workflow-orchestrator`
3. Настроенная аутентификация npm:
   ```bash
   npm login
   ```

## Процесс публикации

### 1. Подготовка к релизу

#### Проверка тестов

Убедитесь, что все тесты проходят:

```bash
npm test
npm run test:coverage
```

Результат должен быть:
- ✅ Все unit тесты проходят
- ✅ Все интеграционные тесты проходят
- ✅ Покрытие >= 98%

#### Проверка линтера

```bash
npm run lint
```

Не должно быть ошибок или предупреждений.

#### Проверка сборки

```bash
npm run build
```

Убедитесь, что сборка проходит без ошибок.

### 2. Обновление версии

Используйте семантическое версионирование (semver):

- **Patch** (1.0.0 → 1.0.1) - исправления ошибок:
  ```bash
  npm version patch
  ```

- **Minor** (1.0.0 → 1.1.0) - новые функции (обратно совместимые):
  ```bash
  npm version minor
  ```

- **Major** (1.0.0 → 2.0.0) - breaking changes:
  ```bash
  npm version major
  ```

Эта команда:
- Обновит версию в `package.json`
- Создаст git commit
- Создаст git tag

### 3. Обновление CHANGELOG

Создайте или обновите `CHANGELOG.md`:

```markdown
# Changelog

## [1.1.0] - 2026-01-10

### Added
- Новая функция X
- Поддержка Y

### Changed
- Улучшена производительность Z

### Fixed
- Исправлена ошибка в модуле A
- Исправлена проблема с B

### Deprecated
- Функция C будет удалена в версии 2.0.0

## [1.0.0] - 2026-01-01

### Added
- Первый релиз
- Базовая функциональность
```

Зафиксируйте изменения:

```bash
git add CHANGELOG.md
git commit -m "docs: обновлен CHANGELOG для версии 1.1.0"
```

### 4. Проверка содержимого пакета

Проверьте, что будет опубликовано:

```bash
npm pack --dry-run
```

Убедитесь, что:
- ✅ Включена директория `dist/`
- ✅ Включены файлы документации (`README.md`, `LICENSE`, `docs/`)
- ✅ Включены примеры (`examples/`)
- ❌ НЕ включены исходники (`src/`, `tests/`)
- ❌ НЕ включены конфигурационные файлы разработки

### 5. Тестовая публикация

Создайте тестовый пакет:

```bash
npm pack
```

Это создаст файл `workflow-orchestrator-1.1.0.tgz`.

Протестируйте установку в другой директории:

```bash
cd /tmp
mkdir test-install
cd test-install
npm install /path/to/workflow-orchestrator-1.1.0.tgz
npx workflow-orchestrator --version
npx workflow-orchestrator --help
```

### 6. Публикация в npm

#### Публикация в public registry

```bash
npm publish --access public
```

#### Проверка публикации

Проверьте на npmjs.com:
```
https://www.npmjs.com/package/workflow-orchestrator
```

Проверьте установку:
```bash
npm install -g workflow-orchestrator
workflow-orchestrator --version
```

### 7. Отправка в GitHub

Отправьте коммиты и теги:

```bash
git push origin main
git push origin --tags
```

### 8. Создание GitHub Release

1. Перейдите на https://github.com/Nikolay-Shirokov/workflow-orchestrator/releases
2. Нажмите "Draft a new release"
3. Выберите созданный тег (например, `v1.1.0`)
4. Заполните:
   - **Release title**: `v1.1.0 - Название релиза`
   - **Description**: Скопируйте из CHANGELOG.md
5. Прикрепите файл `.tgz` (опционально)
6. Нажмите "Publish release"

## Публикация beta-версий

Для тестирования перед основным релизом:

### 1. Создание beta-версии

```bash
npm version prerelease --preid=beta
# Результат: 1.1.0-beta.0
```

### 2. Публикация с тегом beta

```bash
npm publish --tag beta
```

### 3. Установка beta-версии

Пользователи могут установить:

```bash
npm install -g workflow-orchestrator@beta
```

### 4. Продвижение beta в latest

После тестирования:

```bash
npm dist-tag add workflow-orchestrator@1.1.0 latest
```

## Откат публикации

Если нужно откатить версию (в течение 72 часов):

```bash
npm unpublish workflow-orchestrator@1.1.0
```

⚠️ **Внимание**: Используйте только в крайних случаях!

Лучше опубликовать исправленную версию:

```bash
npm version patch
npm publish
```

## Автоматизация через GitHub Actions

Можно настроить автоматическую публикацию при создании тега:

```yaml
# .github/workflows/publish.yml
name: Publish to npm

on:
  push:
    tags:
      - 'v*'

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20.x'
          registry-url: 'https://registry.npmjs.org'
      
      - run: npm ci
      - run: npm test
      - run: npm run build
      - run: npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

Настройка:
1. Создайте токен на npmjs.com (Account Settings → Access Tokens)
2. Добавьте токен в GitHub Secrets как `NPM_TOKEN`

## Чеклист перед публикацией

- [ ] Все тесты проходят
- [ ] Линтер не выдает ошибок
- [ ] Сборка успешна
- [ ] Версия обновлена
- [ ] CHANGELOG обновлен
- [ ] Документация актуальна
- [ ] README содержит правильную информацию
- [ ] Примеры работают
- [ ] Тестовая установка прошла успешно
- [ ] Git коммиты отправлены
- [ ] Git теги отправлены
- [ ] Пакет опубликован в npm
- [ ] GitHub Release создан

## Поддержка старых версий

### Исправления для старых версий

Если нужно исправить ошибку в старой версии:

1. Создайте ветку от тега:
   ```bash
   git checkout -b hotfix/1.0.x v1.0.5
   ```

2. Внесите исправления и протестируйте

3. Обновите версию:
   ```bash
   npm version patch
   ```

4. Опубликуйте:
   ```bash
   npm publish
   ```

5. Смержите в main (если нужно):
   ```bash
   git checkout main
   git merge hotfix/1.0.x
   ```

## Мониторинг после публикации

После публикации следите за:

- Статистикой загрузок на npmjs.com
- Issues на GitHub
- Отзывами пользователей
- Ошибками в production

## Полезные команды

```bash
# Просмотр информации о пакете
npm view workflow-orchestrator

# Просмотр всех версий
npm view workflow-orchestrator versions

# Просмотр dist-tags
npm dist-tag ls workflow-orchestrator

# Добавление dist-tag
npm dist-tag add workflow-orchestrator@1.1.0 stable

# Удаление dist-tag
npm dist-tag rm workflow-orchestrator beta

# Просмотр зависимостей
npm ls --all

# Проверка устаревших зависимостей
npm outdated

# Обновление зависимостей
npm update
```

## Контакты

При возникновении проблем с публикацией:
- GitHub Issues: https://github.com/Nikolay-Shirokov/workflow-orchestrator/issues
- npm support: https://www.npmjs.com/support

## Ресурсы

- [npm Documentation](https://docs.npmjs.com/)
- [Semantic Versioning](https://semver.org/)
- [Keep a Changelog](https://keepachangelog.com/)
