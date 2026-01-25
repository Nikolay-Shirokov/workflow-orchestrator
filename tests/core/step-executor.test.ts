/**
 * Unit-тесты для исполнителя шагов
 * Проверяют основную функциональность выполнения различных типов шагов
 */

import { DefaultStepExecutor } from '../../src/core/step-executor.js';
import {
  WorkflowStep,
  ExecutionContext,
  WorkflowState
} from '../../src/core/types.js';
import { AdapterRegistry } from '../../src/adapters/adapter-registry.js';
import { MockCLIAdapter } from '../../src/adapters/mock-cli-adapter.js';
import { DefaultTemplateEngine } from '../../src/core/template-engine.js';
import { createArtifactManager } from '../../src/core/artifact-manager.js';
import { getLogger } from '../../src/core/logger.js';
import * as fs from 'fs/promises';

// Вспомогательная функция для создания тестового контекста
function createTestContext(
  contextVariables: Record<string, unknown> = {}
): ExecutionContext {
  const state: WorkflowState = {
    sessionId: 'test-session',
    workflowName: 'test-workflow',
    workflowVersion: '1.0.0',
    currentStep: 'test-step',
    status: 'running',
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedSteps: [],
    artifacts: {},
    context: {
      default_adapter: 'mock-adapter',
      ...contextVariables
    },
    history: [],
    errors: []
  };

  const adapters = new AdapterRegistry();
  const mockAdapter = new MockCLIAdapter('mock-adapter', '1.0.0');
  mockAdapter.setResponse(/.*/, 'Test response from model');
  adapters.register(mockAdapter);

  const templateEngine = new DefaultTemplateEngine();
  const artifactManager = createArtifactManager({
    baseDir: './test-artifacts-unit'
  });
  const logger = getLogger();

  return {
    state,
    adapters,
    templateEngine,
    artifactManager,
    logger
  };
}

// Очистка тестовых артефактов
async function cleanupTestArtifacts() {
  try {
    await fs.rm('./test-artifacts-unit', { recursive: true, force: true });
  } catch {
    // Игнорируем ошибки
  }
}

