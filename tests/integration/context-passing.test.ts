/**
 * Интеграционный тест для передачи контекста между шагами
 * 
 * Проверяет:
 * - Вложенные подстановки переменных
 * - Двойную передачу контекста (содержимое + путь)
 * - Кэширование артефактов
 * - Обрамление в теги
 * 
 * Validates: Requirements 1.1, 2.1, 3.2, 4.1
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { DefaultWorkflowEngine, WorkflowEngineConfig } from '../../src/core/workflow-engine.js';
import { WorkflowConfigParser } from '../../src/core/workflow-config-parser.js';
import { DefaultStateManager } from '../../src/core/state-manager.js';
import { DefaultStepExecutor } from '../../src/core/step-executor.js';
import { DefaultTemplateEngine } from '../../src/core/template-engine.js';
import { DefaultArtifactManager } from '../../src/core/artifact-manager.js';
import { AdapterRegistry } from '../../src/adapters/adapter-registry.js';
import { MockCLIAdapter } from '../../src/adapters/mock-cli-adapter.js';
import { RoleManager } from '../../src/core/role-manager.js';
import { getLogger } from '../../src/core/logger.js';
import { WorkflowConfig } from '../../src/core/types.js';
import * as fs from 'fs/promises';
import { readFileSync } from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Создание тестового окружения
 */
async function createTestEnvironment() {
  // Создание временной директории
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'context-test-'));
  const stateDir = path.join(tempDir, 'state');
  const artifactsDir = path.join(tempDir, 'artifacts');

  await fs.mkdir(stateDir, { recursive: true });
  await fs.mkdir(artifactsDir, { recursive: true });

  // Создание компонентов
  const logger = getLogger();
  const configParser = new WorkflowConfigParser();
  const stateManager = new DefaultStateManager({
    stateDir,
    logger
  });

  // Создание mock-адаптера
  const mockAdapter = new MockCLIAdapter('test-cli', '1.0.0');
  
  // Настройка ответов - возвращаем промпт обратно для проверки
  mockAdapter.setResponse(
    /.*/,  // Любой промпт
    'Mock response'  // Будет заменено на промпт в execute
  );
  
  // Переопределяем execute для возврата промпта
  const originalExecute = mockAdapter.execute.bind(mockAdapter);
  mockAdapter.execute = async (request) => {
    const result = await originalExecute(request);
    // Возвращаем промпт вместо mock-ответа для проверки обработки
    return {
      ...result,
      content: request.prompt
    };
  };

  const adapterRegistry = new AdapterRegistry();
  adapterRegistry.register(mockAdapter);

  const roleManager = new RoleManager();
  roleManager.loadRoles({
    test_role: {
      adapter: 'test-cli',
      model: 'test-model',
      permissions: ['read', 'edit']
    }
  });

  const templateEngine = new DefaultTemplateEngine(logger);
  const artifactManager = new DefaultArtifactManager({
    baseDir: artifactsDir,
    logger
  });

  const stepExecutor = new DefaultStepExecutor({
    defaultTimeout: 10000,
    roleManager
  });

  const engineConfig: WorkflowEngineConfig = {
    configParser,
    stateManager,
    stepExecutor,
    adapterRegistry,
    templateEngine,
    artifactManager,
    logger
  };

  const engine = new DefaultWorkflowEngine(engineConfig);

  return {
    engine,
    mockAdapter,
    stateManager,
    templateEngine,
    artifactManager,
    tempDir,
    stateDir,
    artifactsDir,
    cleanup: async () => {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (error) {
        // Игнорируем ошибки очистки
      }
    }
  };
}

