/**
 * Property-based тесты для dry-run валидации
 * 
 * Проверяет свойства 45-49 из документа проектирования
 */

import * as fc from 'fast-check';
import { WorkflowOrchestrator } from '../../src/cli/orchestrator.js';
import { Logger, LogLevel } from '../../src/core/logger.js';
import * as fs from 'fs/promises';
import * as path from 'path';

// Создание тестового логгера
function createTestLogger(): Logger {
  return new Logger({
    level: LogLevel.ERROR,
    enableConsole: false,
    enableFile: false
  });
}

// Генератор валидных конфигураций рабочих процессов
const validWorkflowConfigArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 50 })
    .filter(s => s.trim().length > 0) // Исключаем строки из одних пробелов
    .map(s => s.trim()), // Убираем лишние пробелы
  version: fc.constant('1.0.0'),
  description: fc.option(fc.string({ maxLength: 200 })),
  settings: fc.record({
    artifacts_dir: fc.constant('./test-artifacts'),
    default_adapter: fc.option(fc.constantFrom('mock-cli', 'test-adapter')),
    parallel_execution: fc.boolean(),
    max_retries: fc.integer({ min: 0, max: 5 }),
    timeout: fc.integer({ min: 1000, max: 60000 })
  }),
  steps: fc.array(
    fc.record({
      id: fc.string({ minLength: 1, maxLength: 20 })
        .filter(s => s.trim().length > 0)
        .map(s => s.replace(/[^a-zA-Z0-9_]/g, '_'))
        .filter(s => s.length > 0), // Убеждаемся, что после замены остались символы
      name: fc.string({ minLength: 1, maxLength: 100 })
        .filter(s => s.trim().length > 0)
        .map(s => s.trim()),
      type: fc.constantFrom('model', 'script', 'conditional'),
      description: fc.option(fc.string({ maxLength: 200 })),
      depends_on: fc.option(fc.constant(undefined)), // Убираем зависимости для упрощения
      script: fc.option(fc.string({ maxLength: 100 })),
      outputs: fc.option(fc.dictionary(fc.string(), fc.string()))
    }),
    { minLength: 1, maxLength: 10 }
  ).map(steps => {
    // Делаем ID уникальными, добавляя индекс
    return steps.map((step, index) => ({
      ...step,
      id: `${step.id}_${index}`
    }));
  })
});

// Генератор конфигураций с ошибками
const invalidWorkflowConfigArb = fc.oneof(
  // Отсутствует имя
  fc.record({
    name: fc.constant(''),
    version: fc.constant('1.0.0'),
    settings: fc.record({
      artifacts_dir: fc.constant('./test-artifacts')
    }),
    steps: fc.array(fc.record({
      id: fc.string(),
      name: fc.string(),
      type: fc.constant('model')
    }), { minLength: 1 })
  }),
  // Циклические зависимости
  fc.constant({
    name: 'test-workflow',
    version: '1.0.0',
    settings: {
      artifacts_dir: './test-artifacts'
    },
    steps: [
      { id: 'step1', name: 'Step 1', type: 'model' as const, depends_on: ['step2'] },
      { id: 'step2', name: 'Step 2', type: 'model' as const, depends_on: ['step1'] }
    ]
  }),
  // Несуществующие зависимости
  fc.constant({
    name: 'test-workflow',
    version: '1.0.0',
    settings: {
      artifacts_dir: './test-artifacts'
    },
    steps: [
      { id: 'step1', name: 'Step 1', type: 'model' as const, depends_on: ['nonexistent'] }
    ]
  })
);

