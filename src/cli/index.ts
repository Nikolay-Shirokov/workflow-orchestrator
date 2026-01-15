/**
 * CLI интерфейс для Workflow Orchestrator
 * 
 * Предоставляет команды для:
 * - Запуска рабочих процессов (run)
 * - Возобновления процессов (resume)
 * - Отображения статуса (status)
 * - Валидации конфигурации (dry-run)
 */

import { Command } from 'commander';
import { WorkflowOrchestrator } from './orchestrator.js';
import { ProgressDisplay } from './progress-display.js';
import { Logger, LogLevel } from '../core/logger.js';

// Экспорт компонентов Terminal Layer
export { TerminalRenderer, TerminalColor, TerminalCapabilities, TerminalSize } from './terminal-renderer.js';
export { IProgressDisplay } from './display-types.js';

/**
 * Создание простого логгера для CLI
 */
function createSimpleLogger(verbose: boolean = false): Logger {
  return new Logger({
    level: verbose ? LogLevel.DEBUG : LogLevel.INFO,
    enableConsole: true,
    enableFile: false
  });
}

/**
 * Создание индикатора прогресса на основе режима
 * Property 1: Выбор режима на основе флага
 * 
 * @param logMode - Флаг логового режима
 * @param logger - Логгер
 * @returns ProgressDisplay или InteractiveDisplay
 */
function createProgressDisplay(logMode: boolean, logger: Logger): ProgressDisplay | any {
  if (logMode) {
    // Логовый режим - используем ProgressDisplay
    return new ProgressDisplay(logger);
  } else {
    // Интерактивный режим - используем InteractiveDisplay
    try {
      // Динамический импорт InteractiveDisplay
      const { InteractiveDisplay } = require('./interactive-display.js');
      return new InteractiveDisplay();
    } catch (error) {
      // Fallback на логовый режим при ошибке
      logger.warn('Не удалось инициализировать интерактивный режим, используется логовый режим');
      return new ProgressDisplay(logger);
    }
  }
}

/**
 * Создание и настройка CLI программы
 */