describe('Context Passing Integration Tests', () => {
  let env: Awaited<ReturnType<typeof createTestEnvironment>>;

  beforeEach(async () => {
    env = await createTestEnvironment();
  });

  afterEach(async () => {
    await env.cleanup();
  });

  describe('Requirement 1.1: Вложенные подстановки переменных', () => {
    it('должен корректно разрешать вложенные переменные ${artifact:${variable}}', async () => {
      // Создаем конфигурацию с вложенными подстановками
      const config: WorkflowConfig = {
        name: 'nested-variables-test',
        version: '1.0.0',
        description: 'Тест вложенных переменных',
        settings: {
          artifacts_dir: env.artifactsDir,
          default_adapter: 'test-cli'
        },
        roles: {
          test_role: {
            adapter: 'test-cli',
            model: 'test-model'
          }
        },
        steps: [
          // Шаг 1: Создаем артефакт
          {
            id: 'step1',
            name: 'Создание первого артефакта',
            type: 'model',
            role: 'test_role',
            prompt_template: 'Создайте первый артефакт',
            outputs: {
              first_output: 'step1_output.md'
            }
          },
          // Шаг 2: Используем вложенную переменную для загрузки артефакта
          {
            id: 'step2',
            name: 'Использование вложенной переменной',
            type: 'model',
            role: 'test_role',
            depends_on: ['step1'],
            prompt_template: 'Используйте данные: ${artifact:${first_output_file}}',
            outputs: {
              second_output: 'step2_output.md'
            }
          }
        ]
      };

      const state = await env.engine.execute(config, {});

      // Проверяем, что оба шага выполнены
      expect(state.completedSteps).toContain('step1');
      expect(state.completedSteps).toContain('step2');

      // Проверяем, что в контексте есть обе переменные (содержимое и путь)
      expect(state.context['first_output']).toBeDefined();
      expect(state.context['first_output_file']).toBeDefined();

      // Проверяем, что путь к файлу корректный
      const filePath = state.context['first_output_file'] as string;
      expect(filePath).toContain('step1_output.md');

      // Проверяем, что файл существует
      const fileExists = await fs.access(filePath)
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);
    }, 30000);

    it('должен поддерживать несколько уровней вложенности', async () => {
      // Тест проверяет, что можно использовать переменную, которая содержит путь к файлу,
      // для загрузки артефакта через вложенную подстановку
      const config: WorkflowConfig = {
        name: 'multi-level-nesting-test',
        version: '1.0.0',
        description: 'Тест многоуровневой вложенности',
        settings: {
          artifacts_dir: env.artifactsDir,
          default_adapter: 'test-cli'
        },
        roles: {
          test_role: {
            adapter: 'test-cli',
            model: 'test-model'
          }
        },
        steps: [
          {
            id: 'step1',
            name: 'Создание первого артефакта',
            type: 'model',
            role: 'test_role',
            prompt_template: 'Создайте первый артефакт',
            outputs: {
              data1: 'data1.md'
            }
          },
          {
            id: 'step2',
            name: 'Создание второго артефакта',
            type: 'model',
            role: 'test_role',
            prompt_template: 'Создайте второй артефакт',
            outputs: {
              data2: 'data2.md'
            }
          },
          {
            id: 'step3',
            name: 'Использование вложенных переменных',
            type: 'model',
            role: 'test_role',
            depends_on: ['step1', 'step2'],
            // Используем вложенные переменные для загрузки обоих артефактов
            prompt_template: 
              'Первый: ${artifact:${data1_file}}\n' +
              'Второй: ${artifact:${data2_file}}',
            outputs: {
              result: 'result.md'
            }
          }
        ]
      };

      const state = await env.engine.execute(config, {});

      // Проверяем успешное выполнение
      expect(state.status).toBe('completed');
      expect(state.completedSteps).toContain('step3');
      
      // Проверяем, что результат содержит данные из обоих артефактов
      const resultPath = state.artifacts['result'] as string;
      const resultContent = await fs.readFile(resultPath, 'utf-8');
      expect(resultContent).toContain('Первый:');
      expect(resultContent).toContain('Второй:');
    }, 30000);
  });

  describe('Requirement 2.1: Двойная передача контекста', () => {
    it('должен создавать обе переменные: содержимое и путь к файлу', async () => {
      const config: WorkflowConfig = {
        name: 'dual-context-test',
        version: '1.0.0',
        description: 'Тест двойной передачи контекста',
        settings: {
          artifacts_dir: env.artifactsDir,
          default_adapter: 'test-cli'
        },
        roles: {
          test_role: {
            adapter: 'test-cli',
            model: 'test-model'
          }
        },
        steps: [
          {
            id: 'step1',
            name: 'Создание артефакта',
            type: 'model',
            role: 'test_role',
            prompt_template: 'Создайте артефакт',
            outputs: {
              my_output: 'output.md'
            }
          }
        ]
      };

      const state = await env.engine.execute(config, {});

      // Проверяем наличие переменной с содержимым
      expect(state.context['my_output']).toBeDefined();
      expect(typeof state.context['my_output']).toBe('string');
      expect((state.context['my_output'] as string).length).toBeGreaterThan(0);

      // Проверяем наличие переменной с путем к файлу
      expect(state.context['my_output_file']).toBeDefined();
      expect(typeof state.context['my_output_file']).toBe('string');
      expect((state.context['my_output_file'] as string)).toContain('output.md');

      // Проверяем, что содержимое совпадает с содержимым файла
      const filePath = state.context['my_output_file'] as string;
      const fileContent = await fs.readFile(filePath, 'utf-8');
      expect(fileContent).toBe(state.context['my_output']);
    }, 30000);

    it('должен позволять использовать оба способа доступа к данным', async () => {
      const config: WorkflowConfig = {
        name: 'dual-access-test',
        version: '1.0.0',
        description: 'Тест обоих способов доступа',
        settings: {
          artifacts_dir: env.artifactsDir,
          default_adapter: 'test-cli'
        },
        roles: {
          test_role: {
            adapter: 'test-cli',
            model: 'test-model'
          }
        },
        steps: [
          {
            id: 'step1',
            name: 'Создание артефакта',
            type: 'model',
            role: 'test_role',
            prompt_template: 'Создайте данные',
            outputs: {
              data: 'data.md'
            }
          },
          {
            id: 'step2',
            name: 'Прямой доступ к содержимому',
            type: 'model',
            role: 'test_role',
            depends_on: ['step1'],
            prompt_template: 'Прямой доступ: ${data}',
            outputs: {
              result1: 'result1.md'
            }
          },
          {
            id: 'step3',
            name: 'Доступ через файл',
            type: 'model',
            role: 'test_role',
            depends_on: ['step1'],
            prompt_template: 'Через файл: ${artifact:${data_file}}',
            outputs: {
              result2: 'result2.md'
            }
          }
        ]
      };

      const state = await env.engine.execute(config, {});

      // Проверяем, что оба шага выполнены успешно
      expect(state.completedSteps).toContain('step2');
      expect(state.completedSteps).toContain('step3');
    }, 30000);
  });

  describe('Requirement 3.2: Кэширование артефактов', () => {
    it('должен кэшировать загруженные артефакты', async () => {
      const config: WorkflowConfig = {
        name: 'caching-test',
        version: '1.0.0',
        description: 'Тест кэширования',
        settings: {
          artifacts_dir: env.artifactsDir,
          default_adapter: 'test-cli'
        },
        roles: {
          test_role: {
            adapter: 'test-cli',
            model: 'test-model'
          }
        },
        steps: [
          {
            id: 'step1',
            name: 'Создание артефакта',
            type: 'model',
            role: 'test_role',
            prompt_template: 'Создайте данные',
            outputs: {
              data: 'data.md'
            }
          },
          {
            id: 'step2',
            name: 'Первая загрузка',
            type: 'model',
            role: 'test_role',
            depends_on: ['step1'],
            // Загружаем артефакт три раза в одном промпте
            prompt_template: 
              'Первая загрузка: ${artifact:${data_file}}\n' +
              'Вторая загрузка: ${artifact:${data_file}}\n' +
              'Третья загрузка: ${artifact:${data_file}}',
            outputs: {
              result: 'result.md'
            }
          }
        ]
      };

      // Сбрасываем счетчики перед тестом
      env.templateEngine.resetReadCounters();

      const state = await env.engine.execute(config, {});

      // Проверяем успешное выполнение
      expect(state.status).toBe('completed');

      // Получаем счетчики операций чтения
      const counters = env.templateEngine.getReadCounters();

      // Должно быть только одно чтение из файла (первая загрузка)
      // Остальные две загрузки должны быть из кэша
      expect(counters.fileReads).toBe(1);
      expect(counters.cacheHits).toBeGreaterThanOrEqual(2);
    }, 30000);

    it('должен использовать кэш в течение 5 минут', async () => {
      // Создаем тестовый файл
      const testFile = path.join(env.artifactsDir, 'test.md');
      await fs.writeFile(testFile, 'Исходное содержимое');

      // Первая загрузка
      const context1 = {
        variables: { test_file: testFile },
        loadArtifact: (p: string) => readFileSync(p, 'utf-8'),
        if: (c: boolean, t: string, e?: string) => c ? t : (e || ''),
        forEach: (items: unknown[], template: string) => 
          Array.isArray(items) ? items.map(i => template.replace(/\$\{item\}/g, String(i))).join('') : ''
      };

      const result1 = env.templateEngine.render('${artifact:${test_file}}', context1);
      expect(result1).toBe('Исходное содержимое');

      // Изменяем файл
      await fs.writeFile(testFile, 'Новое содержимое');

      // Вторая загрузка (должна вернуть закэшированное содержимое)
      const result2 = env.templateEngine.render('${artifact:${test_file}}', context1);
      expect(result2).toBe('Исходное содержимое'); // Из кэша

      // Проверяем счетчики
      const counters = env.templateEngine.getReadCounters();
      expect(counters.cacheHits).toBeGreaterThan(0);
    }, 30000);
  });

  describe('Requirement 4.1: Обрамление в теги', () => {
    it('должен обрамлять содержимое в теги при использовании синтаксиса :tag_name', async () => {
      const config: WorkflowConfig = {
        name: 'tags-test',
        version: '1.0.0',
        description: 'Тест обрамления в теги',
        settings: {
          artifacts_dir: env.artifactsDir,
          default_adapter: 'test-cli'
        },
        roles: {
          test_role: {
            adapter: 'test-cli',
            model: 'test-model'
          }
        },
        steps: [
          {
            id: 'step1',
            name: 'Создание артефакта',
            type: 'model',
            role: 'test_role',
            prompt_template: 'Создайте данные',
            outputs: {
              data: 'data.md'
            }
          },
          {
            id: 'step2',
            name: 'Использование тегов',
            type: 'model',
            role: 'test_role',
            depends_on: ['step1'],
            prompt_template: 'Данные с тегами:\n${artifact:${data_file}:my_data}',
            outputs: {
              result: 'result.md'
            }
          }
        ]
      };

      const state = await env.engine.execute(config, {});

      // Проверяем успешное выполнение
      expect(state.status).toBe('completed');

      // Получаем содержимое результата
      const resultPath = state.artifacts['result'] as string;
      const resultContent = await fs.readFile(resultPath, 'utf-8');

      // Проверяем, что содержимое обрамлено в теги
      expect(resultContent).toContain('<my_data>');
      expect(resultContent).toContain('</my_data>');
    }, 30000);

    it('должен экранировать специальные символы в именах тегов', async () => {
      // Создаем тестовый файл
      const testFile = path.join(env.artifactsDir, 'test.md');
      await fs.writeFile(testFile, 'Тестовое содержимое');

      const context = {
        variables: { test_file: testFile },
        loadArtifact: (p: string) => readFileSync(p, 'utf-8'),
        if: (c: boolean, t: string, e?: string) => c ? t : (e || ''),
        forEach: (items: unknown[], template: string) => 
          Array.isArray(items) ? items.map(i => template.replace(/\$\{item\}/g, String(i))).join('') : ''
      };

      // Используем имя тега со специальными символами
      const result = env.templateEngine.render(
        '${artifact:${test_file}:my@tag#name!}',
        context
      );

      // Проверяем, что специальные символы экранированы
      expect(result).toContain('<my_tag_name_>');
      expect(result).toContain('</my_tag_name_>');
      expect(result).toContain('Тестовое содержимое');
    }, 30000);

    it('должен поддерживать множественные артефакты с разными тегами', async () => {
      const config: WorkflowConfig = {
        name: 'multiple-tags-test',
        version: '1.0.0',
        description: 'Тест множественных тегов',
        settings: {
          artifacts_dir: env.artifactsDir,
          default_adapter: 'test-cli'
        },
        roles: {
          test_role: {
            adapter: 'test-cli',
            model: 'test-model'
          }
        },
        steps: [
          {
            id: 'step1',
            name: 'Создание первого артефакта',
            type: 'model',
            role: 'test_role',
            prompt_template: 'Создайте первый артефакт',
            outputs: {
              data1: 'data1.md'
            }
          },
          {
            id: 'step2',
            name: 'Создание второго артефакта',
            type: 'model',
            role: 'test_role',
            prompt_template: 'Создайте второй артефакт',
            outputs: {
              data2: 'data2.md'
            }
          },
          {
            id: 'step3',
            name: 'Использование обоих артефактов с тегами',
            type: 'model',
            role: 'test_role',
            depends_on: ['step1', 'step2'],
            prompt_template: 
              'Первый артефакт:\n${artifact:${data1_file}:first}\n\n' +
              'Второй артефакт:\n${artifact:${data2_file}:second}',
            outputs: {
              result: 'result.md'
            }
          }
        ]
      };

      const state = await env.engine.execute(config, {});

      // Проверяем успешное выполнение
      expect(state.status).toBe('completed');

      // Получаем содержимое результата
      const resultPath = state.artifacts['result'] as string;
      const resultContent = await fs.readFile(resultPath, 'utf-8');

      // Проверяем наличие обоих тегов
      expect(resultContent).toContain('<first>');
      expect(resultContent).toContain('</first>');
      expect(resultContent).toContain('<second>');
      expect(resultContent).toContain('</second>');
    }, 30000);
  });

  describe('Комплексный тест: Все функции вместе', () => {
    it('должен корректно работать с вложенными переменными, двойной передачей, кэшированием и тегами', async () => {
      const config: WorkflowConfig = {
        name: 'comprehensive-test',
        version: '1.0.0',
        description: 'Комплексный тест всех функций',
        settings: {
          artifacts_dir: env.artifactsDir,
          default_adapter: 'test-cli'
        },
        roles: {
          test_role: {
            adapter: 'test-cli',
            model: 'test-model'
          }
        },
        steps: [
          // Шаг 1: Создаем первый артефакт
          {
            id: 'step1',
            name: 'Создание первого артефакта',
            type: 'model',
            role: 'test_role',
            prompt_template: 'Создайте первый артефакт',
            outputs: {
              first: 'first.md'
            }
          },
          // Шаг 2: Создаем второй артефакт
          {
            id: 'step2',
            name: 'Создание второго артефакта',
            type: 'model',
            role: 'test_role',
            prompt_template: 'Создайте второй артефакт',
            outputs: {
              second: 'second.md'
            }
          },
          // Шаг 3: Используем все функции вместе
          {
            id: 'step3',
            name: 'Комплексное использование',
            type: 'model',
            role: 'test_role',
            depends_on: ['step1', 'step2'],
            prompt_template: 
              '# Прямой доступ к содержимому\n${first}\n\n' +
              '# Вложенная переменная с тегами\n${artifact:${second_file}:second_data}\n\n' +
              '# Повторная загрузка (из кэша)\n${artifact:${second_file}:second_data_cached}',
            outputs: {
              final: 'final.md'
            }
          }
        ]
      };

      // Сбрасываем счетчики
      env.templateEngine.resetReadCounters();

      const state = await env.engine.execute(config, {});

      // Проверяем успешное выполнение
      expect(state.status).toBe('completed');
      expect(state.completedSteps).toContain('step3');

      // Проверяем двойную передачу контекста
      expect(state.context['first']).toBeDefined();
      expect(state.context['first_file']).toBeDefined();
      expect(state.context['second']).toBeDefined();
      expect(state.context['second_file']).toBeDefined();

      // Получаем содержимое финального артефакта
      const finalPath = state.artifacts['final'] as string;
      const finalContent = await fs.readFile(finalPath, 'utf-8');

      // Проверяем наличие тегов
      expect(finalContent).toContain('<second_data>');
      expect(finalContent).toContain('</second_data>');
      expect(finalContent).toContain('<second_data_cached>');
      expect(finalContent).toContain('</second_data_cached>');

      // Проверяем кэширование (должно быть только одно чтение файла)
      const counters = env.templateEngine.getReadCounters();
      expect(counters.fileReads).toBe(1); // Только одно чтение second_file
      expect(counters.cacheHits).toBeGreaterThan(0); // Повторная загрузка из кэша
    }, 30000);
  });
});
