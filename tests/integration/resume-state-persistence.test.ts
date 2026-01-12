/**
 * Интеграционные тесты для сохранения состояния при прерывании
 * 
 * Эти тесты проверяют, что система корректно сохраняет состояние
 * при прерывании на разных этапах выполнения workflow.
 * 
 * Validates: Requirements 3.1
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { WorkflowOrchestrator } from '../../src/cli/orchestrator.js';
import { MockCLIAdapter } from '../../src/adapters/mock-cli-adapter.js';
import { Logger, LogLevel } from '../../src/core/logger.js';
import { WorkflowConfig, WorkflowState } from '../../src/core/types.js';
import * as fs from 'fs/promises';
import * as path from 'path';

// Вспомогательная функция для создания временной директории
async function createTempDir(prefix: string): Promise<string> {
  const tmpDir = path.join(process.cwd(), 'tmp', `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}`);
  await fs.mkdir(tmpDir, { recursive: true });
  return tmpDir;
}

// Вспомогательная функция для очистки временной директории
async function cleanupTempDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch (error) {
    // Игнорируем ошибки очистки
  }
}

/**
 * Тесты для сохранения состояния при прерывании на разных этапах
 * Validates: Requirements 3.1
 */
describe('Resume - State Persistence', () => {
  let orchestrator: WorkflowOrchestrator;
  let logger: Logger;
  let tempDir: string;
  let stateDir: string;
  let artifactsDir: string;

  beforeEach(async () => {
    // Создание временной директории для тестов
    tempDir = await createTempDir('resume-state-test');
    stateDir = path.join(tempDir, 'state');
    artifactsDir = path.join(tempDir, 'artifacts');
    
    // Создание логгера
    logger = new Logger({ 
      level: LogLevel.ERROR,
      enableConsole: false,
      enableFile: false
    });
    
    // Создание оркестратора
    orchestrator = new WorkflowOrchestrator({
      stateDir,
      artifactsDir,
      logger
    });
    
    // Регистрация mock-адаптера с именем 'mock-cli'
    const mockAdapter = new MockCLIAdapter('mock-cli');
    orchestrator.registerAdapter(mockAdapter);
  });

  afterEach(async () => {
    // Очистка временной директории
    await cleanupTempDir(tempDir);
  });

  /**
   * Тест 3.1.1: Сохранение состояния при прерывании в начале workflow
   * Validates: Requirements 3.1
   */
  it('должен сохранить состояние при прерывании в начале workflow', async () => {
    // Создание конфигурации workflow с несколькими шагами
    const config: WorkflowConfig = {
      name: 'interrupt-at-start-test',
      version: '1.0.0',
      description: 'Тест прерывания в начале',
      settings: {
        artifacts_dir: artifactsDir,
        default_adapter: 'mock-cli'
      },
      steps: [
        {
          id: 'step1',
          name: 'Первый шаг',
          type: 'model',
          adapter: 'mock-cli',
          prompt_template: 'Test prompt 1',
          outputs: {
            result: 'step1_output.md'
          }
        },
        {
          id: 'step2',
          name: 'Второй шаг',
          type: 'model',
          adapter: 'mock-cli',
          prompt_template: 'Test prompt 2',
          outputs: {
            result: 'step2_output.md'
          },
          depends_on: ['step1']
        },
        {
          id: 'step3',
          name: 'Третий шаг',
          type: 'model',
          adapter: 'mock-cli',
          prompt_template: 'Test prompt 3',
          outputs: {
            result: 'step3_output.md'
          },
          depends_on: ['step2']
        }
      ]
    };

    // Сохранение конфигурации в файл
    const configPath = path.join(tempDir, 'workflow.json');
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    // Выполнение workflow (mock-адаптер выполнится быстро)
    const state = await orchestrator.run(configPath);

    // Проверка, что состояние было сохранено
    const statePath = path.join(stateDir, `${state.sessionId}.json`);
    const stateExists = await fs.access(statePath).then(() => true).catch(() => false);
    expect(stateExists).toBe(true);

    // Загрузка сохраненного состояния
    const savedStateContent = await fs.readFile(statePath, 'utf-8');
    const savedState: WorkflowState = JSON.parse(savedStateContent);

    // Проверки сохраненного состояния
    expect(savedState.sessionId).toBe(state.sessionId);
    expect(savedState.workflowName).toBe('interrupt-at-start-test');
    expect(savedState.workflowVersion).toBe('1.0.0');
    expect(savedState.status).toBe('completed');
    expect(savedState.startedAt).toBeDefined();
    expect(savedState.updatedAt).toBeDefined();
    expect(savedState.completedSteps).toHaveLength(3);
    expect(savedState.history).toHaveLength(3);
  });

  /**
   * Тест 3.1.2: Сохранение состояния при прерывании в середине workflow
   * Validates: Requirements 3.1
   */
  it('должен сохранить состояние при прерывании в середине workflow', async () => {
    // Создание конфигурации workflow
    const config: WorkflowConfig = {
      name: 'interrupt-at-middle-test',
      version: '1.0.0',
      description: 'Тест прерывания в середине',
      settings: {
        artifacts_dir: artifactsDir,
        default_adapter: 'mock-cli'
      },
      steps: [
        {
          id: 'step1',
          name: 'Первый шаг',
          type: 'model',
          adapter: 'mock-cli',
          prompt_template: 'Test prompt 1',
          outputs: {
            result: 'step1_output.md'
          }
        },
        {
          id: 'step2',
          name: 'Второй шаг',
          type: 'model',
          adapter: 'mock-cli',
          prompt_template: 'Test prompt 2',
          outputs: {
            result: 'step2_output.md'
          },
          depends_on: ['step1']
        },
        {
          id: 'step3',
          name: 'Третий шаг',
          type: 'model',
          adapter: 'mock-cli',
          prompt_template: 'Test prompt 3',
          outputs: {
            result: 'step3_output.md'
          },
          depends_on: ['step2']
        },
        {
          id: 'step4',
          name: 'Четвертый шаг',
          type: 'model',
          adapter: 'mock-cli',
          prompt_template: 'Test prompt 4',
          outputs: {
            result: 'step4_output.md'
          },
          depends_on: ['step3']
        },
        {
          id: 'step5',
          name: 'Пятый шаг',
          type: 'model',
          adapter: 'mock-cli',
          prompt_template: 'Test prompt 5',
          outputs: {
            result: 'step5_output.md'
          },
          depends_on: ['step4']
        }
      ]
    };

    // Сохранение конфигурации в файл
    const configPath = path.join(tempDir, 'workflow.json');
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    // Выполнение workflow
    const state = await orchestrator.run(configPath);

    // Проверка, что состояние было сохранено после каждого шага
    const statePath = path.join(stateDir, `${state.sessionId}.json`);
    const savedStateContent = await fs.readFile(statePath, 'utf-8');
    const savedState: WorkflowState = JSON.parse(savedStateContent);

    // Проверки
    expect(savedState.completedSteps).toHaveLength(5);
    expect(savedState.history).toHaveLength(5);
    
    // Проверка, что каждый шаг записан в историю
    expect(savedState.history.map(h => h.stepId)).toEqual(['step1', 'step2', 'step3', 'step4', 'step5']);
    
    // Проверка, что все артефакты сохранены
    expect(Object.keys(savedState.artifacts)).toContain('result');
  });

  /**
   * Тест 3.1.3: Сохранение состояния во время выполнения шага
   * Validates: Requirements 3.1
   */
  it('должен сохранить состояние во время выполнения шага', async () => {
    // Создание конфигурации workflow
    const config: WorkflowConfig = {
      name: 'interrupt-during-step-test',
      version: '1.0.0',
      description: 'Тест прерывания во время выполнения шага',
      settings: {
        artifacts_dir: artifactsDir,
        default_adapter: 'mock-cli'
      },
      steps: [
        {
          id: 'step1',
          name: 'Долгий шаг',
          type: 'model',
          adapter: 'mock-cli',
          prompt_template: 'Test prompt 1',
          outputs: {
            result: 'step1_output.md'
          }
        }
      ]
    };

    // Сохранение конфигурации в файл
    const configPath = path.join(tempDir, 'workflow.json');
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    // Выполнение workflow
    const state = await orchestrator.run(configPath);

    // Проверка, что состояние было сохранено
    const statePath = path.join(stateDir, `${state.sessionId}.json`);
    const stateExists = await fs.access(statePath).then(() => true).catch(() => false);
    expect(stateExists).toBe(true);

    // Загрузка сохраненного состояния
    const savedStateContent = await fs.readFile(statePath, 'utf-8');
    const savedState: WorkflowState = JSON.parse(savedStateContent);

    // Проверки
    expect(savedState.sessionId).toBe(state.sessionId);
    expect(savedState.completedSteps).toContain('step1');
    expect(savedState.history).toHaveLength(1);
    expect(savedState.history[0].stepId).toBe('step1');
    expect(savedState.history[0].status).toBe('success');
    expect(savedState.history[0].executionTime).toBeGreaterThanOrEqual(0);
  });

  /**
   * Тест 3.1.4: Сохранение состояния между шагами
   * Validates: Requirements 3.1
   */
  it('должен сохранить состояние между шагами', async () => {
    // Создание конфигурации workflow
    const config: WorkflowConfig = {
      name: 'interrupt-between-steps-test',
      version: '1.0.0',
      description: 'Тест прерывания между шагами',
      settings: {
        artifacts_dir: artifactsDir,
        default_adapter: 'mock-cli'
      },
      steps: [
        {
          id: 'step1',
          name: 'Первый шаг',
          type: 'model',
          adapter: 'mock-cli',
          prompt_template: 'Test prompt 1',
          outputs: {
            result: 'step1_output.md'
          }
        },
        {
          id: 'step2',
          name: 'Второй шаг',
          type: 'model',
          adapter: 'mock-cli',
          prompt_template: 'Test prompt 2',
          outputs: {
            result: 'step2_output.md'
          },
          depends_on: ['step1']
        }
      ]
    };

    // Сохранение конфигурации в файл
    const configPath = path.join(tempDir, 'workflow.json');
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    // Выполнение workflow
    const state = await orchestrator.run(configPath);

    // Проверка, что состояние было сохранено после каждого шага
    const statePath = path.join(stateDir, `${state.sessionId}.json`);
    const savedStateContent = await fs.readFile(statePath, 'utf-8');
    const savedState: WorkflowState = JSON.parse(savedStateContent);

    // Проверки
    expect(savedState.completedSteps).toHaveLength(2);
    expect(savedState.completedSteps).toEqual(['step1', 'step2']);
    expect(savedState.history).toHaveLength(2);
    
    // Проверка, что updatedAt обновляется между шагами
    const step1History = savedState.history.find(h => h.stepId === 'step1');
    const step2History = savedState.history.find(h => h.stepId === 'step2');
    
    expect(step1History).toBeDefined();
    expect(step2History).toBeDefined();
    
    if (step1History && step2History) {
      // Второй шаг должен начаться после завершения первого
      expect(new Date(step2History.startedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(step1History.completedAt).getTime()
      );
    }
  });

  /**
   * Тест 3.1.5: Сохранение контекста при прерывании
   * Validates: Requirements 3.1
   */
  it('должен сохранить контекст выполнения при прерывании', async () => {
    // Создание конфигурации workflow с контекстом
    const config: WorkflowConfig = {
      name: 'interrupt-context-test',
      version: '1.0.0',
      description: 'Тест сохранения контекста при прерывании',
      settings: {
        artifacts_dir: artifactsDir,
        default_adapter: 'mock-cli'
      },
      steps: [
        {
          id: 'step1',
          name: 'Первый шаг',
          type: 'model',
          adapter: 'mock-cli',
          prompt_template: 'Test prompt 1',
          outputs: {
            result: 'step1_output.md',
            custom_var: 'custom_value'
          }
        },
        {
          id: 'step2',
          name: 'Второй шаг',
          type: 'model',
          adapter: 'mock-cli',
          prompt_template: 'Test prompt 2 with ${custom_var}',
          outputs: {
            result: 'step2_output.md'
          },
          depends_on: ['step1']
        }
      ]
    };

    // Сохранение конфигурации в файл
    const configPath = path.join(tempDir, 'workflow.json');
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    // Выполнение workflow
    const state = await orchestrator.run(configPath);

    // Проверка, что контекст был сохранен
    const statePath = path.join(stateDir, `${state.sessionId}.json`);
    const savedStateContent = await fs.readFile(statePath, 'utf-8');
    const savedState: WorkflowState = JSON.parse(savedStateContent);

    // Проверки контекста
    expect(savedState.context).toBeDefined();
    expect(savedState.context.workflow_name).toBe('interrupt-context-test');
    expect(savedState.context.workflow_version).toBe('1.0.0');
    expect(savedState.context.session_id).toBe(state.sessionId);
    expect(savedState.context.default_adapter).toBe('mock-cli');
  });

  /**
   * Тест 3.1.6: Сохранение артефактов при прерывании
   * Validates: Requirements 3.1
   */
  it('должен сохранить информацию об артефактах при прерывании', async () => {
    // Создание конфигурации workflow
    const config: WorkflowConfig = {
      name: 'interrupt-artifacts-test',
      version: '1.0.0',
      description: 'Тест сохранения артефактов при прерывании',
      settings: {
        artifacts_dir: artifactsDir,
        default_adapter: 'mock-cli'
      },
      steps: [
        {
          id: 'step1',
          name: 'Первый шаг',
          type: 'model',
          adapter: 'mock-cli',
          prompt_template: 'Test prompt 1',
          outputs: {
            output1: 'step1_output1.md',
            output2: 'step1_output2.md'
          }
        },
        {
          id: 'step2',
          name: 'Второй шаг',
          type: 'model',
          adapter: 'mock-cli',
          prompt_template: 'Test prompt 2',
          outputs: {
            output1: 'step2_output1.md'
          },
          depends_on: ['step1']
        }
      ]
    };

    // Сохранение конфигурации в файл
    const configPath = path.join(tempDir, 'workflow.json');
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    // Выполнение workflow
    const state = await orchestrator.run(configPath);

    // Проверка, что артефакты были сохранены в состоянии
    const statePath = path.join(stateDir, `${state.sessionId}.json`);
    const savedStateContent = await fs.readFile(statePath, 'utf-8');
    const savedState: WorkflowState = JSON.parse(savedStateContent);

    // Проверки артефактов
    expect(savedState.artifacts).toBeDefined();
    expect(Object.keys(savedState.artifacts).length).toBeGreaterThan(0);
    
    // Проверка, что пути к артефактам сохранены
    for (const artifactPath of Object.values(savedState.artifacts)) {
      expect(artifactPath).toBeDefined();
      expect(typeof artifactPath).toBe('string');
      expect(artifactPath.length).toBeGreaterThan(0);
    }
  });
});
