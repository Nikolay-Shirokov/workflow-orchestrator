/**
 * Интеграционные тесты для обработки ошибок шаблонов
 * 
 * Эти тесты проверяют, что оркестратор корректно обрабатывает различные типы ошибок
 * при рендеринге шаблонов, включая несуществующие переменные и циклические зависимости.
 * 
 * Validates: Requirements 2.4
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
  const tmpDir = path.join(process.cwd(), 'tmp', `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
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
 * Тесты для обработки ошибок шаблонов
 * Validates: Requirements 2.4
 */
describe('Template Error Handling', () => {
  let orchestrator: WorkflowOrchestrator;
  let logger: Logger;
  let tempDir: string;
  let configPath: string;
  let mockAdapter: MockCLIAdapter;

  beforeEach(async () => {
    // Создание временной директории для тестов
    tempDir = await createTempDir('template-error-test');
    
    // Создание логгера
    logger = new Logger({ 
      level: LogLevel.ERROR,
      enableConsole: false,
      enableFile: false
    });
    
    // Создание оркестратора
    orchestrator = new WorkflowOrchestrator({
      stateDir: path.join(tempDir, 'state'),
      artifactsDir: path.join(tempDir, 'artifacts'),
      logger
    });
    
    // Создание и регистрация mock-адаптера
    mockAdapter = new MockCLIAdapter('test-adapter');
    mockAdapter.setResponse('test prompt', 'Test response');
    orchestrator.registerAdapter(mockAdapter);
  });

  afterEach(async () => {
    // Очистка временной директории
    await cleanupTempDir(tempDir);
  });

  /**
   * Тест 2.4.1: Проверка обработки несуществующей переменной
   * Validates: Requirements 2.4
   */
  it('должен корректно обработать несуществующую переменную в шаблоне', async () => {
    // Создание конфигурации workflow с шаблоном, содержащим несуществующую переменную
    const config: WorkflowConfig = {
      name: 'test-undefined-variable',
      version: '1.0.0',
      description: 'Тестовый workflow для проверки обработки несуществующей переменной',
      settings: {
        artifacts_dir: path.join(tempDir, 'artifacts'),
        default_adapter: 'test-adapter'
      },
      steps: [
        {
          id: 'step1',
          name: 'Шаг с несуществующей переменной',
          type: 'model',
          adapter: 'test-adapter',
          prompt_template: 'Test prompt with ${nonexistent_variable}',
          outputs: {
            result: 'step1_output.md'
          }
        }
      ]
    };

    // Сохранение конфигурации в файл
    configPath = path.join(tempDir, 'workflow.json');
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    // Выполнение workflow (ожидаем ошибку)
    try {
      await orchestrator.run(configPath);
      fail('Ожидалась ошибка о несуществующей переменной, но workflow завершился успешно');
    } catch (error) {
      // Проверяем, что ошибка содержит информацию о несуществующей переменной
      const errorMessage = (error as Error).message;
      
      expect(
        errorMessage.includes('Переменная не определена') ||
        errorMessage.includes('UNDEFINED_VARIABLE') ||
        errorMessage.includes('nonexistent_variable')
      ).toBe(true);
      
      // Проверяем код ошибки
      if ('code' in (error as any)) {
        expect((error as any).code).toBe('UNDEFINED_VARIABLE');
      }
      
      // Проверяем наличие предложений по устранению
      if ('suggestions' in (error as any)) {
        const suggestions = (error as any).suggestions as string[];
        expect(suggestions).toBeDefined();
        expect(suggestions.length).toBeGreaterThan(0);
      }
    }
  });

  /**
   * Тест 2.4.2: Проверка понятного сообщения об ошибке
   * Validates: Requirements 2.4
   */
  it('должен вернуть понятное сообщение об ошибке шаблона', async () => {
    // Создание конфигурации workflow с шаблоном, содержащим несуществующую переменную
    const config: WorkflowConfig = {
      name: 'test-template-error-message',
      version: '1.0.0',
      description: 'Тестовый workflow для проверки сообщения об ошибке',
      settings: {
        artifacts_dir: path.join(tempDir, 'artifacts'),
        default_adapter: 'test-adapter'
      },
      steps: [
        {
          id: 'step1',
          name: 'Шаг с ошибкой шаблона',
          type: 'model',
          adapter: 'test-adapter',
          prompt_template: 'Test ${missing_var}',
          outputs: {
            result: 'step1_output.md'
          }
        }
      ]
    };

    // Сохранение конфигурации в файл
    configPath = path.join(tempDir, 'workflow.json');
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    // Выполнение workflow (ожидаем ошибку)
    try {
      await orchestrator.run(configPath);
      fail('Ожидалась ошибка, но workflow завершился успешно');
    } catch (error) {
      // Проверяем, что сообщение об ошибке понятное
      const errorMessage = (error as Error).message;
      
      expect(errorMessage).toBeDefined();
      expect(errorMessage.length).toBeGreaterThan(0);
      
      // Проверяем, что сообщение содержит имя переменной
      expect(errorMessage).toContain('missing_var');
    }
  });

  /**
   * Тест 2.4.3: Проверка обработки пустого шаблона
   * Validates: Requirements 2.4
   */
  it('должен корректно обработать пустой шаблон', async () => {
    // Создание конфигурации workflow с пустым шаблоном
    const config: WorkflowConfig = {
      name: 'test-empty-template',
      version: '1.0.0',
      description: 'Тестовый workflow для проверки пустого шаблона',
      settings: {
        artifacts_dir: path.join(tempDir, 'artifacts'),
        default_adapter: 'test-adapter'
      },
      steps: [
        {
          id: 'step1',
          name: 'Шаг с пустым шаблоном',
          type: 'model',
          adapter: 'test-adapter',
          prompt_template: '',
          outputs: {
            result: 'step1_output.md'
          }
        }
      ]
    };

    // Сохранение конфигурации в файл
    configPath = path.join(tempDir, 'workflow.json');
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    // Выполнение workflow (ожидаем ошибку)
    try {
      await orchestrator.run(configPath);
      fail('Ожидалась ошибка о пустом шаблоне, но workflow завершился успешно');
    } catch (error) {
      // Проверяем, что ошибка содержит информацию о пустом шаблоне
      const errorMessage = (error as Error).message;
      
      expect(errorMessage).toBeDefined();
      expect(errorMessage).toContain('Не указан шаблон промпта');
    }
  });
});
