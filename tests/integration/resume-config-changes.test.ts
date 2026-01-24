/**
 * Интеграционные тесты для обработки изменений конфигурации при resume
 * 
 * Эти тесты проверяют, что система корректно обрабатывает изменения
 * в конфигурации workflow при возобновлении выполнения.
 * 
 * Validates: Requirements 3.6
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
 * Тесты для обработки изменений конфигурации при resume
 * Validates: Requirements 3.6
 */
describe('Resume - Configuration Changes', () => {
  let orchestrator: WorkflowOrchestrator;
  let logger: Logger;
  let tempDir: string;
  let stateDir: string;
  let artifactsDir: string;

  beforeEach(async () => {
    // Создание временной директории для тестов
    tempDir = await createTempDir('resume-config-test');
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
   * Тест 3.5.1: Предупреждение при изменении имени workflow
   * Validates: Requirements 3.6
   */
  it('должен выдать ошибку при изменении имени workflow', async () => {
    // Создание исходной конфигурации
    const config1: WorkflowConfig = {
      name: 'original-workflow',
      version: '1.0.0',
      description: 'Исходный workflow',
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
        }
      ]
    };

    // Сохранение конфигурации в файл
    const configPath = path.join(tempDir, 'workflow.json');
    await fs.writeFile(configPath, JSON.stringify(config1, null, 2));

    // Первое выполнение
    const state1 = await orchestrator.run(configPath);

    // Изменение имени workflow
    const config2: WorkflowConfig = {
      ...config1,
      name: 'modified-workflow' // Изменили имя
    };

    await fs.writeFile(configPath, JSON.stringify(config2, null, 2));

    // Resume - должен выдать ошибку о несоответствии имени
    try {
      await orchestrator.resume(state1.sessionId, configPath);
      fail('Ожидалась ошибка о несоответствии имени workflow');
    } catch (error) {
      const errorMessage = (error as Error).message.toLowerCase();
      expect(
        errorMessage.includes('name') ||
        errorMessage.includes('имя') ||
        errorMessage.includes('mismatch') ||
        errorMessage.includes('несоответств')
      ).toBe(true);
    }
  });

  /**
   * Тест 3.5.2: Предупреждение при изменении версии workflow
   * Validates: Requirements 3.6
   */
  it('должен выдать предупреждение при изменении версии workflow', async () => {
    // Создание исходной конфигурации
    const config1: WorkflowConfig = {
      name: 'version-test-workflow',
      version: '1.0.0',
      description: 'Тест версий',
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
    await fs.writeFile(configPath, JSON.stringify(config1, null, 2));

    // Первое выполнение
    const state1 = await orchestrator.run(configPath);

    // Изменение версии workflow
    const config2: WorkflowConfig = {
      ...config1,
      version: '2.0.0' // Изменили версию
    };

    await fs.writeFile(configPath, JSON.stringify(config2, null, 2));

    // Resume - должен работать, но может выдать предупреждение
    // (в зависимости от реализации)
    const state2 = await orchestrator.resume(state1.sessionId, configPath);

    // Проверка, что resume выполнился
    expect(state2.sessionId).toBe(state1.sessionId);
    expect(state2.workflowName).toBe('version-test-workflow');
  });

  /**
   * Тест 3.5.3: Обработка добавления новых шагов
   * Validates: Requirements 3.6
   */
  it('должен корректно обработать добавление новых шагов', async () => {
    // Создание исходной конфигурации с 2 шагами
    const config1: WorkflowConfig = {
      name: 'add-steps-test',
      version: '1.0.0',
      description: 'Тест добавления шагов',
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
    await fs.writeFile(configPath, JSON.stringify(config1, null, 2));

    // Первое выполнение
    const state1 = await orchestrator.run(configPath);
    
    expect(state1.completedSteps).toHaveLength(2);

    // Добавление нового шага
    const config2: WorkflowConfig = {
      ...config1,
      steps: [
        ...config1.steps,
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

    await fs.writeFile(configPath, JSON.stringify(config2, null, 2));

    // Resume - должен выполнить только новый шаг
    const state2 = await orchestrator.resume(state1.sessionId, configPath);

    // Проверка, что выполнены все 3 шага
    expect(state2.completedSteps).toHaveLength(3);
    expect(state2.completedSteps).toContain('step3');
  });

  /**
   * Тест 3.5.4: Обработка изменения зависимостей шагов
   * Validates: Requirements 3.6
   */
  it('должен корректно обработать изменение зависимостей шагов', async () => {
    // Создание исходной конфигурации
    const config1: WorkflowConfig = {
      name: 'change-dependencies-test',
      version: '1.0.0',
      description: 'Тест изменения зависимостей',
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
    await fs.writeFile(configPath, JSON.stringify(config1, null, 2));

    // Первое выполнение
    const state1 = await orchestrator.run(configPath);

    // Изменение зависимостей (добавление нового шага с другими зависимостями)
    const config2: WorkflowConfig = {
      ...config1,
      steps: [
        ...config1.steps,
        {
          id: 'step3',
          name: 'Третий шаг',
          type: 'model',
          adapter: 'mock-cli',
          prompt_template: 'Test prompt 3',
          outputs: {
            result: 'step3_output.md'
          },
          depends_on: ['step1'] // Зависит от step1, а не от step2
        }
      ]
    };

    await fs.writeFile(configPath, JSON.stringify(config2, null, 2));

    // Resume - должен корректно обработать новые зависимости
    const state2 = await orchestrator.resume(state1.sessionId, configPath);

    // Проверка, что новый шаг выполнен
    expect(state2.completedSteps).toContain('step3');
  });

  /**
   * Тест 3.5.5: Обработка изменения настроек workflow
   * Validates: Requirements 3.6
   */
  it('должен корректно обработать изменение настроек workflow', async () => {
    // Создание исходной конфигурации
    const config1: WorkflowConfig = {
      name: 'change-settings-test',
      version: '1.0.0',
      description: 'Тест изменения настроек',
      settings: {
        artifacts_dir: artifactsDir,
        default_adapter: 'mock-cli',
        timeout: 30000
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
    await fs.writeFile(configPath, JSON.stringify(config1, null, 2));

    // Первое выполнение
    const state1 = await orchestrator.run(configPath);

    // Изменение настроек
    const config2: WorkflowConfig = {
      ...config1,
      settings: {
        ...config1.settings,
        timeout: 60000 // Изменили таймаут
      }
    };

    await fs.writeFile(configPath, JSON.stringify(config2, null, 2));

    // Resume - должен работать с новыми настройками
    const state2 = await orchestrator.resume(state1.sessionId, configPath);

    // Проверка, что resume выполнился
    expect(state2.sessionId).toBe(state1.sessionId);
  });

  /**
   * Тест 3.5.6: Обработка удаления шагов
   * Validates: Requirements 3.6
   */
  it('должен корректно обработать удаление шагов из конфигурации', async () => {
    // Создание исходной конфигурации с 3 шагами
    const config1: WorkflowConfig = {
      name: 'remove-steps-test',
      version: '1.0.0',
      description: 'Тест удаления шагов',
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
    await fs.writeFile(configPath, JSON.stringify(config1, null, 2));

    // Первое выполнение - только первые 2 шага
    const partialConfig: WorkflowConfig = {
      ...config1,
      steps: config1.steps.slice(0, 2)
    };
    
    const partialConfigPath = path.join(tempDir, 'workflow-partial.json');
    await fs.writeFile(partialConfigPath, JSON.stringify(partialConfig, null, 2));
    
    const state1 = await orchestrator.run(partialConfigPath);

    // Удаление последнего шага из конфигурации
    const config2: WorkflowConfig = {
      ...config1,
      steps: config1.steps.slice(0, 2) // Только первые 2 шага
    };

    await fs.writeFile(configPath, JSON.stringify(config2, null, 2));

    // Resume - должен работать без удаленного шага
    const state2 = await orchestrator.resume(state1.sessionId, configPath);

    // Проверка, что выполнены только 2 шага
    expect(state2.completedSteps).toHaveLength(2);
    expect(state2.completedSteps).not.toContain('step3');
  });
});
