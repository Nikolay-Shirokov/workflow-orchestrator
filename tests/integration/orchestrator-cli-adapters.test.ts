/**
 * Интеграционные тесты для Workflow Orchestrator с реальными CLI-адаптерами
 * 
 * Эти тесты проверяют работу оркестратора с реальными AI-моделями через CLI-адаптеры.
 * Тесты требуют наличия установленных CLI-утилит и API ключей.
 * 
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { WorkflowOrchestrator } from '../../src/cli/orchestrator.js';
import { ClaudeCLIAdapter } from '../../src/adapters/claude-cli-adapter.js';
import { Logger, LogLevel } from '../../src/core/logger.js';
import { WorkflowConfig } from '../../src/core/types.js';
import * as fs from 'fs/promises';
import * as path from 'path';

// Вспомогательная функция для создания временной директории
async function createTempDir(prefix: string): Promise<string> {
  const tmpDir = path.join(process.cwd(), 'tmp', `${prefix}-${Date.now()}`);
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

// Вспомогательная функция для создания простого workflow
function createSimpleWorkflow(adapterName: string, prompt: string, artifactsDir: string): WorkflowConfig {
  return {
    name: 'simple-test-workflow',
    version: '1.0.0',
    description: 'Простой тестовый workflow',
    settings: {
      artifacts_dir: artifactsDir,
      default_adapter: adapterName
    },
    steps: [
      {
        id: 'step1',
        name: 'Простой запрос',
        type: 'model',
        adapter: adapterName,
        prompt_template: prompt,
        outputs: {
          result: 'step1_output.md'
        }
      }
    ]
  };
}

// Вспомогательная функция для создания сложного workflow с зависимостями
function createComplexWorkflow(adapterName: string, artifactsDir: string): WorkflowConfig {
  return {
    name: 'complex-test-workflow',
    version: '1.0.0',
    description: 'Сложный тестовый workflow с зависимостями',
    settings: {
      artifacts_dir: artifactsDir,
      default_adapter: adapterName
    },
    steps: [
      {
        id: 'step1',
        name: 'Первый шаг',
        type: 'model',
        adapter: adapterName,
        prompt_template: 'Напиши короткое приветствие на русском языке (максимум 10 слов)',
        outputs: {
          result: 'step1_output.md'
        }
      },
      {
        id: 'step2',
        name: 'Второй шаг',
        type: 'model',
        adapter: adapterName,
        prompt_template: 'Предыдущий ответ: ${result}. Теперь переведи это на английский язык.',
        outputs: {
          result: 'step2_output.md'
        },
        depends_on: ['step1']
      },
      {
        id: 'step3',
        name: 'Третий шаг',
        type: 'model',
        adapter: adapterName,
        prompt_template: 'Английский текст: ${result}. Сделай его более формальным.',
        outputs: {
          result: 'step3_output.md'
        },
        depends_on: ['step2']
      },
      {
        id: 'step4',
        name: 'Четвертый шаг',
        type: 'model',
        adapter: adapterName,
        prompt_template: 'Формальный текст: ${result}. Добавь вежливое завершение.',
        outputs: {
          result: 'step4_output.md'
        },
        depends_on: ['step3']
      },
      {
        id: 'step5',
        name: 'Пятый шаг',
        type: 'model',
        adapter: adapterName,
        prompt_template: 'Финальный текст: ${result}. Сделай краткое резюме (одно предложение).',
        outputs: {
          result: 'step5_output.md'
        },
        depends_on: ['step4']
      }
    ]
  };
}


/**
 * Тесты для Claude CLI адаптера
 * Validates: Requirements 1.1
 */