export function createCLI(): Command {
  const program = new Command();

  program
    .name('workflow-orchestrator')
    .description('Настраиваемая система оркестрации многошаговых рабочих процессов с использованием AI-моделей')
    .version('1.0.0');

  // Команда: run - запуск нового процесса
  program
    .command('run')
    .description('Запустить новый рабочий процесс')
    .argument('<config>', 'Путь к файлу конфигурации процесса (YAML/JSON)')
    .option('-c, --context <json>', 'Начальный контекст в формате JSON')
    .option('-f, --context-file <file>', 'Путь к файлу с начальным контекстом (JSON)')
    .option('-v, --verbose', 'Подробный вывод логов')
    .option('--log-level <level>', 'Уровень логирования (debug, info, warning, error)', 'info')
    .option('--log-mode', 'Использовать логовый режим вместо интерактивного')
    .option('--state-dir <dir>', 'Директория для файлов состояния', './state')
    .option('--artifacts-dir <dir>', 'Директория для артефактов')
    .action(async (configPath: string, options) => {
      const logger = createSimpleLogger(options.verbose);

      try {
        logger.info(`Запуск процесса из конфигурации: ${configPath}`);

        // Парсинг начального контекста
        let initialContext: Record<string, unknown> = {};
        
        // Приоритет: файл контекста > JSON строка
        if (options.contextFile) {
          try {
            const { readFile } = await import('fs/promises');
            const contextContent = await readFile(options.contextFile, 'utf-8');
            initialContext = JSON.parse(contextContent);
            logger.info(`Контекст загружен из файла: ${options.contextFile}`);
          } catch (error) {
            logger.error('Ошибка чтения файла контекста:', error as Error);
            process.exit(1);
          }
        } else if (options.context) {
          try {
            initialContext = JSON.parse(options.context);
          } catch (error) {
            logger.error('Ошибка парсинга контекста:', error as Error);
            process.exit(1);
          }
        }

        // Создание оркестратора
        const orchestrator = new WorkflowOrchestrator({
          stateDir: options.stateDir,
          artifactsDir: options.artifactsDir,
          logger
        });

        // Создание индикатора прогресса на основе режима
        // Property 1: Выбор режима на основе флага (Requirements 1.2, 1.3)
        const progress = createProgressDisplay(options.logMode || false, logger);

        // Запуск процесса
        const state = await orchestrator.run(configPath, initialContext, progress);

        // Вывод результата
        if (state.status === 'completed') {
          logger.info(`✓ Процесс завершен успешно (сессия: ${state.sessionId})`);
          logger.info(`  Выполнено шагов: ${state.completedSteps.length}`);
          logger.info(`  Создано артефактов: ${Object.keys(state.artifacts).length}`);
          process.exit(0);
        } else if (state.status === 'paused') {
          logger.info(`○ Процесс приостановлен (сессия: ${state.sessionId})`);
          logger.info(`  Выполнено шагов: ${state.completedSteps.length}`);
          logger.info(`  Текущий шаг: ${state.currentStep}`);
          logger.info(`  Для продолжения используйте: resume ${state.sessionId}`);
          process.exit(0);
        } else {
          logger.error(`✗ Процесс завершился с ошибкой (статус: ${state.status})`);
          if (state.errors.length > 0) {
            logger.error(`  Последняя ошибка: ${state.errors[state.errors.length - 1].error}`);
          }
          process.exit(1);
        }

      } catch (error) {
        logger.error('Критическая ошибка:', error as Error);
        process.exit(1);
      }
    });

  // Команда: resume - возобновление процесса
  program
    .command('resume')
    .description('Возобновить выполнение процесса с сохраненного состояния')
    .argument('<session-id>', 'ID сессии для возобновления')
    .argument('<config>', 'Путь к файлу конфигурации процесса')
    .option('-v, --verbose', 'Подробный вывод логов')
    .option('--log-level <level>', 'Уровень логирования (debug, info, warning, error)', 'info')
    .option('--log-mode', 'Использовать логовый режим вместо интерактивного')
    .option('--state-dir <dir>', 'Директория для файлов состояния', './state')
    .option('--skip-validation', 'Пропустить валидацию артефактов')
    .action(async (sessionId: string, configPath: string, options) => {
      const logger = createSimpleLogger(options.verbose);

      try {
        logger.info(`Возобновление процесса (сессия: ${sessionId})`);

        // Создание оркестратора
        const orchestrator = new WorkflowOrchestrator({
          stateDir: options.stateDir,
          logger
        });

        // Создание индикатора прогресса на основе режима
        // Property 1: Выбор режима на основе флага (Requirements 1.2, 1.3)
        const progress = createProgressDisplay(options.logMode || false, logger);

        // Возобновление процесса
        const state = await orchestrator.resume(
          sessionId,
          configPath,
          progress,
          { skipValidation: options.skipValidation }
        );

        // Вывод результата
        if (state.status === 'completed') {
          logger.info(`✓ Процесс завершен успешно`);
          logger.info(`  Выполнено шагов: ${state.completedSteps.length}`);
          process.exit(0);
        } else if (state.status === 'paused') {
          logger.info(`○ Процесс снова приостановлен (сессия: ${state.sessionId})`);
          logger.info(`  Выполнено шагов: ${state.completedSteps.length}`);
          logger.info(`  Текущий шаг: ${state.currentStep}`);
          process.exit(0);
        } else {
          logger.error(`✗ Процесс завершился с ошибкой (статус: ${state.status})`);
          process.exit(1);
        }

      } catch (error) {
        logger.error('Критическая ошибка:', error as Error);
        process.exit(1);
      }
    });

  // Команда: status - отображение статуса
  program
    .command('status')
    .description('Отобразить статус выполнения процесса')
    .argument('<session-id>', 'ID сессии')
    .option('--state-dir <dir>', 'Директория для файлов состояния', './state')
    .option('--detailed', 'Подробная информация о каждом шаге')
    .option('--json', 'Вывод в формате JSON')
    .action(async (sessionId: string, options) => {
      const logger = createSimpleLogger(false);

      try {
        // Создание оркестратора
        const orchestrator = new WorkflowOrchestrator({
          stateDir: options.stateDir,
          logger
        });

        // Получение статуса
        const status = await orchestrator.getStatus(sessionId);

        // Вывод статуса
        if (options.json) {
          console.log(JSON.stringify(status, null, 2));
        } else {
          displayStatus(status, options.detailed, logger);
        }

        process.exit(0);

      } catch (error) {
        logger.error('Ошибка получения статуса:', error as Error);
        process.exit(1);
      }
    });

  // Команда: dry-run - валидация без выполнения
  program
    .command('dry-run')
    .description('Валидировать конфигурацию процесса без выполнения')
    .argument('<config>', 'Путь к файлу конфигурации процесса')
    .option('-c, --context <json>', 'Начальный контекст в формате JSON')
    .option('--show-steps', 'Отобразить все шаги с подставленными параметрами')
    .option('--check-resources', 'Проверить доступность всех ресурсов')
    .option('--json', 'Вывод в формате JSON')
    .action(async (configPath: string, options) => {
      const logger = createSimpleLogger(false);

      try {
        logger.info(`Валидация конфигурации: ${configPath}`);

        // Парсинг начального контекста
        let initialContext: Record<string, unknown> = {};
        if (options.context) {
          try {
            initialContext = JSON.parse(options.context);
          } catch (error) {
            logger.error('Ошибка парсинга контекста:', error as Error);
            process.exit(1);
          }
        }

        // Создание оркестратора
        const orchestrator = new WorkflowOrchestrator({ logger });

        // Выполнение dry-run
        const result = await orchestrator.dryRun(configPath, {
          context: initialContext,
          showSteps: options.showSteps,
          checkResources: options.checkResources
        });

        // Вывод результата
        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          displayDryRunResult(result, logger);
        }

        // Код выхода зависит от результата валидации
        process.exit(result.valid ? 0 : 1);

      } catch (error) {
        logger.error('Ошибка валидации:', error as Error);
        process.exit(1);
      }
    });

  // Команда: export - экспорт конфигурации процесса
  program
    .command('export')
    .description('Экспортировать конфигурацию процесса с метаданными')
    .argument('<config>', 'Путь к файлу конфигурации процесса')
    .argument('<output>', 'Путь к файлу экспорта')
    .option('--include-files', 'Включить содержимое внешних файлов (шаблоны промптов)')
    .option('--base-dir <dir>', 'Базовая директория для разрешения путей', process.cwd())
    .option('--format <format>', 'Формат экспорта (yaml, json)', 'yaml')
    .option('--author <name>', 'Автор экспорта')
    .option('--description <text>', 'Описание экспорта')
    .option('--tags <tags>', 'Теги через запятую')
    .option('--min-version <version>', 'Минимальная совместимая версия оркестратора')
    .action(async (configPath: string, outputPath: string, options) => {
      const logger = createSimpleLogger(false);

      try {
        logger.info(`Экспорт конфигурации: ${configPath} -> ${outputPath}`);

        // Импортируем необходимые модули
        const { WorkflowConfigParser } = await import('../core/workflow-config-parser.js');
        const { WorkflowExportImportManager } = await import('../core/workflow-export-import.js');

        // Загружаем конфигурацию
        const parser = new WorkflowConfigParser();
        const config = await parser.loadFromFile(configPath);

        // Создаем менеджер экспорта/импорта
        const manager = new WorkflowExportImportManager('1.0.0');

        // Парсим теги
        const tags = options.tags ? options.tags.split(',').map((t: string) => t.trim()) : undefined;

        // Выполняем экспорт
        const result = await manager.export(config, {
          includeExternalFiles: options.includeFiles,
          baseDir: options.baseDir,
          format: options.format,
          pretty: true,
          metadata: {
            exportedBy: options.author,
            description: options.description,
            tags,
            minOrchestratorVersion: options.minVersion
          }
        });

        // Сохраняем результат
        await manager.saveExport(result, outputPath);

        // Вывод информации
        logger.info(`✓ Экспорт завершен успешно`);
        logger.info(`  Процесс: ${config.name} v${config.version}`);
        logger.info(`  Шагов: ${config.steps.length}`);
        if (result.embeddedFiles) {
          logger.info(`  Встроено файлов: ${Object.keys(result.embeddedFiles).length}`);
        }
        logger.info(`  Формат: ${options.format}`);
        logger.info(`  Файл: ${outputPath}`);

        process.exit(0);

      } catch (error) {
        logger.error('Ошибка экспорта:', error as Error);
        process.exit(1);
      }
    });

  // Команда: import - импорт конфигурации процесса
  program
    .command('import')
    .description('Импортировать конфигурацию процесса из экспорта')
    .argument('<export-file>', 'Путь к файлу экспорта')
    .argument('<output-config>', 'Путь для сохранения импортированной конфигурации')
    .option('--base-dir <dir>', 'Базовая директория для извлечения файлов', process.cwd())
    .option('--no-validate', 'Пропустить валидацию совместимости')
    .option('--conflict <strategy>', 'Стратегия разрешения конфликтов (fail, skip, overwrite, rename)', 'fail')
    .option('--overwrite-files', 'Перезаписать существующие файлы')
    .option('--json', 'Вывод в формате JSON')
    .action(async (exportFile: string, outputConfig: string, options) => {
      const logger = createSimpleLogger(false);

      try {
        logger.info(`Импорт конфигурации: ${exportFile} -> ${outputConfig}`);

        // Импортируем необходимые модули
        const { WorkflowExportImportManager } = await import('../core/workflow-export-import.js');
        const { writeFile } = await import('fs/promises');
        const { stringify } = await import('yaml');

        // Создаем менеджер экспорта/импорта
        const manager = new WorkflowExportImportManager('1.0.0');

        // Выполняем импорт
        const result = await manager.import(exportFile, {
          baseDir: options.baseDir,
          validateCompatibility: options.validate,
          conflictResolution: options.conflict,
          overwriteFiles: options.overwriteFiles
        });

        // Сохраняем конфигурацию
        const configContent = stringify(result.config, { indent: 2 });
        await writeFile(outputConfig, configContent, 'utf-8');

        // Вывод результата
        if (options.json) {
          console.log(JSON.stringify({
            config: result.config,
            metadata: result.metadata,
            extractedFiles: result.extractedFiles,
            compatibilityWarnings: result.compatibilityWarnings,
            resolvedConflicts: result.resolvedConflicts
          }, null, 2));
        } else {
          logger.info(`✓ Импорт завершен успешно`);
          logger.info(`  Процесс: ${result.config.name} v${result.config.version}`);
          logger.info(`  Шагов: ${result.config.steps.length}`);
          logger.info(`  Экспортирован: ${new Date(result.metadata.exportedAt).toLocaleString()}`);
          
          if (result.metadata.exportedBy) {
            logger.info(`  Автор: ${result.metadata.exportedBy}`);
          }
          
          if (result.extractedFiles) {
            logger.info(`  Извлечено файлов: ${Object.keys(result.extractedFiles).length}`);
            for (const [original, extracted] of Object.entries(result.extractedFiles)) {
              logger.info(`    ${original} -> ${extracted}`);
            }
          }

          if (result.compatibilityWarnings.length > 0) {
            logger.warn(`\n⚠ Предупреждения о совместимости (${result.compatibilityWarnings.length}):`);
            for (const warning of result.compatibilityWarnings) {
              logger.warn(`  - ${warning}`);
            }
          }

          if (result.resolvedConflicts.length > 0) {
            logger.info(`\nРазрешено конфликтов: ${result.resolvedConflicts.length} (стратегия: ${options.conflict})`);
          }

          logger.info(`\nКонфигурация сохранена: ${outputConfig}`);
        }

        process.exit(0);

      } catch (error) {
        logger.error('Ошибка импорта:', error as Error);
        process.exit(1);
      }
    });

  return program;
}

