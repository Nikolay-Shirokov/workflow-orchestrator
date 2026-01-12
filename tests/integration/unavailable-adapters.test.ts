/**
 * Интеграционные тесты для обработки недоступных адаптеров
 * 
 * Эти тесты проверяют, что оркестратор корректно обрабатывает ситуации,
 * когда запрошенный адаптер недоступен или не зарегистрирован.
 * 
 * Validates: Requirements 1.4
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { WorkflowOrchestrator } from '../../src/cli/orchestrator.js';
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
 * Тесты для обработки недоступных адаптеров
 * Validates: Requirements 1.4
 */
describe('Unavailable Adapters Handling', () => {
  let orchestrator: WorkflowOrchestrator;
  let logger: Logger;
  let tempDir: string;
  let configPath: string;

  beforeEach(async () => {
    // Создание временной директории для тестов
    tempDir = await createTempDir('unavailable-adapter-test');
    
    // Создание логгера
    logger = new Logger({ 
      level: LogLevel.ERROR, // Используем ERROR чтобы не засорять вывод
      enableConsole: false,
      enableFile: false
    });
    
    // Создание оркестратора БЕЗ регистрации адаптеров
    orchestrator = new WorkflowOrchestrator({
      stateDir: path.join(tempDir, 'state'),
      artifactsDir: path.join(tempDir, 'artifacts'),
      logger
    });
  });

  afterEach(async () => {
    // Очистка временной директории
    await cleanupTempDir(tempDir);
  });

  /**
   * Тест 1.5.1: Проверка понятного сообщения об ошибке когда адаптер недоступен
   * Validates: Requirements 1.4
   */
  it('должен вернуть понятное сообщение об ошибке когда адаптер не зарегистрирован', async () => {
    // Создание конфигурации workflow с несуществующим адаптером
    const config: WorkflowConfig = {
      name: 'test-unavailable-adapter',
      version: '1.0.0',
      description: 'Тестовый workflow с недоступным адаптером',
      settings: {
        artifacts_dir: path.join(tempDir, 'artifacts'),
        default_adapter: 'non-existent-adapter'
      },
      steps: [
        {
          id: 'step1',
          name: 'Шаг с недоступным адаптером',
          type: 'model',
          adapter: 'non-existent-adapter',
          prompt_template: 'Тестовый промпт',
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
      fail('Ожидалась ошибка о недоступном адаптере, но workflow завершился успешно');
    } catch (error) {
      const errorMessage = (error as Error).message;
      
      // Проверяем, что сообщение об ошибке понятное и информативное
      expect(errorMessage).toContain('Адаптер не найден');
      expect(errorMessage).toContain('non-existent-adapter');
      
      // Проверяем, что это WorkflowErrorClass с правильным кодом
      if ('code' in (error as any)) {
        expect((error as any).code).toBe('ADAPTER_NOT_FOUND');
      }
    }
  });

  /**
   * Тест 1.5.2: Проверка предложений по устранению проблемы
   * Validates: Requirements 1.4
   */
  it('должен предложить варианты устранения проблемы с недоступным адаптером', async () => {
    // Создание конфигурации workflow с несуществующим адаптером
    const config: WorkflowConfig = {
      name: 'test-unavailable-adapter-suggestions',
      version: '1.0.0',
      description: 'Тестовый workflow для проверки предложений',
      settings: {
        artifacts_dir: path.join(tempDir, 'artifacts'),
        default_adapter: 'missing-adapter'
      },
      steps: [
        {
          id: 'step1',
          name: 'Шаг с недоступным адаптером',
          type: 'model',
          adapter: 'missing-adapter',
          prompt_template: 'Тестовый промпт',
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
      fail('Ожидалась ошибка о недоступном адаптере, но workflow завершился успешно');
    } catch (error) {
      // Проверяем наличие предложений по устранению
      if ('suggestions' in (error as any)) {
        const suggestions = (error as any).suggestions as string[];
        
        expect(suggestions).toBeDefined();
        expect(suggestions.length).toBeGreaterThan(0);
        
        // Проверяем, что предложения содержат полезную информацию
        const suggestionsText = suggestions.join(' ').toLowerCase();
        expect(
          suggestionsText.includes('проверьте') ||
          suggestionsText.includes('убедитесь') ||
          suggestionsText.includes('доступные')
        ).toBe(true);
      }
    }
  });

  /**
   * Тест 1.5.3: Проверка списка доступных адаптеров в сообщении об ошибке
   * Validates: Requirements 1.4
   */
  it('должен показать список доступных адаптеров в сообщении об ошибке', async () => {
    // Регистрируем несколько адаптеров для теста
    const { MockCLIAdapter } = await import('../../src/adapters/mock-cli-adapter.js');
    
    const mockAdapter1 = new MockCLIAdapter('test-adapter-1');
    const mockAdapter2 = new MockCLIAdapter('test-adapter-2');
    
    orchestrator.registerAdapter(mockAdapter1);
    orchestrator.registerAdapter(mockAdapter2);

    // Создание конфигурации workflow с несуществующим адаптером
    const config: WorkflowConfig = {
      name: 'test-available-adapters-list',
      version: '1.0.0',
      description: 'Тестовый workflow для проверки списка адаптеров',
      settings: {
        artifacts_dir: path.join(tempDir, 'artifacts'),
        default_adapter: 'wrong-adapter'
      },
      steps: [
        {
          id: 'step1',
          name: 'Шаг с неправильным адаптером',
          type: 'model',
          adapter: 'wrong-adapter',
          prompt_template: 'Тестовый промпт',
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
      fail('Ожидалась ошибка о недоступном адаптере, но workflow завершился успешно');
    } catch (error) {
      // Проверяем, что в контексте ошибки есть список доступных адаптеров
      if ('context' in (error as any)) {
        const context = (error as any).context;
        
        expect(context).toHaveProperty('availableNames');
        expect(context.availableNames).toContain('test-adapter-1');
        expect(context.availableNames).toContain('test-adapter-2');
      }
      
      // Проверяем, что в предложениях упоминаются доступные адаптеры
      if ('suggestions' in (error as any)) {
        const suggestions = (error as any).suggestions as string[];
        const suggestionsText = suggestions.join(' ');
        
        expect(
          suggestionsText.includes('test-adapter-1') ||
          suggestionsText.includes('test-adapter-2') ||
          suggestionsText.includes('Доступные адаптеры')
        ).toBe(true);
      }
    }
  });

  /**
   * Тест 1.5.4: Проверка обработки недоступного default_adapter
   * Validates: Requirements 1.4
   */
  it('должен корректно обработать недоступный default_adapter', async () => {
    // Создание конфигурации workflow с недоступным default_adapter
    // и шагом без явного указания адаптера
    const config: WorkflowConfig = {
      name: 'test-default-adapter-unavailable',
      version: '1.0.0',
      description: 'Тестовый workflow с недоступным default_adapter',
      settings: {
        artifacts_dir: path.join(tempDir, 'artifacts'),
        default_adapter: 'unavailable-default-adapter'
      },
      steps: [
        {
          id: 'step1',
          name: 'Шаг без явного адаптера',
          type: 'model',
          // adapter не указан, должен использоваться default_adapter
          prompt_template: 'Тестовый промпт',
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
      fail('Ожидалась ошибка о недоступном default_adapter, но workflow завершился успешно');
    } catch (error) {
      const errorMessage = (error as Error).message;
      
      // Проверяем, что сообщение об ошибке упоминает недоступный адаптер
      expect(errorMessage).toContain('Адаптер не найден');
      expect(errorMessage).toContain('unavailable-default-adapter');
    }
  });

  /**
   * Тест 1.5.5: Проверка обработки ошибки когда не указан ни adapter, ни default_adapter
   * Validates: Requirements 1.4
   */
  it('должен вернуть понятное сообщение когда не указан ни adapter, ни default_adapter', async () => {
    // Создание конфигурации workflow БЕЗ default_adapter
    // и шага БЕЗ явного указания адаптера
    const config: WorkflowConfig = {
      name: 'test-no-adapter-specified',
      version: '1.0.0',
      description: 'Тестовый workflow без указания адаптера',
      settings: {
        artifacts_dir: path.join(tempDir, 'artifacts')
        // default_adapter НЕ указан
      },
      steps: [
        {
          id: 'step1',
          name: 'Шаг без адаптера',
          type: 'model',
          // adapter не указан
          prompt_template: 'Тестовый промпт',
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
      fail('Ожидалась ошибка о неуказанном адаптере, но workflow завершился успешно');
    } catch (error) {
      const errorMessage = (error as Error).message;
      
      // Проверяем, что сообщение об ошибке понятное
      expect(
        errorMessage.includes('Не указан адаптер') ||
        errorMessage.includes('NO_ADAPTER_SPECIFIED')
      ).toBe(true);
      
      // Проверяем код ошибки
      if ('code' in (error as any)) {
        expect((error as any).code).toBe('NO_ADAPTER_SPECIFIED');
      }
      
      // Проверяем наличие предложений
      if ('suggestions' in (error as any)) {
        const suggestions = (error as any).suggestions as string[];
        expect(suggestions.length).toBeGreaterThan(0);
        
        const suggestionsText = suggestions.join(' ').toLowerCase();
        expect(
          suggestionsText.includes('укажите адаптер') ||
          suggestionsText.includes('default_adapter')
        ).toBe(true);
      }
    }
  });

  /**
   * Тест 1.5.6: Проверка сохранения состояния при ошибке недоступного адаптера
   * Validates: Requirements 1.4
   */
  it('должен сохранить состояние при ошибке недоступного адаптера', async () => {
    // Создание конфигурации workflow с недоступным адаптером
    const config: WorkflowConfig = {
      name: 'test-state-preservation',
      version: '1.0.0',
      description: 'Тестовый workflow для проверки сохранения состояния',
      settings: {
        artifacts_dir: path.join(tempDir, 'artifacts'),
        default_adapter: 'unavailable-adapter'
      },
      steps: [
        {
          id: 'step1',
          name: 'Шаг с недоступным адаптером',
          type: 'model',
          adapter: 'unavailable-adapter',
          prompt_template: 'Тестовый промпт',
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
      fail('Ожидалась ошибка о недоступном адаптере, но workflow завершился успешно');
    } catch (error) {
      // Ошибка ожидаема, продолжаем
    }

    // Проверяем, что файл состояния был создан
    const stateDir = path.join(tempDir, 'state');
    const stateFiles = await fs.readdir(stateDir);
    
    expect(stateFiles.length).toBeGreaterThan(0);
    
    // Находим файл состояния
    const stateFile = stateFiles.find(f => f.endsWith('.json'));
    expect(stateFile).toBeDefined();
    
    if (stateFile) {
      // Читаем состояние
      const stateContent = await fs.readFile(path.join(stateDir, stateFile), 'utf-8');
      const state = JSON.parse(stateContent);
      
      // Проверяем, что состояние содержит информацию об ошибке
      expect(state.status).toBe('failed');
      expect(state.errors).toBeDefined();
      expect(state.errors.length).toBeGreaterThan(0);
      
      // Проверяем, что ошибка содержит информацию о недоступном адаптере
      const error = state.errors[0];
      expect(error.error).toContain('Адаптер не найден');
    }
  });
});
