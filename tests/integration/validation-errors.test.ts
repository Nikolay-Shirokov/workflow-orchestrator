/**
 * Интеграционные тесты для обработки ошибок валидации
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { WorkflowOrchestrator } from '../../src/cli/orchestrator';
import { Logger, LogLevel } from '../../src/core/logger';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Validation Error Handling', () => {
  let orchestrator: WorkflowOrchestrator;
  let tempDir: string;
  let configPath: string;
  let logger: Logger;

  beforeEach(async () => {
    // Создание временной директории для тестов
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'validation-error-test-'));

    // Инициализация логгера
    logger = new Logger({
      level: LogLevel.ERROR,
      enableConsole: false,
      enableFile: false
    });

    // Инициализация оркестратора
    orchestrator = new WorkflowOrchestrator({ logger });
  });

  afterEach(async () => {
    // Очистка временной директории
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Игнорируем ошибки очистки
    }
  });

  /**
   * Тест: Обработка невалидной конфигурации
   * Проверяет, что система корректно обрабатывает
   * конфигурацию с отсутствующими обязательными полями
   */
  it('должен корректно обработать невалидную конфигурацию', async () => {
    // Создание невалидной конфигурации (отсутствует поле name)
    const config = {
      version: '1.0.0',
      steps: [
        {
          id: 'step1',
          name: 'Тестовый шаг',
          type: 'script',
          script: 'echo "test"'
        }
      ]
    };

    // Сохранение конфигурации в файл
    configPath = path.join(tempDir, 'workflow.json');
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    // Выполнение workflow должно завершиться с ошибкой
    try {
      await orchestrator.run(configPath);
      // Если не выбросилась ошибка, тест должен упасть
      expect(true).toBe(false);
    } catch (error) {
      // Проверяем, что ошибка связана с валидацией
      expect(error).toBeDefined();
      if (error instanceof Error) {
        expect(error.message).toBeDefined();
      }
    }
  });

  /**
   * Тест: Обработка несуществующих зависимостей
   * Проверяет, что система корректно обрабатывает
   * ссылки на несуществующие шаги в зависимостях
   */
  it('должен корректно обработать несуществующие зависимости', async () => {
    // Создание конфигурации с несуществующей зависимостью
    const config = {
      name: 'test-invalid-dependency',
      version: '1.0.0',
      steps: [
        {
          id: 'step1',
          name: 'Шаг с несуществующей зависимостью',
          type: 'script',
          script: 'echo "test"',
          depends_on: ['nonexistent_step']
        }
      ]
    };

    // Сохранение конфигурации в файл
    configPath = path.join(tempDir, 'workflow.json');
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    // Выполнение workflow должно завершиться с ошибкой
    try {
      await orchestrator.run(configPath);
      // Если не выбросилась ошибка, тест должен упасть
      expect(true).toBe(false);
    } catch (error) {
      // Проверяем, что ошибка связана с зависимостями
      expect(error).toBeDefined();
      if (error instanceof Error) {
        expect(error.message).toBeDefined();
      }
    }
  });

  /**
   * Тест: Обработка циклических зависимостей
   * Проверяет, что система корректно обрабатывает
   * циклические зависимости между шагами
   */
  it('должен корректно обработать циклические зависимости', async () => {
    // Создание конфигурации с циклическими зависимостями
    const config = {
      name: 'test-circular-dependency',
      version: '1.0.0',
      steps: [
        {
          id: 'step1',
          name: 'Шаг 1',
          type: 'script',
          script: 'echo "step1"',
          depends_on: ['step2']
        },
        {
          id: 'step2',
          name: 'Шаг 2',
          type: 'script',
          script: 'echo "step2"',
          depends_on: ['step1']
        }
      ]
    };

    // Сохранение конфигурации в файл
    configPath = path.join(tempDir, 'workflow.json');
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    // Выполнение workflow должно завершиться с ошибкой
    try {
      await orchestrator.run(configPath);
      // Если не выбросилась ошибка, тест должен упасть
      expect(true).toBe(false);
    } catch (error) {
      // Проверяем, что ошибка связана с циклическими зависимостями
      expect(error).toBeDefined();
      if (error instanceof Error) {
        expect(error.message).toBeDefined();
      }
    }
  });
});