/**
 * Отображение статуса процесса
 */
function displayStatus(
  status: CLIWorkflowStatus,
  detailed: boolean,
  logger: Logger
): void {
  logger.info(`\n=== Статус процесса ===`);
  logger.info(`Сессия: ${status.sessionId}`);
  logger.info(`Процесс: ${status.workflowName} v${status.workflowVersion}`);
  logger.info(`Статус: ${getStatusEmoji(status.status)} ${status.status}`);
  logger.info(`Начат: ${new Date(status.startedAt).toLocaleString()}`);
  logger.info(`Обновлен: ${new Date(status.updatedAt).toLocaleString()}`);
  
  if (status.completedAt) {
    logger.info(`Завершен: ${new Date(status.completedAt).toLocaleString()}`);
  }

  logger.info(`\n--- Прогресс ---`);
  logger.info(`Текущий шаг: ${status.currentStep}`);
  logger.info(`Завершено шагов: ${status.completedSteps.length}`);
  logger.info(`Всего шагов: ${status.totalSteps}`);
  
  // Индикатор прогресса
  const progress = (status.completedSteps.length / status.totalSteps) * 100;
  const progressBar = createProgressBar(progress, 30);
  logger.info(`Прогресс: ${progressBar} ${progress.toFixed(1)}%`);

  logger.info(`\n--- Артефакты ---`);
  logger.info(`Создано артефактов: ${Object.keys(status.artifacts).length}`);

  if (status.errors.length > 0) {
    logger.info(`\n--- Ошибки ---`);
    logger.info(`Количество ошибок: ${status.errors.length}`);
    if (!detailed) {
      const lastError = status.errors[status.errors.length - 1];
      logger.error(`Последняя ошибка (${lastError.stepId}): ${lastError.error}`);
    }
  }

  // Подробная информация
  if (detailed) {
    logger.info(`\n--- История выполнения ---`);
    for (const step of status.history) {
      const emoji = step.status === 'success' ? '✓' : step.status === 'failed' ? '✗' : '○';
      logger.info(`${emoji} ${step.stepName} (${step.stepId})`);
      logger.info(`  Статус: ${step.status}`);
      logger.info(`  Время: ${step.executionTime}ms`);
      if (step.adapter) {
        logger.info(`  Адаптер: ${step.adapter}`);
      }
      if (step.artifacts.length > 0) {
        logger.info(`  Артефакты: ${step.artifacts.length}`);
      }
      if (step.error) {
        logger.error(`  Ошибка: ${step.error}`);
      }
    }

    if (status.errors.length > 0) {
      logger.info(`\n--- Детали ошибок ---`);
      for (const error of status.errors) {
        logger.error(`Шаг ${error.stepId} (${error.timestamp}):`);
        logger.error(`  ${error.error}`);
        if (error.stackTrace) {
          logger.error(`  Stack trace:\n${error.stackTrace}`);
        }
      }
    }
  }
}