describe('StepExecutor Unit Tests', () => {
  let executor: DefaultStepExecutor;

  beforeEach(async () => {
    executor = new DefaultStepExecutor();
    await cleanupTestArtifacts();
  });

  afterEach(async () => {
    await cleanupTestArtifacts();
  });

  describe('Выполнение шагов типа model', () => {
    it('должен успешно выполнять шаг модели', async () => {
      const context = createTestContext();
      
      const step: WorkflowStep = {
        id: 'model-step-1',
        name: 'Test Model Step',
        type: 'model',
        prompt_template: 'Test prompt: ${test_var}',
        outputs: {
          result: 'output.txt'
        }
      };
      
      context.state.context.test_var = 'test value';
      
      const result = await executor.executeStep(step, context);
      
      expect(result.status).toBe('success');
      expect(result.stepId).toBe('model-step-1');
      expect(result.outputs.content).toBe('Test response from model');
      expect(result.artifacts.length).toBeGreaterThan(0);
    });

    it('должен выбрасывать ошибку если адаптер не найден', async () => {
      const context = createTestContext();
      
      const step: WorkflowStep = {
        id: 'model-step-2',
        name: 'Test Model Step',
        type: 'model',
        adapter: 'non-existent-adapter',
        prompt_template: 'Test prompt'
      };
      
      await expect(executor.executeStep(step, context)).rejects.toThrow('Адаптер не найден');
    });
  });

  describe('Выполнение шагов типа script', () => {
    it('должен успешно выполнять простой скрипт', async () => {
      const context = createTestContext();
      
      const step: WorkflowStep = {
        id: 'script-step-1',
        name: 'Test Script Step',
        type: 'script',
        script: 'echo Hello World',
        shell: process.platform === 'win32' ? 'cmd' : 'bash'
      };
      
      const result = await executor.executeStep(step, context);
      
      expect(result.status).toBe('success');
      expect(result.stepId).toBe('script-step-1');
      expect(result.outputs.stdout).toContain('Hello');
    });

    it('должен обрабатывать ошибки скрипта', async () => {
      const context = createTestContext();
      
      const step: WorkflowStep = {
        id: 'script-step-2',
        name: 'Failing Script Step',
        type: 'script',
        script: 'exit 1',
        shell: process.platform === 'win32' ? 'cmd' : 'bash'
      };
      
      await expect(executor.executeStep(step, context)).rejects.toThrow();
    });
  });

  describe('Условное выполнение', () => {
    it('должен выполнять шаг когда условие истинно', async () => {
      const context = createTestContext({ enable_feature: true });
      
      const step: WorkflowStep = {
        id: 'conditional-step-1',
        name: 'Conditional Step',
        type: 'model',
        condition: 'enable_feature',
        prompt_template: 'Test prompt'
      };
      
      const result = await executor.executeStep(step, context);
      
      expect(result.status).toBe('success');
    });

    it('должен пропускать шаг когда условие ложно', async () => {
      const context = createTestContext({ enable_feature: false });
      
      const step: WorkflowStep = {
        id: 'conditional-step-2',
        name: 'Conditional Step',
        type: 'model',
        condition: 'enable_feature',
        prompt_template: 'Test prompt'
      };
      
      const result = await executor.executeStep(step, context);
      
      expect(result.status).toBe('skipped');
    });
  });

  describe('Параллельное выполнение', () => {
    it('должен выполнять несколько шагов параллельно', async () => {
      const context = createTestContext();
      
      const steps: WorkflowStep[] = [
        {
          id: 'parallel-1',
          name: 'Parallel Step 1',
          type: 'model',
          prompt_template: 'Prompt 1'
        },
        {
          id: 'parallel-2',
          name: 'Parallel Step 2',
          type: 'model',
          prompt_template: 'Prompt 2'
        }
      ];
      
      const results = await executor.executeParallel(steps, context);
      
      expect(results.length).toBe(2);
      expect(results[0].status).toBe('success');
      expect(results[1].status).toBe('success');
    });

    it('должен собирать ошибки из всех параллельных шагов', async () => {
      const context = createTestContext();
      
      const steps: WorkflowStep[] = [
        {
          id: 'parallel-fail-1',
          name: 'Failing Step 1',
          type: 'model',
          adapter: 'non-existent',
          prompt_template: 'Prompt 1'
        },
        {
          id: 'parallel-fail-2',
          name: 'Failing Step 2',
          type: 'model',
          adapter: 'also-non-existent',
          prompt_template: 'Prompt 2'
        }
      ];
      
      await expect(executor.executeParallel(steps, context)).rejects.toThrow(/\d+ из \d+ параллельных шагов завершились с ошибкой/);
    });
  });

  describe('Повторы при ошибках', () => {
    it('должен повторять выполнение при временных ошибках', async () => {
      const context = createTestContext();
      let attemptCount = 0;
      
      // Создаем адаптер, который падает первые 2 раза
      const flakeyAdapter = new MockCLIAdapter('flakey-adapter', '1.0.0');
      const originalExecute = flakeyAdapter.execute.bind(flakeyAdapter);
      flakeyAdapter.execute = async (request) => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('timeout error');
        }
        return originalExecute(request);
      };
      
      context.adapters.register(flakeyAdapter);
      context.state.context.default_adapter = 'flakey-adapter';
      
      const step: WorkflowStep = {
        id: 'retry-step',
        name: 'Retry Step',
        type: 'model',
        prompt_template: 'Test prompt'
      };
      
      const result = await executor.executeWithRetry(step, context, 3);
      
      expect(result.status).toBe('success');
      expect(attemptCount).toBe(3);
    });

    it('должен выбрасывать ошибку после превышения лимита повторов', async () => {
      const context = createTestContext();
      
      // Создаем адаптер, который всегда падает
      const failingAdapter = new MockCLIAdapter('failing-adapter', '1.0.0');
      failingAdapter.execute = async () => {
        throw new Error('timeout error');
      };
      
      context.adapters.register(failingAdapter);
      context.state.context.default_adapter = 'failing-adapter';
      
      const step: WorkflowStep = {
        id: 'failing-step',
        name: 'Failing Step',
        type: 'model',
        prompt_template: 'Test prompt'
      };
      
      await expect(executor.executeWithRetry(step, context, 2)).rejects.toThrow('Превышено максимальное количество повторов');
    });
  });

  describe('Обработка неизвестных типов шагов', () => {
    it('должен выбрасывать ошибку для неизвестного типа шага', async () => {
      const context = createTestContext();
      
      const step: WorkflowStep = {
        id: 'unknown-step',
        name: 'Unknown Step',
        type: 'unknown-type' as any
      };
      
      await expect(executor.executeStep(step, context)).rejects.toThrow('Неизвестный тип шага');
    });
  });

  describe('Двойная передача контекста (содержимое + путь)', () => {
    it('должен создавать переменную с содержимым для model шага', async () => {
      const context = createTestContext();
      
      const step: WorkflowStep = {
        id: 'model-output-step',
        name: 'Model Output Step',
        type: 'model',
        prompt_template: 'Generate content',
        outputs: {
          test_output: 'test_output.txt'
        }
      };
      
      const result = await executor.executeStep(step, context);
      
      expect(result.status).toBe('success');
      // Проверяем, что переменная с содержимым создана
      expect(context.state.context.test_output).toBe('Test response from model');
    });

    it('должен создавать переменную с путем к файлу для model шага', async () => {
      const context = createTestContext();
      
      const step: WorkflowStep = {
        id: 'model-file-step',
        name: 'Model File Step',
        type: 'model',
        prompt_template: 'Generate content',
        outputs: {
          test_output: 'test_output.txt'
        }
      };
      
      const result = await executor.executeStep(step, context);
      
      expect(result.status).toBe('success');
      // Проверяем, что переменная с путем создана
      expect(context.state.context.test_output_file).toBeDefined();
      expect(typeof context.state.context.test_output_file).toBe('string');
      expect(context.state.context.test_output_file).toContain('test_output.txt');
    });

    it('должен одновременно создавать обе переменные (содержимое и путь) для model шага', async () => {
      const context = createTestContext();
      
      const step: WorkflowStep = {
        id: 'model-both-step',
        name: 'Model Both Step',
        type: 'model',
        prompt_template: 'Generate content',
        outputs: {
          result: 'result.txt'
        }
      };
      
      const result = await executor.executeStep(step, context);
      
      expect(result.status).toBe('success');
      
      // Проверяем наличие обеих переменных
      expect(context.state.context.result).toBe('Test response from model');
      expect(context.state.context.result_file).toBeDefined();
      expect(typeof context.state.context.result_file).toBe('string');
      
      // Проверяем, что обе переменные различны
      expect(context.state.context.result).not.toBe(context.state.context.result_file);
    });

    it('должен создавать переменную с содержимым для script шага', async () => {
      const context = createTestContext();
      
      const step: WorkflowStep = {
        id: 'script-output-step',
        name: 'Script Output Step',
        type: 'script',
        script: 'echo Test Script Output',
        shell: process.platform === 'win32' ? 'cmd' : 'bash',
        outputs: {
          script_result: 'script_result.txt'
        }
      };
      
      const result = await executor.executeStep(step, context);
      
      expect(result.status).toBe('success');
      // Проверяем, что переменная с содержимым создана
      expect(context.state.context.script_result).toBeDefined();
      expect(context.state.context.script_result).toContain('Test Script Output');
    });

    it('должен создавать переменную с путем к файлу для script шага', async () => {
      const context = createTestContext();
      
      const step: WorkflowStep = {
        id: 'script-file-step',
        name: 'Script File Step',
        type: 'script',
        script: 'echo Test Script Output',
        shell: process.platform === 'win32' ? 'cmd' : 'bash',
        outputs: {
          script_result: 'script_result.txt'
        }
      };
      
      const result = await executor.executeStep(step, context);
      
      expect(result.status).toBe('success');
      // Проверяем, что переменная с путем создана
      expect(context.state.context.script_result_file).toBeDefined();
      expect(typeof context.state.context.script_result_file).toBe('string');
      expect(context.state.context.script_result_file).toContain('script_result.txt');
    });

    it('должен одновременно создавать обе переменные (содержимое и путь) для script шага', async () => {
      const context = createTestContext();
      
      const step: WorkflowStep = {
        id: 'script-both-step',
        name: 'Script Both Step',
        type: 'script',
        script: 'echo Script Output',
        shell: process.platform === 'win32' ? 'cmd' : 'bash',
        outputs: {
          output: 'output.txt'
        }
      };
      
      const result = await executor.executeStep(step, context);
      
      expect(result.status).toBe('success');
      
      // Проверяем наличие обеих переменных
      expect(context.state.context.output).toBeDefined();
      expect(context.state.context.output_file).toBeDefined();
      expect(typeof context.state.context.output_file).toBe('string');
      
      // Проверяем, что обе переменные различны
      expect(context.state.context.output).not.toBe(context.state.context.output_file);
    });

    it('должен создавать обе переменные для множественных outputs', async () => {
      const context = createTestContext();
      
      const step: WorkflowStep = {
        id: 'multi-output-step',
        name: 'Multi Output Step',
        type: 'model',
        prompt_template: 'Generate content',
        outputs: {
          output1: 'output1.txt',
          output2: 'output2.txt'
        }
      };
      
      const result = await executor.executeStep(step, context);
      
      expect(result.status).toBe('success');
      
      // Проверяем, что для каждого output созданы обе переменные
      expect(context.state.context.output1).toBe('Test response from model');
      expect(context.state.context.output1_file).toBeDefined();
      expect(context.state.context.output2).toBe('Test response from model');
      expect(context.state.context.output2_file).toBeDefined();
    });
  });
});
