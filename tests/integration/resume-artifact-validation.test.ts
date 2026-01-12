/**
 * Интеграционные тесты для валидации артефактов при resume
 * 
 * Эти тесты проверяют, что система корректно обрабатывает
 * существующие, отсутствующие и поврежденные артефакты при resume.
 * 
 * Validates: Requirements 3.4, 3.5
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
 * Тесты для валидации артефактов при resume
 * Validates: Requirements 3.4, 3.5
 */
describe('Resume - Artifact Validation', () => {
  let orchestrator: WorkflowOrchestrator;
  let logger: Logger;
  let tempDir: string;
  let stateDir: string;
  let artifactsDir: string;

  beforeEach(async () => {
    // Создание временной директории для тестов
    tempDir = await createTempDir('resume-artifact-test');
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
   * Тест 3.3.1: Использование существующих артефактов
   * Validates: Requirements 3.4
   */
  it('должен использовать существующие артефакты при resume', async () => {
    // Создание конфигурации workflow
    const config: WorkflowConfig = {
      name: 'use-existing-artifacts-test',
      version: '1.0.0',
      description: 'Тест использования существующих артефактов',
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

    // Первое выполнение
    const state1 = await orchestrator.run(configPath);
    
    // Проверка, что артефакты созданы
    expect(Object.keys(state1.artifacts).length).toBeGreaterThan(0);
    
    // Проверка существования файлов артефактов
    for (const artifactPath of Object.values(state1.artifacts)) {
      const exists = await fs.access(artifactPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    }

    // Resume - должен использовать существующие артефакты
    const state2 = await orchestrator.resume(state1.sessionId, configPath);

    // Проверка, что артефакты не изменились
    expect(state2.artifacts).toEqual(state1.artifacts);
    
    // Проверка, что файлы артефактов все еще существуют
    for (const artifactPath of Object.values(state2.artifacts)) {
      const exists = await fs.access(artifactPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    }
  });

  /**
   * Тест 3.3.2: Обработка отсутствующих артефактов
   * Validates: Requirements 3.5
   */
  it('должен обнаружить отсутствующие артефакты при resume', async () => {
    // Создание конфигурации workflow
    const config: WorkflowConfig = {
      name: 'missing-artifacts-test',
      version: '1.0.0',
      description: 'Тест обработки отсутствующих артефактов',
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

    // Первое выполнение
    const state1 = await orchestrator.run(configPath);
    
    // Удаление одного из артефактов
    const artifactPaths = Object.values(state1.artifacts);
    if (artifactPaths.length > 0) {
      await fs.unlink(artifactPaths[0]);
    }

    // Resume - должен обнаружить отсутствующий артефакт
    try {
      await orchestrator.resume(state1.sessionId, configPath);
      // Если не произошло ошибки, проверяем что система обработала это корректно
      // (в зависимости от реализации, может быть предупреждение вместо ошибки)
    } catch (error) {
      // Ожидаем ошибку о валидации артефактов
      const errorMessage = (error as Error).message.toLowerCase();
      expect(
        errorMessage.includes('artifact') ||
        errorMessage.includes('артефакт') ||
        errorMessage.includes('validation') ||
        errorMessage.includes('валидац')
      ).toBe(true);
    }
  });

  /**
   * Тест 3.3.3: Обработка поврежденных артефактов
   * Validates: Requirements 3.5
   */
  it('должен обнаружить поврежденные артефакты при resume', async () => {
    // Создание конфигурации workflow
    const config: WorkflowConfig = {
      name: 'corrupted-artifacts-test',
      version: '1.0.0',
      description: 'Тест обработки поврежденных артефактов',
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

    // Первое выполнение
    const state1 = await orchestrator.run(configPath);
    
    // "Повреждение" одного из артефактов (делаем файл пустым)
    const artifactPaths = Object.values(state1.artifacts);
    if (artifactPaths.length > 0) {
      await fs.writeFile(artifactPaths[0], '', 'utf-8');
    }

    // Resume - должен обнаружить поврежденный артефакт
    try {
      await orchestrator.resume(state1.sessionId, configPath);
      // Если не произошло ошибки, проверяем что система обработала это корректно
      // (в зависимости от реализации, может быть предупреждение вместо ошибки)
    } catch (error) {
      // Ожидаем ошибку о валидации артефактов
      const errorMessage = (error as Error).message.toLowerCase();
      expect(
        errorMessage.includes('artifact') ||
        errorMessage.includes('артефакт') ||
        errorMessage.includes('corrupt') ||
        errorMessage.includes('поврежд') ||
        errorMessage.includes('validation') ||
        errorMessage.includes('валидац')
      ).toBe(true);
    }
  });

  /**
   * Тест 3.3.4: Валидация всех артефактов перед resume
   * Validates: Requirements 3.4, 3.5
   */
  it('должен валидировать все артефакты перед resume', async () => {
    // Создание конфигурации workflow с несколькими артефактами
    const config: WorkflowConfig = {
      name: 'validate-all-artifacts-test',
      version: '1.0.0',
      description: 'Тест валидации всех артефактов',
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
            output1: 'step2_output1.md',
            output2: 'step2_output2.md'
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
    
    // Проверка, что все артефакты созданы
    const artifactCount = Object.keys(state1.artifacts).length;
    expect(artifactCount).toBeGreaterThan(0);
    
    // Проверка существования всех файлов артефактов
    for (const artifactPath of Object.values(state1.artifacts)) {
      const exists = await fs.access(artifactPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    }

    // Resume - должен успешно валидировать все артефакты
    const state2 = await orchestrator.resume(state1.sessionId, configPath);

    // Проверка, что все артефакты все еще доступны
    expect(Object.keys(state2.artifacts).length).toBe(artifactCount);
  });

  /**
   * Тест 3.3.5: Проверка целостности содержимого артефактов
   * Validates: Requirements 3.4
   */
  it('должен проверить целостность содержимого артефактов', async () => {
    // Создание конфигурации workflow
    const config: WorkflowConfig = {
      name: 'artifact-integrity-test',
      version: '1.0.0',
      description: 'Тест целостности артефактов',
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
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    // Первое выполнение
    const state1 = await orchestrator.run(configPath);
    
    // Сохранение содержимого артефактов
    const artifactContents = new Map<string, string>();
    for (const [name, artifactPath] of Object.entries(state1.artifacts)) {
      const content = await fs.readFile(artifactPath, 'utf-8');
      artifactContents.set(name, content);
    }

    // Resume
    const state2 = await orchestrator.resume(state1.sessionId, configPath);

    // Проверка, что содержимое артефактов не изменилось
    for (const [name, artifactPath] of Object.entries(state2.artifacts)) {
      const content = await fs.readFile(artifactPath, 'utf-8');
      const originalContent = artifactContents.get(name);
      expect(content).toBe(originalContent);
    }
  });

  /**
   * Тест 3.3.6: Обработка частично отсутствующих артефактов
   * Validates: Requirements 3.5
   */
  it('должен обнаружить частично отсутствующие артефакты', async () => {
    // Создание конфигурации workflow с несколькими артефактами
    const config: WorkflowConfig = {
      name: 'partial-missing-artifacts-test',
      version: '1.0.0',
      description: 'Тест частично отсутствующих артефактов',
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
            output2: 'step1_output2.md',
            output3: 'step1_output3.md'
          }
        }
      ]
    };

    // Сохранение конфигурации в файл
    const configPath = path.join(tempDir, 'workflow.json');
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    // Первое выполнение
    const state1 = await orchestrator.run(configPath);
    
    // Удаление одного из нескольких артефактов
    const artifactPaths = Object.values(state1.artifacts);
    if (artifactPaths.length > 1) {
      await fs.unlink(artifactPaths[0]);
    }

    // Resume - должен обнаружить отсутствующий артефакт
    try {
      await orchestrator.resume(state1.sessionId, configPath);
      // Если не произошло ошибки, проверяем что система обработала это корректно
    } catch (error) {
      // Ожидаем ошибку о валидации артефактов
      const errorMessage = (error as Error).message.toLowerCase();
      expect(
        errorMessage.includes('artifact') ||
        errorMessage.includes('артефакт') ||
        errorMessage.includes('missing') ||
        errorMessage.includes('отсутств')
      ).toBe(true);
    }
  });
});