/**
 * Отображение результата dry-run
 */
function displayDryRunResult(result: DryRunResult, logger: Logger): void {
  logger.info(`\n=== Результат валидации ===`);
  
  if (result.valid) {
    logger.info(`✓ Конфигурация валидна`);
  } else {
    logger.error(`✗ Конфигурация содержит ошибки`);
  }

  logger.info(`\nПроцесс: ${result.workflowName} v${result.workflowVersion}`);
  logger.info(`Всего шагов: ${result.totalSteps}`);

  if (result.errors.length > 0) {
    logger.info(`\n--- Ошибки (${result.errors.length}) ---`);
    for (const error of result.errors) {
      logger.error(`✗ ${error.message}`);
      if (error.location) {
        logger.error(`  Местоположение: ${error.location}`);
      }
      if (error.suggestions && error.suggestions.length > 0) {
        logger.info(`  Предложения:`);
        for (const suggestion of error.suggestions) {
          logger.info(`    - ${suggestion}`);
        }
      }
    }
  }

  if (result.warnings.length > 0) {
    logger.info(`\n--- Предупреждения (${result.warnings.length}) ---`);
    for (const warning of result.warnings) {
      logger.warn(`⚠ ${warning.message}`);
      if (warning.location) {
        logger.warn(`  Местоположение: ${warning.location}`);
      }
    }
  }

  if (result.steps && result.steps.length > 0) {
    logger.info(`\n--- Шаги процесса ---`);
    for (let i = 0; i < result.steps.length; i++) {
      const step = result.steps[i];
      logger.info(`${i + 1}. ${step.name} (${step.id})`);
      logger.info(`   Тип: ${step.type}`);
      if (step.dependsOn && step.dependsOn.length > 0) {
        logger.info(`   Зависит от: ${step.dependsOn.join(', ')}`);
      }
      if (step.condition) {
        logger.info(`   Условие: ${step.condition}`);
      }
      if (step.resolvedPrompt) {
        logger.info(`   Промпт (первые 100 символов):`);
        logger.info(`   ${step.resolvedPrompt.substring(0, 100)}...`);
      }
    }
  }

  if (result.resourceCheck) {
    logger.info(`\n--- Проверка ресурсов ---`);
    
    if (result.resourceCheck.missingFiles.length > 0) {
      logger.error(`Отсутствующие файлы (${result.resourceCheck.missingFiles.length}):`);
      for (const file of result.resourceCheck.missingFiles) {
        logger.error(`  ✗ ${file}`);
      }
    }

    if (result.resourceCheck.missingVariables.length > 0) {
      logger.error(`Неопределенные переменные (${result.resourceCheck.missingVariables.length}):`);
      for (const variable of result.resourceCheck.missingVariables) {
        logger.error(`  ✗ ${variable}`);
      }
    }

    if (result.resourceCheck.unavailableAdapters.length > 0) {
      logger.error(`Недоступные адаптеры (${result.resourceCheck.unavailableAdapters.length}):`);
      for (const adapter of result.resourceCheck.unavailableAdapters) {
        logger.error(`  ✗ ${adapter}`);
      }
    }

    if (
      result.resourceCheck.missingFiles.length === 0 &&
      result.resourceCheck.missingVariables.length === 0 &&
      result.resourceCheck.unavailableAdapters.length === 0
    ) {
      logger.info(`✓ Все ресурсы доступны`);
    }
  }

  if (result.valid) {
    logger.info(`\n✓ Процесс готов к выполнению`);
  } else {
    logger.error(`\n✗ Исправьте ошибки перед запуском процесса`);
  }
}

