/**
 * Property-based тесты для интеграции адаптеров с оркестратором
 * 
 * Feature: orchestrator-testing, Property 1: Успешная интеграция с адаптерами
 * Validates: Requirements 1.1, 1.2, 1.3
 * 
 * Для любого доступного CLI-адаптера и валидного промпта, выполнение шага 
 * должно завершиться успешно и вернуть непустой ответ.
 */

import * as fc from 'fast-check';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { WorkflowOrchestrator } from '../../src/cli/orchestrator.js';
import { ClaudeCLIAdapter } from '../../src/adapters/claude-cli-adapter.js';
import { GeminiCLIAdapter } from '../../src/adapters/gemini-cli-adapter.js';
import { OpenAICLIAdapter } from '../../src/adapters/openai-cli-adapter.js';
import { Logger, LogLevel } from '../../src/core/logger.js';
import { WorkflowConfig, CLIAdapter } from '../../src/core/types.js';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Информация о доступном адаптере
 */
interface AvailableAdapter {
  name: string;
  adapter: CLIAdapter;
}

/**
 * Вспомогательная функция для создания временной директории
 */
async function createTempDir(prefix: string): Promise<string> {
  const tmpDir = path.join(process.cwd(), 'tmp', `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}`);
  await fs.mkdir(tmpDir, { recursive: true });
  return tmpDir;
}

/**
 * Вспомогательная функция для очистки временной директории
 */
async function cleanupTempDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch (error) {
    // Игнорируем ошибки очистки
  }
}

/**
 * Проверка доступности адаптеров
 */
async function checkAvailableAdapters(): Promise<AvailableAdapter[]> {
  const adapters: AvailableAdapter[] = [];
  
  // Проверяем Claude CLI
  const claudeAdapter = new ClaudeCLIAdapter();
  if (await claudeAdapter.isAvailable()) {
    adapters.push({ name: 'claude-cli', adapter: claudeAdapter });
  }
  
  // Проверяем Gemini CLI
  const geminiAdapter = new GeminiCLIAdapter();
  if (await geminiAdapter.isAvailable()) {
    adapters.push({ name: 'gemini-cli', adapter: geminiAdapter });
  }
  
  // Проверяем OpenAI CLI
  const openaiAdapter = new OpenAICLIAdapter();
  if (await openaiAdapter.isAvailable()) {
    adapters.push({ name: 'openai-cli', adapter: openaiAdapter });
  }
  
  return adapters;
}

/**
 * Создание простого workflow для тестирования
 */
function createTestWorkflow(
  adapterName: string,
  prompt: string,
  artifactsDir: string
): WorkflowConfig {
  return {
    name: 'property-test-workflow',
    version: '1.0.0',
    description: 'Property-based тестовый workflow',
    settings: {
      artifacts_dir: artifactsDir,
      default_adapter: adapterName,
      timeout: 60000 // 60 секунд таймаут
    },
    steps: [
      {
        id: 'test_step',
        name: 'Тестовый шаг',
        type: 'model',
        adapter: adapterName,
        prompt_template: prompt,
        outputs: {
          result: 'test_output.md'
        }
      }
    ]
  };
}