// Пропущен: требует установленного Claude CLI и долго выполняется
describe.skip('Claude CLI Adapter Integration', () => {
  let orchestrator: WorkflowOrchestrator;
  let logger: Logger;
  let tempDir: string;
  let configPath: string;

  beforeEach(async () => {
    // Создание временной директории для тестов
    tempDir = await createTempDir('claude-test');
    
    // Создание логгера
    logger = new Logger({ 
      level: LogLevel.ERROR, // Используем ERROR чтобы не засорять вывод
      enableConsole: false,
      enableFile: false
    });
    
    // Создание оркестратора (автоматически регистрирует все адаптеры)
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
   * Тест 1.1.1: Проверка успешного выполнения простого workflow (1-2 шага)
   * Validates: Requirements 1.1
   */
  it('должен успешно выполнить простой workflow с 1 шагом', async () => {
    // Проверяем доступность Claude CLI
    const claudeAdapter = new ClaudeCLIAdapter();
    const isAvailable = await claudeAdapter.isAvailable();
    
    if (!isAvailable) {
      console.log('⚠️  Claude CLI недоступен, пропускаем тест');
      return;
    }

    // Создание конфигурации workflow
    const config = createSimpleWorkflow(
      'claude-cli',
      'Ответь одним словом: какой сегодня день недели?',
      path.join(tempDir, 'artifacts')
    );

    // Сохранение конфигурации в файл
    configPath = path.join(tempDir, 'workflow.json');
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    // Выполнение workflow
    const state = await orchestrator.run(configPath);

    // Проверки
    expect(state.status).toBe('completed');
    expect(state.completedSteps).toHaveLength(1);
    expect(state.completedSteps).toContain('step1');
    expect(state.errors).toHaveLength(0);
    
    // Проверка что артефакт создан
    expect(state.artifacts).toHaveProperty('result');
    const artifactPath = state.artifacts['result'];
    const artifactExists = await fs.access(artifactPath).then(() => true).catch(() => false);
    expect(artifactExists).toBe(true);
    
    // Проверка что артефакт содержит непустой ответ
    const artifactContent = await fs.readFile(artifactPath, 'utf-8');
    expect(artifactContent.length).toBeGreaterThan(0);
  }, 60000); // Таймаут 60 секунд для реального API вызова

  /**
   * Тест 1.1.2: Проверка выполнения сложного workflow (5+ шагов с зависимостями)
   * Validates: Requirements 1.1
   */
  it('должен успешно выполнить сложный workflow с 5 шагами и зависимостями', async () => {
    // Проверяем доступность Claude CLI
    const claudeAdapter = new ClaudeCLIAdapter();
    const isAvailable = await claudeAdapter.isAvailable();
    
    if (!isAvailable) {
      console.log('⚠️  Claude CLI недоступен, пропускаем тест');
      return;
    }

    // Создание конфигурации workflow
    const config = createComplexWorkflow(
      'claude-cli',
      path.join(tempDir, 'artifacts')
    );

    // Сохранение конфигурации в файл
    configPath = path.join(tempDir, 'workflow.json');
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    // Выполнение workflow
    const state = await orchestrator.run(configPath);

    // Проверки
    expect(state.status).toBe('completed');
    expect(state.completedSteps).toHaveLength(5);
    expect(state.completedSteps).toEqual(['step1', 'step2', 'step3', 'step4', 'step5']);
    expect(state.errors).toHaveLength(0);
    
    // Проверка что все артефакты созданы
    // Каждый шаг создает артефакт с ключом 'result'
    expect(state.artifacts).toHaveProperty('result');
    
    const artifactPath = state.artifacts['result'];
    const artifactExists = await fs.access(artifactPath).then(() => true).catch(() => false);
    expect(artifactExists).toBe(true);
    
    // Проверка что артефакт содержит непустой ответ
    const artifactContent = await fs.readFile(artifactPath, 'utf-8');
    expect(artifactContent.length).toBeGreaterThan(0);
    
    // Проверка истории выполнения
    expect(state.history).toHaveLength(5);
    
    // Проверка что шаги выполнялись в правильном порядке (с учетом зависимостей)
    const step1History = state.history.find(h => h.stepId === 'step1');
    const step2History = state.history.find(h => h.stepId === 'step2');
    const step3History = state.history.find(h => h.stepId === 'step3');
    const step4History = state.history.find(h => h.stepId === 'step4');
    const step5History = state.history.find(h => h.stepId === 'step5');
    
    expect(step1History).toBeDefined();
    expect(step2History).toBeDefined();
    expect(step3History).toBeDefined();
    expect(step4History).toBeDefined();
    expect(step5History).toBeDefined();
    
    // Проверка что каждый шаг начался после завершения предыдущего
    if (step1History && step2History) {
      expect(new Date(step2History.startedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(step1History.completedAt).getTime()
      );
    }
    if (step2History && step3History) {
      expect(new Date(step3History.startedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(step2History.completedAt).getTime()
      );
    }
    if (step3History && step4History) {
      expect(new Date(step4History.startedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(step3History.completedAt).getTime()
      );
    }
    if (step4History && step5History) {
      expect(new Date(step5History.startedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(step4History.completedAt).getTime()
      );
    }
  }, 300000); // Таймаут 5 минут для сложного workflow с реальными API вызовами

  /**
   * Тест 1.1.3: Проверка обработки таймаутов
   * Validates: Requirements 1.1
   */
  it('должен корректно обработать таймаут адаптера', async () => {
    // Проверяем доступность Claude CLI
    const claudeAdapter = new ClaudeCLIAdapter();
    const isAvailable = await claudeAdapter.isAvailable();
    
    if (!isAvailable) {
      console.log('⚠️  Claude CLI недоступен, пропускаем тест');
      return;
    }

    // Создание конфигурации workflow с очень коротким таймаутом
    const config: WorkflowConfig = {
      name: 'timeout-test-workflow',
      version: '1.0.0',
      description: 'Тестовый workflow для проверки таймаута',
      settings: {
        artifacts_dir: path.join(tempDir, 'artifacts'),
        default_adapter: 'claude-cli',
        timeout: 100 // Очень короткий таймаут - 100мс
      },
      steps: [
        {
          id: 'step1',
          name: 'Шаг с таймаутом',
          type: 'model',
          adapter: 'claude-cli',
          prompt_template: 'Напиши длинное эссе на 1000 слов о философии искусственного интеллекта',
          outputs: {
            result: 'step1_output.md'
          },
          timeout: 100 // Очень короткий таймаут на уровне шага
        }
      ]
    };

    // Сохранение конфигурации в файл
    configPath = path.join(tempDir, 'workflow.json');
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    // Выполнение workflow (ожидаем ошибку таймаута)
    try {
      await orchestrator.run(configPath);
      // Если не произошло ошибки, тест не пройден
      fail('Ожидалась ошибка таймаута, но workflow завершился успешно');
    } catch (error) {
      // Проверяем что это ошибка таймаута
      const errorMessage = (error as Error).message.toLowerCase();
      expect(
        errorMessage.includes('timeout') || 
        errorMessage.includes('таймаут') ||
        errorMessage.includes('timed out')
      ).toBe(true);
    }
  }, 30000); // Таймаут 30 секунд для теста таймаута
});

/**
 * Тесты для Gemini CLI адаптера
 * Validates: Requirements 1.3
 */
// Пропущен: требует установленного Gemini CLI и долго выполняется
describe.skip('Gemini CLI Adapter Integration', () => {
  let orchestrator: WorkflowOrchestrator;
  let logger: Logger;
  let tempDir: string;
  let configPath: string;

  beforeEach(async () => {
    // Создание временной директории для тестов
    tempDir = await createTempDir('gemini-test');
    
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
    // Адаптеры автоматически регистрируются оркестратором
  });

  afterEach(async () => {
    // Очистка временной директории
    await cleanupTempDir(tempDir);
  });

  /**
   * Тест 1.3.1: Проверка успешного выполнения простого workflow (1-2 шага)
   * Validates: Requirements 1.3
   */
  it('должен успешно выполнить простой workflow с 1 шагом', async () => {
    // Проверяем доступность Gemini CLI
    const { GeminiCLIAdapter } = await import('../../src/adapters/gemini-cli-adapter.js');
    const geminiAdapter = new GeminiCLIAdapter();
    const isAvailable = await geminiAdapter.isAvailable();
    
    if (!isAvailable) {
      console.log('⚠️  Gemini CLI недоступен, пропускаем тест');
      return;
    }

    // Создание конфигурации workflow
    const config = createSimpleWorkflow(
      'gemini-cli',
      'Ответь одним словом: какой сегодня день недели?',
      path.join(tempDir, 'artifacts')
    );

    // Сохранение конфигурации в файл
    configPath = path.join(tempDir, 'workflow.json');
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    // Выполнение workflow
    const state = await orchestrator.run(configPath);

    // Проверки
    expect(state.status).toBe('completed');
    expect(state.completedSteps).toHaveLength(1);
    expect(state.completedSteps).toContain('step1');
    expect(state.errors).toHaveLength(0);
    
    // Проверка что артефакт создан
    expect(state.artifacts).toHaveProperty('result');
    const artifactPath = state.artifacts['result'];
    const artifactExists = await fs.access(artifactPath).then(() => true).catch(() => false);
    expect(artifactExists).toBe(true);
    
    // Проверка что артефакт содержит непустой ответ
    const artifactContent = await fs.readFile(artifactPath, 'utf-8');
    expect(artifactContent.length).toBeGreaterThan(0);
  }, 60000); // Таймаут 60 секунд для реального API вызова

  /**
   * Тест 1.3.2: Проверка выполнения сложного workflow (5+ шагов с зависимостями)
   * Validates: Requirements 1.3
   */
  it('должен успешно выполнить сложный workflow с 5 шагами и зависимостями', async () => {
    // Проверяем доступность Gemini CLI
    const { GeminiCLIAdapter } = await import('../../src/adapters/gemini-cli-adapter.js');
    const geminiAdapter = new GeminiCLIAdapter();
    const isAvailable = await geminiAdapter.isAvailable();
    
    if (!isAvailable) {
      console.log('⚠️  Gemini CLI недоступен, пропускаем тест');
      return;
    }

    // Создание конфигурации workflow
    const config = createComplexWorkflow(
      'gemini-cli',
      path.join(tempDir, 'artifacts')
    );

    // Сохранение конфигурации в файл
    configPath = path.join(tempDir, 'workflow.json');
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    // Выполнение workflow
    const state = await orchestrator.run(configPath);

    // Проверки
    expect(state.status).toBe('completed');
    expect(state.completedSteps).toHaveLength(5);
    expect(state.completedSteps).toEqual(['step1', 'step2', 'step3', 'step4', 'step5']);
    expect(state.errors).toHaveLength(0);
    
    // Проверка что все артефакты созданы
    // Каждый шаг создает артефакт с ключом 'result'
    expect(state.artifacts).toHaveProperty('result');
    
    const artifactPath = state.artifacts['result'];
    const artifactExists = await fs.access(artifactPath).then(() => true).catch(() => false);
    expect(artifactExists).toBe(true);
    
    // Проверка что артефакт содержит непустой ответ
    const artifactContent = await fs.readFile(artifactPath, 'utf-8');
    expect(artifactContent.length).toBeGreaterThan(0);
    
    // Проверка истории выполнения
    expect(state.history).toHaveLength(5);
    
    // Проверка что шаги выполнялись в правильном порядке (с учетом зависимостей)
    const step1History = state.history.find(h => h.stepId === 'step1');
    const step2History = state.history.find(h => h.stepId === 'step2');
    const step3History = state.history.find(h => h.stepId === 'step3');
    const step4History = state.history.find(h => h.stepId === 'step4');
    const step5History = state.history.find(h => h.stepId === 'step5');
    
    expect(step1History).toBeDefined();
    expect(step2History).toBeDefined();
    expect(step3History).toBeDefined();
    expect(step4History).toBeDefined();
    expect(step5History).toBeDefined();
    
    // Проверка что каждый шаг начался после завершения предыдущего
    if (step1History && step2History) {
      expect(new Date(step2History.startedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(step1History.completedAt).getTime()
      );
    }
    if (step2History && step3History) {
      expect(new Date(step3History.startedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(step2History.completedAt).getTime()
      );
    }
    if (step3History && step4History) {
      expect(new Date(step4History.startedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(step3History.completedAt).getTime()
      );
    }
    if (step4History && step5History) {
      expect(new Date(step5History.startedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(step4History.completedAt).getTime()
      );
    }
  }, 300000); // Таймаут 5 минут для сложного workflow с реальными API вызовами

  /**
   * Тест 1.3.3: Проверка обработки таймаутов
   * Validates: Requirements 1.3
   */
  it('должен корректно обработать таймаут адаптера', async () => {
    // Проверяем доступность Gemini CLI
    const { GeminiCLIAdapter } = await import('../../src/adapters/gemini-cli-adapter.js');
    const geminiAdapter = new GeminiCLIAdapter();
    const isAvailable = await geminiAdapter.isAvailable();
    
    if (!isAvailable) {
      console.log('⚠️  Gemini CLI недоступен, пропускаем тест');
      return;
    }

    // Создание конфигурации workflow с очень коротким таймаутом
    const config: WorkflowConfig = {
      name: 'timeout-test-workflow',
      version: '1.0.0',
      description: 'Тестовый workflow для проверки таймаута',
      settings: {
        artifacts_dir: path.join(tempDir, 'artifacts'),
        default_adapter: 'gemini-cli',
        timeout: 100 // Очень короткий таймаут - 100мс
      },
      steps: [
        {
          id: 'step1',
          name: 'Шаг с таймаутом',
          type: 'model',
          adapter: 'gemini-cli',
          prompt_template: 'Напиши длинное эссе на 1000 слов о философии искусственного интеллекта',
          outputs: {
            result: 'step1_output.md'
          },
          timeout: 100 // Очень короткий таймаут на уровне шага
        }
      ]
    };

    // Сохранение конфигурации в файл
    configPath = path.join(tempDir, 'workflow.json');
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    // Выполнение workflow (ожидаем ошибку таймаута)
    try {
      await orchestrator.run(configPath);
      // Если не произошло ошибки, тест не пройден
      fail('Ожидалась ошибка таймаута, но workflow завершился успешно');
    } catch (error) {
      // Проверяем что это ошибка таймаута
      const errorMessage = (error as Error).message.toLowerCase();
      expect(
        errorMessage.includes('timeout') || 
        errorMessage.includes('таймаут') ||
        errorMessage.includes('timed out')
      ).toBe(true);
    }
  }, 60000); // Увеличенный таймаут 60 секунд для теста таймаута (Gemini CLI медленнее прерывается)
});