/**
 * Получение эмодзи для статуса
 */
function getStatusEmoji(status: string): string {
  switch (status) {
    case 'running':
      return '▶';
    case 'paused':
      return '⏸';
    case 'completed':
      return '✓';
    case 'failed':
      return '✗';
    default:
      return '○';
  }
}

/**
 * Создание индикатора прогресса
 */
function createProgressBar(progress: number, width: number): string {
  const filled = Math.round((progress / 100) * width);
  const empty = width - filled;
  return '[' + '█'.repeat(filled) + '░'.repeat(empty) + ']';
}

// ============================================================================
// Типы для CLI
// ============================================================================

/**
 * Статус процесса для отображения в CLI
 */
export interface CLIWorkflowStatus {
  sessionId: string;
  workflowName: string;
  workflowVersion: string;
  status: string;
  currentStep: string;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  completedSteps: string[];
  totalSteps: number;
  artifacts: Record<string, string>;
  history: Array<{
    stepId: string;
    stepName: string;
    status: string;
    startedAt: string;
    completedAt: string;
    executionTime: number;
    adapter?: string;
    artifacts: string[];
    error?: string;
  }>;
  errors: Array<{
    stepId: string;
    timestamp: string;
    error: string;
    stackTrace?: string;
  }>;
}

/**
 * Результат dry-run
 */
export interface DryRunResult {
  valid: boolean;
  workflowName: string;
  workflowVersion: string;
  totalSteps: number;
  errors: Array<{
    message: string;
    location?: string;
    suggestions?: string[];
  }>;
  warnings: Array<{
    message: string;
    location?: string;
  }>;
  steps?: Array<{
    id: string;
    name: string;
    type: string;
    dependsOn?: string[];
    condition?: string;
    resolvedPrompt?: string;
  }>;
  resourceCheck?: {
    missingFiles: string[];
    missingVariables: string[];
    unavailableAdapters: string[];
  };
}

/**
 * Запуск CLI
 */
export async function runCLI(argv: string[]): Promise<void> {
  const program = createCLI();
  await program.parseAsync(argv);
}

// Если запущен напрямую
if (import.meta.url === `file://${process.argv[1]}`) {
  runCLI(process.argv).catch((error) => {
    console.error('Критическая ошибка:', error);
    process.exit(1);
  });
}
