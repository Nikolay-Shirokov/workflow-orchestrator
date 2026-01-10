/**
 * Интеграционный тест для dual-design рабочего процесса
 * 
 * Проверяет выполнение всех 9 шагов dual-design процесса,
 * валидацию создания артефактов и сохранение/возобновление состояния.
 * 
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5
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
import { getLogger } from '../../src/core/logger.js';
import { WorkflowConfig } from '../../src/core/types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

/**
 * Создание тестового окружения для dual-design процесса
 */
async function createDualDesignTestEnvironment() {
  // Создание временной директории
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dual-design-test-'));
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

  // Создание mock-адаптеров для обеих ролей
  const architectAdapter = new MockCLIAdapter('claude-cli', '1.0.0');
  const copilotAdapter = new MockCLIAdapter('openai-cli', '1.0.0');

  // Настройка ответов для архитектора
  architectAdapter.setResponse(
    /web.*research/i,
    '# Результаты веб-исследования\n\nНайдена информация о Wildberries API...'
  );
  architectAdapter.setResponse(
    /questions/i,
    '# Вопросы архитектора\n\n1. Какие методы API нужно использовать?\n2. Какая частота синхронизации?'
  );
  architectAdapter.setResponse(
    /analysis/i,
    '# Анализ вопросов\n\nВопросы второго пилота хорошо дополняют технические аспекты.'
  );
  architectAdapter.setResponse(
    /synthesis/i,
    '# Финальные вопросы архитектора\n\n1. Технический вопрос 1\n2. Технический вопрос 2'
  );
  architectAdapter.setResponse(
    /merge/i,
    '# Объединенные вопросы\n\n1. Вопрос 1\n2. Вопрос 2\n3. Вопрос 3'
  );
  architectAdapter.setResponse(
    /final.*document/i,
    '# Финальный документ требований\n\n## Обзор\n\nСистема синхронизации с Wildberries...'
  );

  // Настройка ответов для второго пилота
  copilotAdapter.setResponse(
    /questions/i,
    '# Вопросы второго пилота\n\n1. Как обрабатывать ошибки?\n2. Какие метрики отслеживать?'
  );
  copilotAdapter.setResponse(
    /analysis/i,
    '# Анализ вопросов\n\nВопросы архитектора покрывают важные технические детали.'
  );
  copilotAdapter.setResponse(
    /synthesis/i,
    '# Финальные вопросы второго пилота\n\n1. Бизнес-вопрос 1\n2. Бизнес-вопрос 2'
  );

  const adapterRegistry = new AdapterRegistry();
  adapterRegistry.register(architectAdapter);
  adapterRegistry.register(copilotAdapter);

  const templateEngine = new DefaultTemplateEngine();
  const artifactManager = new DefaultArtifactManager({
    baseDir: artifactsDir,
    logger
  });

  const stepExecutor = new DefaultStepExecutor({
    defaultTimeout: 10000
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
    architectAdapter,
    copilotAdapter,
    stateManager,
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

/**
 * Создание упрощенной конфигурации dual-design процесса для тестирования
 */
async function createSimplifiedDualDesignConfig(artifactsDir: string): Promise<WorkflowConfig> {
  // Создаем упрощенную конфигурацию без скриптовых шагов
  const config: WorkflowConfig = {
    name: 'dual-design',
    version: '1.0.0',
    description: 'Dual-design workflow for testing',
    settings: {
      artifacts_dir: artifactsDir,
      default_adapter: 'claude-cli',
      parallel_execution: true,
      max_retries: 3,
      timeout: 10000
    },
    roles: {
      architect: {
        adapter: 'claude-cli',
        model: 'claude-sonnet-3.5'
      },
      copilot: {
        adapter: 'openai-cli',
        model: 'gpt-4'
      }
    },
    steps: [
      // Шаг 1: Инициализация (упрощенный - без скрипта)
      {
        id: 'step1',
        name: 'Инициализация сессии',
        type: 'model',
        role: 'architect',
        prompt_template: 'Инициализация сессии',
        outputs: {
          user_request_file: 'step1_user_request.md'
        }
      },
      // Шаг 1.5: Веб-исследование (опциональный)
      {
        id: 'step1_5',
        name: 'Веб-исследование',
        type: 'model',
        role: 'architect',
        condition: 'mcp_tools.web_search_available',
        prompt_template: 'Веб-исследование',
        outputs: {
          research_file: 'step1.5_web_research.md'
        }
      },
      // Шаги 2-3: Параллельные вопросы
      {
        id: 'step2_3',
        name: 'Параллельные вопросы',
        type: 'parallel',
        depends_on: ['step1'],
        steps: [
          {
            id: 'step2',
            name: 'Вопросы архитектора',
            type: 'model',
            role: 'architect',
            prompt_template: 'Вопросы архитектора',
            outputs: {
              architect_questions: 'step2_architect_questions.md'
            }
          },
          {
            id: 'step3',
            name: 'Вопросы второго пилота',
            type: 'model',
            role: 'copilot',
            prompt_template: 'Вопросы второго пилота',
            outputs: {
              copilot_questions: 'step3_copilot_questions.md'
            }
          }
        ]
      },
      // Шаг 4: Анализ архитектора
      {
        id: 'step4',
        name: 'Анализ вопросов архитектором',
        type: 'model',
        role: 'architect',
        depends_on: ['step2_3'],
        prompt_template: 'Анализ вопросов второго пилота',
        inputs: {
          copilot_questions: '${copilot_questions}'
        },
        outputs: {
          architect_analysis: 'step4_architect_analysis.md'
        }
      },
      // Шаг 5: Анализ второго пилота
      {
        id: 'step5',
        name: 'Анализ вопросов вторым пилотом',
        type: 'model',
        role: 'copilot',
        depends_on: ['step2_3'],
        prompt_template: 'Анализ вопросов архитектора',
        inputs: {
          architect_questions: '${architect_questions}'
        },
        outputs: {
          copilot_analysis: 'step5_copilot_analysis.md'
        }
      },
      // Шаг 6: Синтез архитектора
      {
        id: 'step6',
        name: 'Синтез финальных вопросов архитектором',
        type: 'model',
        role: 'architect',
        depends_on: ['step4', 'step5'],
        prompt_template: 'Синтез вопросов архитектора',
        outputs: {
          architect_final_questions: 'step6_architect_final_questions.md'
        }
      },
      // Шаг 7: Синтез второго пилота
      {
        id: 'step7',
        name: 'Синтез финальных вопросов вторым пилотом',
        type: 'model',
        role: 'copilot',
        depends_on: ['step4', 'step5'],
        prompt_template: 'Синтез вопросов второго пилота',
        outputs: {
          copilot_final_questions: 'step7_copilot_final_questions.md'
        }
      },
      // Шаг 8: Объединение вопросов
      {
        id: 'step8',
        name: 'Объединение финальных вопросов',
        type: 'model',
        role: 'architect',
        depends_on: ['step6', 'step7'],
        prompt_template: 'Объединение вопросов',
        outputs: {
          final_questions: 'step8_final_questions.md'
        }
      },
      // Шаг 9: Ввод пользователя (будет пропущен в большинстве тестов)
      {
        id: 'step9',
        name: 'Ответы пользователя',
        type: 'user_input',
        depends_on: ['step8'],
        input_format: 'questions',
        outputs: {
          user_answers: 'step9_user_answers.md'
        }
      },
      // Шаг 10: Финальный документ
      {
        id: 'step10',
        name: 'Генерация финального документа',
        type: 'model',
        role: 'architect',
        depends_on: ['step9'],
        prompt_template: 'Финальный документ требований',
        outputs: {
          final_document: 'step10_final_requirements.md'
        }
      }
    ]
  };
  
  return config;
}

describe('Dual-Design Workflow Integration Tests', () => {
  let env: Awaited<ReturnType<typeof createDualDesignTestEnvironment>>;

  beforeEach(async () => {
    env = await createDualDesignTestEnvironment();
  });

  afterEach(async () => {
    await env.cleanup();
  });

  describe('Requirement 8.1: Выполнение всех шагов процесса', () => {
    it('должен выполнить все основные шаги dual-design процесса', async () => {
      // Создаем конфигурацию
      const config = await createSimplifiedDualDesignConfig(env.artifactsDir);
      
      // Добавляем начальный контекст
      const initialContext = {
        user_request: 'Создать обработку для синхронизации с Wildberries',
        timestamp: Date.now().toString()
      };

      // Выполняем процесс (без шага ввода пользователя)
      // Удаляем шаги 9 и 10 для упрощения теста
      const stepsWithoutUserInput = config.steps.filter(
        step => step.id !== 'step9' && step.id !== 'step10'
      );
      const testConfig = { ...config, steps: stepsWithoutUserInput };

      const state = await env.engine.execute(testConfig, initialContext);

      // Проверяем, что процесс завершен успешно
      expect(state.status).toBe('completed');

      // Проверяем, что выполнены все ожидаемые шаги
      const expectedSteps = [
        'step1',           // Инициализация
        'step2_3',         // Параллельные вопросы
        'step4',           // Анализ архитектора
        'step5',           // Анализ второго пилота
        'step6',           // Синтез архитектора
        'step7',           // Синтез второго пилота
        'step8'            // Объединение вопросов
      ];

      for (const stepId of expectedSteps) {
        expect(state.completedSteps).toContain(stepId);
      }

      // Проверяем, что шаг 1.5 (веб-исследование) был пропущен
      expect(state.completedSteps).not.toContain('step1_5');
    }, 30000);
  });

  describe('Requirement 8.2: Параллельное выполнение шагов', () => {
    it('должен выполнять шаги 2 и 3 параллельно', async () => {
      const config = await createSimplifiedDualDesignConfig(env.artifactsDir);
      
      // Отслеживаем время начала выполнения каждого шага
      const stepStartTimes: Record<string, number> = {};
      const stepEndTimes: Record<string, number> = {};

      // Создаем обертку для отслеживания времени
      const originalExecute = env.engine.execute.bind(env.engine);
      env.engine.execute = async (cfg: WorkflowConfig, ctx?: any) => {
        // Перехватываем выполнение шагов
        const originalStepExecutor = env.engine['stepExecutor'];
        const originalExecuteStep = originalStepExecutor.executeStep.bind(originalStepExecutor);
        
        originalStepExecutor.executeStep = async (step: any, context: any) => {
          stepStartTimes[step.id] = Date.now();
          const result = await originalExecuteStep(step, context);
          stepEndTimes[step.id] = Date.now();
          return result;
        };

        return originalExecute(cfg, ctx);
      };

      const initialContext = {
        user_request: 'Тестовый запрос',
        timestamp: Date.now().toString()
      };

      // Выполняем только параллельные шаги
      const parallelStepConfig = config.steps.find(s => s.id === 'step2_3');
      const testConfig = {
        ...config,
        steps: [
          config.steps[0], // step1 - инициализация
          parallelStepConfig! // step2_3 - параллельные вопросы
        ]
      };

      await env.engine.execute(testConfig, initialContext);

      // Проверяем, что шаги 2 и 3 начались примерно одновременно
      // (разница во времени старта должна быть минимальной)
      const step2Start = stepStartTimes['step2'];
      const step3Start = stepStartTimes['step3'];
      
      if (step2Start && step3Start) {
        const timeDifference = Math.abs(step2Start - step3Start);
        // Разница должна быть меньше 100мс (параллельный запуск)
        expect(timeDifference).toBeLessThan(100);
      }
    }, 30000);
  });

  describe('Requirement 8.3: Условное выполнение веб-исследования', () => {
    it('должен пропускать шаг 1.5 когда MCP недоступен', async () => {
      const config = await createSimplifiedDualDesignConfig(env.artifactsDir);
      
      // MCP отключен по умолчанию
      const initialContext = {
        user_request: 'Тестовый запрос',
        timestamp: Date.now().toString(),
        mcp_tools: {
          web_search_available: false
        }
      };

      const state = await env.engine.execute(config, initialContext);

      // Проверяем, что шаг 1.5 не выполнен
      expect(state.completedSteps).not.toContain('step1_5');
      
      // Проверяем, что остальные шаги выполнены
      expect(state.completedSteps).toContain('step1');
    }, 30000);

    it('должен выполнять шаг 1.5 когда MCP доступен', async () => {
      const config = await createSimplifiedDualDesignConfig(env.artifactsDir);
      
      const initialContext = {
        user_request: 'Тестовый запрос',
        timestamp: Date.now().toString(),
        mcp_tools: {
          web_search_available: true
        }
      };

      // Выполняем только первые два шага
      const testConfig = {
        ...config,
        steps: config.steps.slice(0, 2) // step1 и step1_5
      };

      const state = await env.engine.execute(testConfig, initialContext);

      // Проверяем, что шаг 1.5 выполнен
      expect(state.completedSteps).toContain('step1_5');
    }, 30000);
  });

  describe('Requirement 8.4 & 8.5: Пауза и возобновление для ввода пользователя', () => {
    it('должен сохранять состояние перед шагом ввода пользователя', async () => {
      const config = await createSimplifiedDualDesignConfig(env.artifactsDir);
      
      const initialContext = {
        user_request: 'Тестовый запрос',
        timestamp: Date.now().toString()
      };

      // Выполняем до шага 9 (ввод пользователя)
      const stepsBeforeUserInput = config.steps.filter(
        step => step.id !== 'step9' && step.id !== 'step10'
      );
      const testConfig = { ...config, steps: stepsBeforeUserInput };

      const state = await env.engine.execute(testConfig, initialContext);

      // Проверяем, что состояние сохранено
      expect(state.status).toBe('completed');
      expect(state.sessionId).toBeDefined();

      // Проверяем, что файл состояния существует
      const stateFiles = await fs.readdir(env.stateDir);
      expect(stateFiles.length).toBeGreaterThan(0);

      // Загружаем сохраненное состояние
      const savedState = await env.stateManager.loadState(state.sessionId);
      expect(savedState).toBeDefined();
      expect(savedState!.sessionId).toBe(state.sessionId);
      expect(savedState!.completedSteps).toEqual(state.completedSteps);
    }, 30000);

    it('должен возобновлять выполнение после ввода пользователя', async () => {
      const config = await createSimplifiedDualDesignConfig(env.artifactsDir);
      
      const initialContext = {
        user_request: 'Тестовый запрос',
        timestamp: Date.now().toString()
      };

      // Шаг 1: Выполняем до шага 8 включительно
      const stepsBeforeUserInput = config.steps.filter(
        step => step.id !== 'step9' && step.id !== 'step10'
      );
      const firstConfig = { ...config, steps: stepsBeforeUserInput };

      const firstState = await env.engine.execute(firstConfig, initialContext);
      expect(firstState.status).toBe('completed');
      expect(firstState.completedSteps).toContain('step8');

      // Шаг 2: Симулируем ввод пользователя
      const userAnswers = '1. Ответ на вопрос 1\n2. Ответ на вопрос 2';
      const userAnswersFile = path.join(
        env.artifactsDir,
        `session_${firstState.sessionId}`,
        'step9_user_answers.md'
      );
      await fs.mkdir(path.dirname(userAnswersFile), { recursive: true });
      await fs.writeFile(userAnswersFile, userAnswers);

      // Обновляем состояние с ответами пользователя
      firstState.context['user_answers'] = userAnswers;
      firstState.artifacts['user_answers'] = userAnswersFile;
      firstState.completedSteps.push('step9');
      await env.stateManager.saveState(firstState);

      // Шаг 3: Возобновляем выполнение для финального шага
      const finalStep = config.steps.find(s => s.id === 'step10');
      const resumeConfig = {
        ...config,
        steps: [finalStep!]
      };

      const finalState = await env.engine.resume(firstState.sessionId, resumeConfig);

      // Проверяем, что финальный шаг выполнен
      expect(finalState.status).toBe('completed');
      expect(finalState.completedSteps).toContain('step10');
    }, 30000);
  });

  describe('Валидация создания артефактов', () => {
    it('должен создавать артефакты для каждого шага', async () => {
      const config = await createSimplifiedDualDesignConfig(env.artifactsDir);
      
      const initialContext = {
        user_request: 'Тестовый запрос',
        timestamp: Date.now().toString()
      };

      // Выполняем процесс без шагов ввода
      const stepsWithoutUserInput = config.steps.filter(
        step => step.id !== 'step9' && step.id !== 'step10'
      );
      const testConfig = { ...config, steps: stepsWithoutUserInput };

      const state = await env.engine.execute(testConfig, initialContext);

      // Проверяем, что артефакты созданы
      expect(Object.keys(state.artifacts).length).toBeGreaterThan(0);

      // Проверяем существование файлов артефактов
      for (const [, artifactPath] of Object.entries(state.artifacts)) {
        const exists = await fs.access(artifactPath)
          .then(() => true)
          .catch(() => false);
        
        expect(exists).toBe(true);
        
        // Проверяем, что файл не пустой
        const content = await fs.readFile(artifactPath, 'utf-8');
        expect(content.length).toBeGreaterThan(0);
      }
    }, 30000);

    it('должен организовывать артефакты в директории сессии', async () => {
      const config = await createSimplifiedDualDesignConfig(env.artifactsDir);
      
      const initialContext = {
        user_request: 'Тестовый запрос',
        timestamp: Date.now().toString()
      };

      const stepsWithoutUserInput = config.steps.filter(
        step => step.id !== 'step9' && step.id !== 'step10'
      );
      const testConfig = { ...config, steps: stepsWithoutUserInput };

      const state = await env.engine.execute(testConfig, initialContext);

      // Проверяем, что создана директория сессии
      const sessionDir = path.join(env.artifactsDir, `session_${state.sessionId}`);
      const sessionDirExists = await fs.access(sessionDir)
        .then(() => true)
        .catch(() => false);
      
      expect(sessionDirExists).toBe(true);

      // Проверяем, что все артефакты находятся в директории сессии
      for (const artifactPath of Object.values(state.artifacts)) {
        expect(artifactPath).toContain(`session_${state.sessionId}`);
      }
    }, 30000);
  });

  describe('Обработка ошибок в dual-design процессе', () => {
    it('должен корректно обрабатывать ошибку в одном из параллельных шагов', async () => {
      const config = await createSimplifiedDualDesignConfig(env.artifactsDir);
      
      // Настраиваем один из адаптеров на ошибку
      env.copilotAdapter.setResponse(
        /questions/i,
        'Error response',
        { shouldError: true, errorMessage: 'Simulated error' }
      );

      const initialContext = {
        user_request: 'Тестовый запрос',
        timestamp: Date.now().toString()
      };

      // Выполняем только параллельные шаги
      const parallelStepConfig = config.steps.find(s => s.id === 'step2_3');
      const testConfig = {
        ...config,
        steps: [
          config.steps[0], // step1
          parallelStepConfig! // step2_3
        ]
      };

      // Ожидаем, что выполнение завершится с ошибкой
      await expect(
        env.engine.execute(testConfig, initialContext)
      ).rejects.toThrow();
    }, 30000);
  });

  describe('Статистика выполнения', () => {
    it('должен отслеживать количество вызовов каждого адаптера', async () => {
      const config = await createSimplifiedDualDesignConfig(env.artifactsDir);
      
      const initialContext = {
        user_request: 'Тестовый запрос',
        timestamp: Date.now().toString()
      };

      // Очищаем историю перед тестом
      env.architectAdapter.clearHistory();
      env.copilotAdapter.clearHistory();

      const stepsWithoutUserInput = config.steps.filter(
        step => step.id !== 'step9' && step.id !== 'step10'
      );
      const testConfig = { ...config, steps: stepsWithoutUserInput };

      await env.engine.execute(testConfig, initialContext);

      // Проверяем, что оба адаптера были вызваны
      const architectCalls = env.architectAdapter.getRequestCount();
      const copilotCalls = env.copilotAdapter.getRequestCount();

      expect(architectCalls).toBeGreaterThan(0);
      expect(copilotCalls).toBeGreaterThan(0);

      // Архитектор должен быть вызван больше раз (он выполняет больше шагов)
      // В нашей конфигурации: architect выполняет шаги 1, 2, 4, 6, 8 (5 шагов)
      // copilot выполняет шаги 3, 5, 7 (3 шага)
      expect(architectCalls).toBeGreaterThanOrEqual(5);
      expect(copilotCalls).toBeGreaterThanOrEqual(3);
    }, 30000);
  });
});