describe('Adapter Integration Property Tests', () => {
  let availableAdapters: AvailableAdapter[];
  let orchestrator: WorkflowOrchestrator;
  let logger: Logger;
  let tempDir: string;

  beforeEach(async () => {
    // Проверяем доступные адаптеры один раз перед всеми тестами
    // Используем кэшированный результат если уже проверяли
    if (!availableAdapters) {
      availableAdapters = await checkAvailableAdapters();
    }
    
    // Создание временной директории
    tempDir = await createTempDir('adapter-property-test');
    
    // Создание логгера
    logger = new Logger({
      level: LogLevel.ERROR, // Минимальный уровень логирования для тестов
      enableConsole: false,
      enableFile: false
    });
    
    // Создание оркестратора
    orchestrator = new WorkflowOrchestrator({
      stateDir: path.join(tempDir, 'state'),
      artifactsDir: path.join(tempDir, 'artifacts'),
      logger
    });
    
    // Регистрация всех доступных адаптеров
    for (const { adapter } of availableAdapters) {
      orchestrator.registerAdapter(adapter);
    }
  }, 30000); // Таймаут 30 секунд для beforeEach

  afterEach(async () => {
    // Очистка временной директории
    await cleanupTempDir(tempDir);
  }, 10000); // Таймаут 10 секунд для afterEach

  /**
   * Property 1: Успешная интеграция с адаптерами
   * 
   * Для любого доступного CLI-адаптера и валидного промпта, выполнение шага 
   * должно завершиться успешно и вернуть непустой ответ.
   * 
   * Validates: Requirements 1.1, 1.2, 1.3
   */
  it('Property 1: для любого доступного адаптера и валидного промпта выполнение должно завершиться успешно', async () => {
    // Пропускаем тест если нет доступных адаптеров
    if (availableAdapters.length === 0) {
      console.log('⚠️  Нет доступных CLI-адаптеров, пропускаем property-тест');
      return;
    }

    await fc.assert(
      fc.asyncProperty(
        // Генератор: выбираем случайный доступный адаптер
        fc.constantFrom(...availableAdapters.map(a => a.name)),
        
        // Генератор: создаем валидный промпт (короткий, чтобы тест выполнялся быстро)
        fc.oneof(
          fc.constant('Ответь одним словом: да или нет?'),
          fc.constant('Напиши число от 1 до 10'),
          fc.constant('Скажи "привет"'),
          fc.constant('Какой сегодня день недели? Ответь одним словом.'),
          fc.constant('Назови любой цвет одним словом')
        ),
        
        async (adapterName, prompt) => {
          // Создаем уникальную директорию для артефактов этого теста
          const testArtifactsDir = path.join(tempDir, 'artifacts', `test-${Date.now()}-${Math.random().toString(36).substring(7)}`);
          await fs.mkdir(testArtifactsDir, { recursive: true });
          
          // Создаем конфигурацию workflow
          const config = createTestWorkflow(adapterName, prompt, testArtifactsDir);
          
          // Сохраняем конфигурацию в файл
          const configPath = path.join(tempDir, `workflow-${Date.now()}-${Math.random().toString(36).substring(7)}.json`);
          await fs.writeFile(configPath, JSON.stringify(config, null, 2));
          
          try {
            // Выполняем workflow
            const state = await orchestrator.run(configPath);
            
            // Проверка 1: Workflow должен завершиться успешно
            expect(state.status).toBe('completed');
            
            // Проверка 2: Шаг должен быть выполнен
            expect(state.completedSteps).toContain('test_step');
            expect(state.completedSteps).toHaveLength(1);
            
            // Проверка 3: Не должно быть ошибок
            expect(state.errors).toHaveLength(0);
            
            // Проверка 4: Артефакт должен быть создан
            expect(state.artifacts).toHaveProperty('result');
            const artifactPath = state.artifacts['result'];
            expect(artifactPath).toBeDefined();
            
            // Проверка 5: Артефакт должен существовать
            const artifactExists = await fs.access(artifactPath).then(() => true).catch(() => false);
            expect(artifactExists).toBe(true);
            
            // Проверка 6: Артефакт должен содержать непустой ответ
            const artifactContent = await fs.readFile(artifactPath, 'utf-8');
            expect(artifactContent.length).toBeGreaterThan(0);
            expect(artifactContent.trim().length).toBeGreaterThan(0);
            
            // Проверка 7: История выполнения должна содержать запись о шаге
            expect(state.history).toHaveLength(1);
            const stepHistory = state.history[0];
            expect(stepHistory.stepId).toBe('test_step');
            expect(stepHistory.status).toBe('success');
            expect(stepHistory.adapter).toBe(adapterName);
            
            // Проверка 8: Время выполнения должно быть положительным
            expect(stepHistory.executionTime).toBeGreaterThan(0);
            
          } catch (error) {
            // Если произошла ошибка, тест не пройден
            throw new Error(
              `Выполнение workflow с адаптером ${adapterName} и промптом "${prompt}" завершилось с ошибкой: ${(error as Error).message}`
            );
          }
        }
      ),
      {
        numRuns: 10, // Уменьшаем количество итераций для реальных API вызовов
        timeout: 120000, // 2 минуты таймаут на каждую итерацию
        verbose: true // Включаем подробный вывод для отладки
      }
    );
  }, 1200000); // Общий таймаут 20 минут для всего теста (10 итераций * 2 минуты)

  /**
   * Property 2: Множественные адаптеры работают независимо
   * 
   * Для любых двух доступных адаптеров, выполнение одного и того же промпта
   * должно завершиться успешно для обоих, и результаты должны быть независимыми.
   * 
   * Validates: Requirements 1.1, 1.2, 1.3
   */
  it('Property 2: множественные адаптеры работают независимо', async () => {
    // Пропускаем тест если доступно меньше 2 адаптеров
    if (availableAdapters.length < 2) {
      console.log('⚠️  Доступно меньше 2 CLI-адаптеров, пропускаем property-тест');
      return;
    }

    await fc.assert(
      fc.asyncProperty(
        // Генератор: выбираем два разных адаптера
        fc.tuple(
          fc.constantFrom(...availableAdapters.map(a => a.name)),
          fc.constantFrom(...availableAdapters.map(a => a.name))
        ).filter(([adapter1, adapter2]) => adapter1 !== adapter2),
        
        // Генератор: создаем валидный промпт
        fc.constant('Ответь одним словом: да или нет?'),
        
        async ([adapter1Name, adapter2Name], prompt) => {
          // Создаем уникальные директории для артефактов
          const test1ArtifactsDir = path.join(tempDir, 'artifacts', `test1-${Date.now()}-${Math.random().toString(36).substring(7)}`);
          const test2ArtifactsDir = path.join(tempDir, 'artifacts', `test2-${Date.now()}-${Math.random().toString(36).substring(7)}`);
          await fs.mkdir(test1ArtifactsDir, { recursive: true });
          await fs.mkdir(test2ArtifactsDir, { recursive: true });
          
          // Создаем конфигурации для обоих адаптеров
          const config1 = createTestWorkflow(adapter1Name, prompt, test1ArtifactsDir);
          const config2 = createTestWorkflow(adapter2Name, prompt, test2ArtifactsDir);
          
          // Сохраняем конфигурации
          const configPath1 = path.join(tempDir, `workflow1-${Date.now()}.json`);
          const configPath2 = path.join(tempDir, `workflow2-${Date.now()}.json`);
          await fs.writeFile(configPath1, JSON.stringify(config1, null, 2));
          await fs.writeFile(configPath2, JSON.stringify(config2, null, 2));
          
          try {
            // Выполняем оба workflow
            const [state1, state2] = await Promise.all([
              orchestrator.run(configPath1),
              orchestrator.run(configPath2)
            ]);
            
            // Проверка 1: Оба workflow должны завершиться успешно
            expect(state1.status).toBe('completed');
            expect(state2.status).toBe('completed');
            
            // Проверка 2: Оба шага должны быть выполнены
            expect(state1.completedSteps).toContain('test_step');
            expect(state2.completedSteps).toContain('test_step');
            
            // Проверка 3: Не должно быть ошибок
            expect(state1.errors).toHaveLength(0);
            expect(state2.errors).toHaveLength(0);
            
            // Проверка 4: Артефакты должны быть созданы
            expect(state1.artifacts).toHaveProperty('result');
            expect(state2.artifacts).toHaveProperty('result');
            
            // Проверка 5: Артефакты должны быть в разных директориях (независимость)
            const artifact1Path = state1.artifacts['result'];
            const artifact2Path = state2.artifacts['result'];
            expect(artifact1Path).not.toBe(artifact2Path);
            
            // Проверка 6: Оба артефакта должны содержать непустые ответы
            const artifact1Content = await fs.readFile(artifact1Path, 'utf-8');
            const artifact2Content = await fs.readFile(artifact2Path, 'utf-8');
            expect(artifact1Content.trim().length).toBeGreaterThan(0);
            expect(artifact2Content.trim().length).toBeGreaterThan(0);
            
            // Проверка 7: История должна содержать правильные адаптеры
            expect(state1.history[0].adapter).toBe(adapter1Name);
            expect(state2.history[0].adapter).toBe(adapter2Name);
            
          } catch (error) {
            throw new Error(
              `Параллельное выполнение с адаптерами ${adapter1Name} и ${adapter2Name} завершилось с ошибкой: ${(error as Error).message}`
            );
          }
        }
      ),
      {
        numRuns: 5, // Меньше итераций для параллельных тестов
        timeout: 180000, // 3 минуты таймаут на каждую итерацию
        verbose: true
      }
    );
  }, 900000); // Общий таймаут 15 минут

  /**
   * Property 3: Адаптеры корректно обрабатывают различные типы промптов
   * 
   * Для любого доступного адаптера, различные типы валидных промптов
   * (короткие, длинные, с специальными символами) должны обрабатываться успешно.
   * 
   * Validates: Requirements 1.1, 1.2, 1.3
   */
  it('Property 3: адаптеры корректно обрабатывают различные типы промптов', async () => {
    // Пропускаем тест если нет доступных адаптеров
    if (availableAdapters.length === 0) {
      console.log('⚠️  Нет доступных CLI-адаптеров, пропускаем property-тест');
      return;
    }

    await fc.assert(
      fc.asyncProperty(
        // Генератор: выбираем случайный доступный адаптер
        fc.constantFrom(...availableAdapters.map(a => a.name)),
        
        // Генератор: создаем различные типы промптов
        fc.oneof(
          // Короткий промпт
          fc.constant('Да'),
          // Промпт с вопросом
          fc.constant('Какой сегодня день?'),
          // Промпт с числами
          fc.constant('Сколько будет 2+2?'),
          // Промпт с кавычками
          fc.constant('Скажи "привет"'),
          // Промпт с переносом строки (но короткий)
          fc.constant('Первая строка\nВторая строка'),
          // Промпт с emoji
          fc.constant('Ответь emoji: 👍 или 👎?')
        ),
        
        async (adapterName, prompt) => {
          // Создаем уникальную директорию для артефактов
          const testArtifactsDir = path.join(tempDir, 'artifacts', `test-${Date.now()}-${Math.random().toString(36).substring(7)}`);
          await fs.mkdir(testArtifactsDir, { recursive: true });
          
          // Создаем конфигурацию workflow
          const config = createTestWorkflow(adapterName, prompt, testArtifactsDir);
          
          // Сохраняем конфигурацию
          const configPath = path.join(tempDir, `workflow-${Date.now()}-${Math.random().toString(36).substring(7)}.json`);
          await fs.writeFile(configPath, JSON.stringify(config, null, 2));
          
          try {
            // Выполняем workflow
            const state = await orchestrator.run(configPath);
            
            // Проверка 1: Workflow должен завершиться успешно
            expect(state.status).toBe('completed');
            
            // Проверка 2: Шаг должен быть выполнен
            expect(state.completedSteps).toContain('test_step');
            
            // Проверка 3: Не должно быть ошибок
            expect(state.errors).toHaveLength(0);
            
            // Проверка 4: Артефакт должен содержать непустой ответ
            const artifactPath = state.artifacts['result'];
            const artifactContent = await fs.readFile(artifactPath, 'utf-8');
            expect(artifactContent.trim().length).toBeGreaterThan(0);
            
          } catch (error) {
            throw new Error(
              `Выполнение с адаптером ${adapterName} и промптом "${prompt}" завершилось с ошибкой: ${(error as Error).message}`
            );
          }
        }
      ),
      {
        numRuns: 10,
        timeout: 120000,
        verbose: true
      }
    );
  }, 1200000); // Общий таймаут 20 минут
});
