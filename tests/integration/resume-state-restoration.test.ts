/**
 * Интеграционные тесты для восстановления состояния при resume
 * 
 * Эти тесты проверяют, что система корректно восстанавливает состояние
 * из файла и продолжает выполнение с последнего успешного шага.
 * 
 * Validates: Requirements 3.2, 3.3
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { WorkflowOrchestrator } from '../../src/cli/orchestrator.js';
import { MockCLIAdapter } from '../../src/adapters/mock-cli-adapter.js';
import { Logger, LogLevel } from '../../src/core/logger.js';
import { WorkflowConfig } from '../../src/core/types.js';
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
 * Тесты для восстановления состояния при resume
 * Validates: Requirements 3.2, 3.3
 */
describe('Resume - State Restoration', () => {
  let orchestrator: WorkflowOrchestrator;
  let logger: Logger;
  let tempDir: string;
  let stateDir: string;
  let artifactsDir: string;

  beforeEach(async () => {
    // Создание временной директории для тестов
    tempDir = await createTempDir('resume-restoration-test');
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
   * Тест 3.2.1: Восстановление состояния из файла
   * Validates: Requirements 3.2
   */
  it('должен восстановить состояние из файла', async () => {
    // Создание конфигурации workflow
    const config: WorkflowConfig = {
      name: 'restore-state-test',
      version: '1.0.0',
      description: 'Тест восстановления состояния',
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

    // Первое выполнение - выполняем все шаги
    const state1 = await orchestrator.run(configPath);
    
    // Проверка, что все шаги выполнены
    expect(state1.status).toBe('completed');
    expect(state1.completedSteps).toHaveLength(3);

    // Восстановление состояния через resume
    const state2 = await orchestrator.resume(state1.sessionId, configPath);

    // Проверки восстановленного состояния
    expect(state2.sessionId).toBe(state1.sessionId);
    expect(state2.workflowName).toBe('restore-state-test');
    expect(state2.workflowVersion).toBe('1.0.0');
    expect(state2.completedSteps).toEqual(state1.completedSteps);
    expect(state2.history.length).toBe(state1.history.length);
    expect(state2.status).toBe('completed');
  });

  /**
   * Тест 3.2.2: Продолжение с последнего успешного шага
   * Validates: Requirements 3.3
   */
  it('должен продолжить выполнение с последнего успешного шага', async () => {
    // Создание конфигурации workflow с 5 шагами
    const config: WorkflowConfig = {
      name: 'resume-from-last-step-test',
      version: '1.0.0',
      description: 'Тест продолжения с последнего шага',
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

    // Первое выполнение - выполняем только первые 3 шага
    // Для этого создадим модифицированную конфигурацию
    const partialConfig: WorkflowConfig = {
      ...config,
      steps: config.steps.slice(0, 3) // Только первые 3 шага
    };
    
    const partialConfigPath = path.join(tempDir, 'workflow-partial.json');
    await fs.writeFile(partialConfigPath, JSON.stringify(partialConfig, null, 2));
    
    const state1 = await orchestrator.run(partialConfigPath);
    
    // Проверка, что выполнены только первые 3 шага
    expect(state1.completedSteps).toHaveLength(3);
    expect(state1.completedSteps).toEqual(['step1', 'step2', 'step3']);

    // Восстановление и продолжение с полной конфигурацией
    const state2 = await orchestrator.resume(state1.sessionId, configPath);

    // Проверки
    expect(state2.sessionId).toBe(state1.sessionId);
    expect(state2.completedSteps).toHaveLength(5);
    expect(state2.completedSteps).toEqual(['step1', 'step2', 'step3', 'step4', 'step5']);
    expect(state2.status).toBe('completed');
    
    // Проверка, что новые шаги были выполнены
    const step4History = state2.history.find(h => h.stepId === 'step4');
    const step5History = state2.history.find(h => h.stepId === 'step5');
    
    expect(step4History).toBeDefined();
    expect(step5History).toBeDefined();
    expect(step4History?.status).toBe('success');
    expect(step5History?.status).toBe('success');
  });

  /**
   * Тест 3.2.3: Восстановление контекста при resume
   * Validates: Requirements 3.2
   */
  it('должен восстановить контекст выполнения при resume', async () => {
    // Создание конфигурации workflow
    const config: WorkflowConfig = {
      name: 'restore-context-test',
      version: '1.0.0',
      description: 'Тест восстановления контекста',
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

    // Первое выполнение
    const state1 = await orchestrator.run(configPath);

    // Восстановление состояния
    const state2 = await orchestrator.resume(state1.sessionId, configPath);

    // Проверка, что контекст восстановлен
    expect(state2.context).toBeDefined();
    expect(state2.context.workflow_name).toBe('restore-context-test');
    expect(state2.context.workflow_version).toBe('1.0.0');
    expect(state2.context.session_id).toBe(state1.sessionId);
    expect(state2.context.default_adapter).toBe('mock-cli');
  });

  /**
   * Тест 3.2.4: Восстановление артефактов при resume
   * Validates: Requirements 3.2
   */
  it('должен восстановить информацию об артефактах при resume', async () => {
    // Создание конфигурации workflow
    const config: WorkflowConfig = {
      name: 'restore-artifacts-test',
      version: '1.0.0',
      description: 'Тест восстановления артефактов',
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

    // Первое выполнение
    const state1 = await orchestrator.run(configPath);

    // Восстановление состояния
    const state2 = await orchestrator.resume(state1.sessionId, configPath);

    // Проверка, что артефакты восстановлены
    expect(state2.artifacts).toBeDefined();
    expect(Object.keys(state2.artifacts).length).toBeGreaterThan(0);
    
    // Проверка, что пути к артефактам совпадают
    for (const [name, path1] of Object.entries(state1.artifacts)) {
      expect(state2.artifacts[name]).toBe(path1);
    }
  });

  /**
   * Тест 3.2.5: Восстановление истории выполнения при resume
   * Validates: Requirements 3.2
   */
  it('должен восстановить историю выполнения при resume', async () => {
    // Создание конфигурации workflow
    const config: WorkflowConfig = {
      name: 'restore-history-test',
      version: '1.0.0',
      description: 'Тест восстановления истории',
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

    // Первое выполнение
    const state1 = await orchestrator.run(configPath);

    // Восстановление состояния
    const state2 = await orchestrator.resume(state1.sessionId, configPath);

    // Проверка, что история восстановлена
    expect(state2.history).toBeDefined();
    expect(state2.history.length).toBe(state1.history.length);
    
    // Проверка, что все записи истории совпадают
    for (let i = 0; i < state1.history.length; i++) {
      expect(state2.history[i].stepId).toBe(state1.history[i].stepId);
      expect(state2.history[i].stepName).toBe(state1.history[i].stepName);
      expect(state2.history[i].status).toBe(state1.history[i].status);
    }
  });

  /**
   * Тест 3.2.6: Resume не дублирует выполненные шаги
   * Validates: Requirements 3.3
   */
  it('не должен повторно выполнять уже завершенные шаги при resume', async () => {
    // Создание конфигурации workflow
    const config: WorkflowConfig = {
      name: 'no-duplicate-steps-test',
      version: '1.0.0',
      description: 'Тест отсутствия дублирования шагов',
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

    // Первое выполнение - все шаги
    const state1 = await orchestrator.run(configPath);
    
    const historyLength1 = state1.history.length;
    expect(historyLength1).toBe(3);

    // Resume - не должно добавить новых записей в историю
    const state2 = await orchestrator.resume(state1.sessionId, configPath);
    
    const historyLength2 = state2.history.length;
    expect(historyLength2).toBe(historyLength1); // Длина истории не изменилась
    
    // Проверка, что completedSteps не содержит дубликатов
    const uniqueSteps = new Set(state2.completedSteps);
    expect(uniqueSteps.size).toBe(state2.completedSteps.length);
  });
});
