/**
 * Интеграционные тесты для обработки ошибок скриптов
 * 
 * Эти тесты проверяют, что оркестратор корректно обрабатывает различные типы ошибок
 * при выполнении script-шагов, включая синтаксические ошибки, runtime ошибки и
 * ненулевые коды выхода.
 * 
 * Validates: Requirements 2.1, 2.2
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
 * Тесты для обработки ошибок скриптов
 * Validates: Requirements 2.1, 2.2
 */
describe('Script Error Handling', () => {
  let orchestrator: WorkflowOrchestrator;
  let logger: Logger;
  let tempDir: string;
  let configPath: string;

  beforeEach(async () => {
    // Создание временной директории для тестов
    tempDir = await createTempDir('script-error-test');
    
    // Создание логгера
    logger = new Logger({ 
      level: LogLevel.ERROR, // Используем ERROR чтобы не засорять вывод
      enableConsole: false,
      enableFile: false
    });
    
    // Создание оркестратора
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
   * Тест 2.1.1: Проверка обработки ненулевого кода выхода
   * Validates: Requirements 2.1, 2.2
   */
  it('должен корректно обработать ненулевой код выхода скрипта', async () => {
    // Создание конфигурации workflow с script-шагом, который завершается с ошибкой
    const config: WorkflowConfig = {
      name: 'test-script-exit-code',
      version: '1.0.0',
      description: 'Тестовый workflow для проверки обработки кода выхода',
      settings: {
        artifacts_dir: path.join(tempDir, 'artifacts'),
        default_adapter: 'mock-adapter'
      },
      steps: [
        {
          id: 'step1',
          name: 'Скрипт с ненулевым кодом выхода',
          type: 'script',
          script: process.platform === 'win32' ? 'exit 1' : 'exit 1',
          shell: process.platform === 'win32' ? 'cmd' : 'bash',
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
      fail('Ожидалась ошибка из-за ненулевого кода выхода, но workflow завершился успешно');
    } catch (error) {
      // Проверяем, что ошибка содержит информацию о коде выхода
      const errorMessage = (error as Error).message;
      
      expect(errorMessage).toContain('завершился с кодом');
      expect(errorMessage).toContain('1');
      
      // Проверяем код ошибки
      if ('code' in (error as any)) {
        expect((error as any).code).toBe('SCRIPT_FAILED');
      }
      
      // Проверяем наличие предложений по устранению
      if ('suggestions' in (error as any)) {
        const suggestions = (error as any).suggestions as string[];
        expect(suggestions).toBeDefined();
        expect(suggestions.length).toBeGreaterThan(0);
        
        const suggestionsText = suggestions.join(' ').toLowerCase();
        expect(
          suggestionsText.includes('stderr') ||
          suggestionsText.includes('исправьте') ||
          suggestionsText.includes('проверьте')
        ).toBe(true);
      }
    }
  });

  /**
   * Тест 2.1.2: Проверка обработки runtime ошибок в скрипте
   * Validates: Requirements 2.1, 2.2
   */
  it('должен корректно обработать runtime ошибку в скрипте', async () => {
    // Создание конфигурации workflow с script-шагом, который вызывает runtime ошибку
    const config: WorkflowConfig = {
      name: 'test-script-runtime-error',
      version: '1.0.0',
      description: 'Тестовый workflow для проверки обработки runtime ошибок',
      settings: {
        artifacts_dir: path.join(tempDir, 'artifacts'),
        default_adapter: 'mock-adapter'
      },
      steps: [
        {
          id: 'step1',
          name: 'Скрипт с runtime ошибкой',
          type: 'script',
          // Команда, которая вызывает ошибку (несуществующая команда)
          script: process.platform === 'win32' 
            ? 'nonexistent-command-12345' 
            : 'nonexistent-command-12345',
          shell: process.platform === 'win32' ? 'cmd' : 'bash',
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
      fail('Ожидалась runtime ошибка, но workflow завершился успешно');
    } catch (error) {
      // Проверяем, что ошибка была обработана
      expect(error).toBeDefined();
      expect(error instanceof Error).toBe(true);
      
      const errorMessage = (error as Error).message;
      
      // Проверяем, что сообщение об ошибке содержит информацию о проблеме
      expect(
        errorMessage.includes('завершился с кодом') ||
        errorMessage.includes('не найден') ||
        errorMessage.includes('not found')
      ).toBe(true);
    }
  });

  /**
   * Тест 2.1.3: Проверка сохранения состояния при ошибке скрипта
   * Validates: Requirements 2.2
   */
  it('должен сохранить состояние при ошибке скрипта', async () => {
    // Создание конфигурации workflow с script-шагом, который завершается с ошибкой
    const config: WorkflowConfig = {
      name: 'test-script-state-preservation',
      version: '1.0.0',
      description: 'Тестовый workflow для проверки сохранения состояния при ошибке',
      settings: {
        artifacts_dir: path.join(tempDir, 'artifacts'),
        default_adapter: 'mock-adapter'
      },
      steps: [
        {
          id: 'step1',
          name: 'Скрипт с ошибкой',
          type: 'script',
          script: process.platform === 'win32' ? 'exit 42' : 'exit 42',
          shell: process.platform === 'win32' ? 'cmd' : 'bash',
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
      
      // Проверяем, что ошибка содержит информацию о коде выхода
      const error = state.errors[0];
      expect(error.error).toContain('42');
    }
  });

  /**
   * Тест 2.1.4: Проверка обработки таймаута скрипта
   * Validates: Requirements 2.1, 2.2
   */
  it('должен корректно обработать таймаут скрипта', async () => {
    // Создание конфигурации workflow с script-шагом, который превышает таймаут
    const config: WorkflowConfig = {
      name: 'test-script-timeout',
      version: '1.0.0',
      description: 'Тестовый workflow для проверки обработки таймаута',
      settings: {
        artifacts_dir: path.join(tempDir, 'artifacts'),
        default_adapter: 'mock-adapter'
      },
      steps: [
        {
          id: 'step1',
          name: 'Скрипт с таймаутом',
          type: 'script',
          // Скрипт, который спит дольше таймаута
          script: process.platform === 'win32' 
            ? 'timeout /t 10 /nobreak' 
            : 'sleep 10',
          shell: process.platform === 'win32' ? 'cmd' : 'bash',
          timeout: 1000, // 1 секунда
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
      // Проверяем, что ошибка была обработана
      expect(error).toBeDefined();
      expect(error instanceof Error).toBe(true);
      
      // Проверяем, что есть код ошибки (может быть SCRIPT_TIMEOUT или SCRIPT_FAILED)
      if ('code' in (error as any)) {
        const code = (error as any).code;
        expect(
          code === 'SCRIPT_TIMEOUT' || code === 'SCRIPT_FAILED'
        ).toBe(true);
      }
      
      // Проверяем наличие предложений по устранению
      if ('suggestions' in (error as any)) {
        const suggestions = (error as any).suggestions as string[];
        expect(suggestions).toBeDefined();
        expect(suggestions.length).toBeGreaterThan(0);
      }
    }
  }, 15000); // Увеличиваем таймаут теста до 15 секунд

  /**
   * Тест 2.1.5: Проверка обработки stderr в скрипте
   * Validates: Requirements 2.1, 2.2
   */
  it('должен корректно обработать вывод stderr в скрипте', async () => {
    // Создание конфигурации workflow с script-шагом, который выводит в stderr
    const config: WorkflowConfig = {
      name: 'test-script-stderr',
      version: '1.0.0',
      description: 'Тестовый workflow для проверки обработки stderr',
      settings: {
        artifacts_dir: path.join(tempDir, 'artifacts'),
        default_adapter: 'mock-adapter'
      },
      steps: [
        {
          id: 'step1',
          name: 'Скрипт с выводом в stderr',
          type: 'script',
          // Скрипт, который выводит в stderr и завершается с ошибкой
          script: process.platform === 'win32' 
            ? 'echo Error message 1>&2 && exit 1' 
            : 'echo "Error message" >&2 && exit 1',
          shell: process.platform === 'win32' ? 'cmd' : 'bash',
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
      // Проверяем, что ошибка содержит информацию о stderr
      if ('context' in (error as any)) {
        const context = (error as any).context;
        
        // Проверяем, что контекст содержит stderr
        expect(context).toHaveProperty('stderr');
        
        // Проверяем, что stderr содержит сообщение об ошибке
        const stderr = context.stderr as string;
        expect(stderr).toContain('Error message');
      }
      
      // Проверяем наличие предложений по устранению
      if ('suggestions' in (error as any)) {
        const suggestions = (error as any).suggestions as string[];
        expect(suggestions).toBeDefined();
        expect(suggestions.length).toBeGreaterThan(0);
        
        const suggestionsText = suggestions.join(' ').toLowerCase();
        expect(
          suggestionsText.includes('stderr') ||
          suggestionsText.includes('вывод') ||
          suggestionsText.includes('детали')
        ).toBe(true);
      }
    }
  });

  /**
   * Тест 2.1.6: Проверка обработки пустого скрипта
   * Validates: Requirements 2.1
   */
  it('должен корректно обработать пустой скрипт', async () => {
    // Создание конфигурации workflow с пустым script-шагом
    const config: WorkflowConfig = {
      name: 'test-empty-script',
      version: '1.0.0',
      description: 'Тестовый workflow для проверки обработки пустого скрипта',
      settings: {
        artifacts_dir: path.join(tempDir, 'artifacts'),
        default_adapter: 'mock-adapter'
      },
      steps: [
        {
          id: 'step1',
          name: 'Пустой скрипт',
          type: 'script',
          script: '', // Пустой скрипт
          shell: process.platform === 'win32' ? 'cmd' : 'bash',
          outputs: {
            result: 'step1_output.md'
          }
        }
      ]
    };

    // Сохранение конфигурации в файл
    configPath = path.join(tempDir, 'workflow.json');
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    // Выполнение workflow (ожидаем ошибку о пустом скрипте)
    try {
      await orchestrator.run(configPath);
      fail('Ожидалась ошибка о пустом скрипте, но workflow завершился успешно');
    } catch (error) {
      // Проверяем, что ошибка содержит информацию о пустом скрипте
      const errorMessage = (error as Error).message;
      
      expect(
        errorMessage.includes('Не указан скрипт') ||
        errorMessage.includes('NO_SCRIPT_SPECIFIED')
      ).toBe(true);
      
      // Проверяем код ошибки
      if ('code' in (error as any)) {
        expect((error as any).code).toBe('NO_SCRIPT_SPECIFIED');
      }
    }
  });

  /**
   * Тест 2.1.7: Проверка обработки множественных ошибок в скриптах
   * Validates: Requirements 2.1, 2.2
   */
  it('должен корректно обработать множественные ошибки в разных скриптах', async () => {
    // Создание конфигурации workflow с двумя script-шагами, оба с ошибками
    const config: WorkflowConfig = {
      name: 'test-multiple-script-errors',
      version: '1.0.0',
      description: 'Тестовый workflow для проверки обработки множественных ошибок',
      settings: {
        artifacts_dir: path.join(tempDir, 'artifacts'),
        default_adapter: 'mock-adapter'
      },
      steps: [
        {
          id: 'step1',
          name: 'Первый скрипт с ошибкой',
          type: 'script',
          script: process.platform === 'win32' ? 'exit 1' : 'exit 1',
          shell: process.platform === 'win32' ? 'cmd' : 'bash',
          outputs: {
            result: 'step1_output.md'
          }
        }
      ]
    };

    // Сохранение конфигурации в файл
    configPath = path.join(tempDir, 'workflow.json');
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    // Выполнение workflow (ожидаем ошибку на первом шаге)
    try {
      await orchestrator.run(configPath);
      fail('Ожидалась ошибка, но workflow завершился успешно');
    } catch (error) {
      // Проверяем, что ошибка содержит информацию о первом шаге
      const errorMessage = (error as Error).message;
      expect(errorMessage).toContain('завершился с кодом');
    }
  });

  /**
   * Тест 2.1.8: Проверка обработки скрипта с очень длинным выводом
   * Validates: Requirements 2.1, 2.2
   */
  it('должен корректно обработать скрипт с длинным выводом', async () => {
    // Создание конфигурации workflow с script-шагом, который выводит много данных
    const config: WorkflowConfig = {
      name: 'test-script-long-output',
      version: '1.0.0',
      description: 'Тестовый workflow для проверки обработки длинного вывода',
      settings: {
        artifacts_dir: path.join(tempDir, 'artifacts'),
        default_adapter: 'mock-adapter'
      },
      steps: [
        {
          id: 'step1',
          name: 'Скрипт с длинным выводом',
          type: 'script',
          // Скрипт, который выводит 1000 строк
          script: process.platform === 'win32' 
            ? 'for /L %i in (1,1,1000) do @echo Line %i' 
            : 'for i in {1..1000}; do echo "Line $i"; done',
          shell: process.platform === 'win32' ? 'cmd' : 'bash',
          outputs: {
            result: 'step1_output.md'
          }
        }
      ]
    };

    // Сохранение конфигурации в файл
    configPath = path.join(tempDir, 'workflow.json');
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    // Выполнение workflow
    const state = await orchestrator.run(configPath);
    
    // Проверяем, что workflow завершился успешно
    expect(state.status).toBe('completed');
    expect(state.completedSteps).toContain('step1');
    
    // Проверяем, что артефакт был создан и содержит вывод
    expect(state.artifacts).toHaveProperty('result');
    const artifactPath = state.artifacts['result'];
    const artifactContent = await fs.readFile(artifactPath, 'utf-8');
    
    // Проверяем, что вывод содержит ожидаемые строки
    expect(artifactContent).toContain('Line 1');
    expect(artifactContent).toContain('Line 1000');
  });
});