describe('Dry-run Property Tests', () => {
  const testDir = './test-temp-dry-run';
  
  beforeAll(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  /**
   * Свойство 45: Валидация dry-run без выполнения
   * Feature: workflow-orchestrator, Property 45: Валидация dry-run без выполнения
   * Validates: Requirements 13.1
   * 
   * Для любого выполнения dry-run, система должна валидировать конфигурацию
   * рабочего процесса без выполнения каких-либо CLI-команд.
   */
  test('Property 45: dry-run validates without executing commands', async () => {
    await fc.assert(
      fc.asyncProperty(validWorkflowConfigArb, async (config) => {
        // Создание временного файла конфигурации
        const configPath = path.join(testDir, `config-${Date.now()}-${Math.random()}.json`);
        await fs.writeFile(configPath, JSON.stringify(config, null, 2));

        try {
          const logger = createTestLogger();
          const orchestrator = new WorkflowOrchestrator({ logger });

          // Выполнение dry-run
          const result = await orchestrator.dryRun(configPath, {
            context: {},
            showSteps: false,
            checkResources: false
          });

          // Проверка: dry-run должен вернуть результат без выполнения команд
          expect(result).toBeDefined();
          expect(result.workflowName).toBe(config.name);
          expect(result.workflowVersion).toBe(config.version);
          expect(result.totalSteps).toBe(config.steps.length);

          // Проверка: не должно быть побочных эффектов (артефактов)
          // Dry-run не должен создавать артефакты или изменять файловую систему
          const artifactsExist = await fs.access(config.settings.artifacts_dir)
            .then(() => true)
            .catch(() => false);
          
          // Если директория артефактов существует, она должна быть пустой
          if (artifactsExist) {
            const files = await fs.readdir(config.settings.artifacts_dir);
            expect(files.length).toBe(0);
          }

        } finally {
          // Очистка
          await fs.unlink(configPath).catch(() => {});
        }
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Свойство 46: Отображение шагов dry-run
   * Feature: workflow-orchestrator, Property 46: Отображение шагов dry-run
   * Validates: Requirements 13.2
   * 
   * Для любого выполнения dry-run, вывод должен отображать все шаги
   * с подставленными параметрами.
   */
  test('Property 46: dry-run displays all steps with resolved parameters', async () => {
    await fc.assert(
      fc.asyncProperty(validWorkflowConfigArb, async (config) => {
        const configPath = path.join(testDir, `config-${Date.now()}-${Math.random()}.json`);
        await fs.writeFile(configPath, JSON.stringify(config, null, 2));

        try {
          const logger = createTestLogger();
          const orchestrator = new WorkflowOrchestrator({ logger });

          // Выполнение dry-run с отображением шагов
          const result = await orchestrator.dryRun(configPath, {
            context: {},
            showSteps: true,
            checkResources: false
          });

          // Проверка: результат должен содержать информацию о шагах
          expect(result.steps).toBeDefined();
          expect(result.steps!.length).toBe(config.steps.length);

          // Проверка: каждый шаг должен содержать необходимую информацию
          for (let i = 0; i < config.steps.length; i++) {
            const originalStep = config.steps[i];
            const resultStep = result.steps![i];

            expect(resultStep.id).toBe(originalStep.id);
            expect(resultStep.name).toBe(originalStep.name);
            expect(resultStep.type).toBe(originalStep.type);
            
            if (originalStep.depends_on) {
              expect(resultStep.dependsOn).toEqual(originalStep.depends_on);
            }
          }

        } finally {
          await fs.unlink(configPath).catch(() => {});
        }
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Свойство 47: Обнаружение ошибок dry-run
   * Feature: workflow-orchestrator, Property 47: Обнаружение ошибок dry-run
   * Validates: Requirements 13.3
   * 
   * Для любого рабочего процесса с ошибками конфигурации, dry-run должен
   * обнаруживать и сообщать обо всех ошибках с их местоположениями.
   */
  test('Property 47: dry-run detects and reports configuration errors', async () => {
    await fc.assert(
      fc.asyncProperty(invalidWorkflowConfigArb, async (config) => {
        const configPath = path.join(testDir, `config-${Date.now()}-${Math.random()}.json`);
        await fs.writeFile(configPath, JSON.stringify(config, null, 2));

        try {
          const logger = createTestLogger();
          const orchestrator = new WorkflowOrchestrator({ logger });

          // Выполнение dry-run
          const result = await orchestrator.dryRun(configPath, {
            context: {},
            showSteps: false,
            checkResources: false
          });

          // Проверка: результат должен быть невалидным
          expect(result.valid).toBe(false);

          // Проверка: должны быть ошибки
          expect(result.errors.length).toBeGreaterThan(0);

          // Проверка: каждая ошибка должна содержать сообщение
          for (const error of result.errors) {
            expect(error.message).toBeDefined();
            expect(error.message.length).toBeGreaterThan(0);
          }

        } finally {
          await fs.unlink(configPath).catch(() => {});
        }
      }),
      { numRuns: 30 }
    );
  });

  /**
   * Свойство 48: Подтверждение успеха dry-run
   * Feature: workflow-orchestrator, Property 48: Подтверждение успеха dry-run
   * Validates: Requirements 13.4
   * 
   * Для любого валидного рабочего процесса, успешный dry-run должен
   * подтвердить готовность к реальному выполнению.
   */
  test('Property 48: successful dry-run confirms readiness for execution', async () => {
    await fc.assert(
      fc.asyncProperty(validWorkflowConfigArb, async (config) => {
        const configPath = path.join(testDir, `config-${Date.now()}-${Math.random()}.json`);
        await fs.writeFile(configPath, JSON.stringify(config, null, 2));

        try {
          const logger = createTestLogger();
          const orchestrator = new WorkflowOrchestrator({ logger });

          // Выполнение dry-run
          const result = await orchestrator.dryRun(configPath, {
            context: {},
            showSteps: false,
            checkResources: false
          });

          // Проверка: если нет ошибок, результат должен быть валидным
          if (result.errors.length === 0) {
            expect(result.valid).toBe(true);
            expect(result.totalSteps).toBeGreaterThan(0);
          }

          // Проверка: валидный результат означает готовность к выполнению
          if (result.valid) {
            expect(result.errors.length).toBe(0);
            expect(result.workflowName).toBe(config.name);
            expect(result.workflowVersion).toBe(config.version);
          }

        } finally {
          await fs.unlink(configPath).catch(() => {});
        }
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Свойство 49: Валидация ресурсов dry-run
   * Feature: workflow-orchestrator, Property 49: Валидация ресурсов dry-run
   * Validates: Requirements 13.5
   * 
   * Для любого выполнения dry-run, система должна проверять существование
   * всех требуемых файлов и переменных.
   */
  test('Property 49: dry-run validates resource availability', async () => {
    await fc.assert(
      fc.asyncProperty(
        validWorkflowConfigArb,
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
        async (config, missingFiles) => {
          // Добавление ссылок на несуществующие файлы в конфигурацию
          const configWithFiles = {
            ...config,
            steps: config.steps.map((step, i) => ({
              ...step,
              prompt_template: i < missingFiles.length ? missingFiles[i] + '.txt' : undefined
            }))
          };

          const configPath = path.join(testDir, `config-${Date.now()}-${Math.random()}.json`);
          await fs.writeFile(configPath, JSON.stringify(configWithFiles, null, 2));

          try {
            const logger = createTestLogger();
            const orchestrator = new WorkflowOrchestrator({ logger });

            // Выполнение dry-run с проверкой ресурсов
            const result = await orchestrator.dryRun(configPath, {
              context: {},
              showSteps: false,
              checkResources: true
            });

            // Проверка: результат должен содержать информацию о проверке ресурсов
            expect(result.resourceCheck).toBeDefined();

            // Проверка: отсутствующие файлы должны быть обнаружены
            if (missingFiles.length > 0) {
              expect(result.resourceCheck!.missingFiles.length).toBeGreaterThan(0);
            }

            // Проверка: если есть отсутствующие ресурсы, должны быть ошибки
            if (result.resourceCheck!.missingFiles.length > 0 ||
                result.resourceCheck!.missingVariables.length > 0 ||
                result.resourceCheck!.unavailableAdapters.length > 0) {
              expect(result.valid).toBe(false);
              expect(result.errors.length).toBeGreaterThan(0);
            }

          } finally {
            await fs.unlink(configPath).catch(() => {});
          }
        }
      ),
      { numRuns: 30 }
    );
  });
});
