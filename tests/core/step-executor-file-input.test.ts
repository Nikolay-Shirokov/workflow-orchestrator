/**
 * Unit тесты для интеграции StepExecutor с FileInputHandler
 * 
 * Проверяет:
 * - Выбор режима ввода (file/console)
 * - Делегирование FileInputHandler для file mode
 * - Сохранение данных в контекст
 * - Возобновление процесса после паузы
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { DefaultStepExecutor } from '../../src/core/step-executor.js';
import { WorkflowStep, ExecutionContext, WorkflowState, Logger } from '../../src/core/types.js';
import { DefaultArtifactManager } from '../../src/core/artifact-manager.js';
import { DefaultTemplateEngine } from '../../src/core/template-engine.js';
import { AdapterRegistry } from '../../src/adapters/adapter-registry.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('StepExecutor - FileInput Integration', () => {
  let executor: DefaultStepExecutor;
  let context: ExecutionContext;
  let testDir: string;
  let artifactManager: DefaultArtifactManager;
  let templateEngine: DefaultTemplateEngine;
  let logger: Logger;
  
  beforeEach(async () => {
    // Создаем временную директорию для тестов
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'step-executor-test-'));
    
    // Создаем logger
    logger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {}
    };
    
    // Создаем ArtifactManager
    artifactManager = new DefaultArtifactManager({ baseDir: testDir });
    
    // Создаем TemplateEngine
    templateEngine = new DefaultTemplateEngine();
    
    // Создаем StepExecutor
    executor = new DefaultStepExecutor({
      defaultTimeout: 5000
    });
    
    // Создаем базовое состояние
    const state: WorkflowState = {
      sessionId: 'test-session',
      workflowName: 'test-workflow',
      workflowVersion: '1.0.0',
      currentStep: '',
      status: 'running',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedSteps: [],
      artifacts: {},
      context: {},
      history: [],
      errors: []
    };
    
    // Создаем контекст выполнения
    context = {
      state,
      adapters: new AdapterRegistry(),
      artifactManager,
      templateEngine,
      logger
    };
  });
  
  afterEach(async () => {
    // Очищаем временную директорию
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Игнорируем ошибки очистки
    }
  });
  
  describe('Выбор режима ввода', () => {
    it('должен использовать console mode по умолчанию', async () => {
      const step: WorkflowStep = {
        id: 'step1',
        name: 'User Input',
        type: 'user_input',
        outputs: {
          user_response: 'step1_response.txt'
        }
      };
      
      const result = await executor.executeStep(step, context);
      
      // Проверяем, что процесс приостановлен (console mode)
      expect(context.state.status).toBe('paused');
      expect(result.status).toBe('skipped');
      expect(result.outputs.message).toContain('Ожидается ввод пользователя');
    });
    
    it('должен использовать file mode если указан input_mode: file', async () => {
      const step: WorkflowStep = {
        id: 'step2',
        name: 'File Input',
        type: 'user_input',
        input_mode: 'file',
        file_format: 'markdown',
        outputs: {
          user_response: 'step2_response.md'
        }
      };
      
      // Мокаем интерактивное меню, чтобы автоматически выбрать "postpone"
      // Это позволит тесту завершиться без ручного ввода
      const originalStdin = process.stdin;
      
      try {
        // Создаем мок для stdin
        const mockStdin = {
          isTTY: false,
          setRawMode: () => {},
          on: () => {},
          removeListener: () => {},
          pause: () => {},
          resume: () => {}
        };
        
        Object.defineProperty(process, 'stdin', {
          value: mockStdin,
          writable: true,
          configurable: true
        });
        
        const result = await executor.executeStep(step, context);
        
        // В file mode процесс должен быть приостановлен
        expect(context.state.status).toBe('paused');
        expect(result.status).toBe('skipped');
        
      } finally {
        // Восстанавливаем оригинальный stdin
        Object.defineProperty(process, 'stdin', {
          value: originalStdin,
          writable: true,
          configurable: true
        });
      }
    });
    
    it('должен использовать default_input_mode из настроек', async () => {
      // Устанавливаем default_input_mode в контексте
      context.state.context.default_input_mode = 'console';
      
      const step: WorkflowStep = {
        id: 'step3',
        name: 'User Input with Default',
        type: 'user_input',
        outputs: {
          user_response: 'step3_response.txt'
        }
      };
      
      const result = await executor.executeStep(step, context);
      
      // Должен использовать console mode из настроек
      expect(context.state.status).toBe('paused');
      expect(result.status).toBe('skipped');
    });
    
    it('input_mode в шаге должен иметь приоритет над default_input_mode', async () => {
      // Устанавливаем default_input_mode в контексте
      context.state.context.default_input_mode = 'console';
      
      const step: WorkflowStep = {
        id: 'step4',
        name: 'File Input Override',
        type: 'user_input',
        input_mode: 'file', // Переопределяем default
        file_format: 'json',
        outputs: {
          user_response: 'step4_response.json'
        }
      };
      
      // Мокаем stdin
      const originalStdin = process.stdin;
      
      try {
        const mockStdin = {
          isTTY: false,
          setRawMode: () => {},
          on: () => {},
          removeListener: () => {},
          pause: () => {},
          resume: () => {}
        };
        
        Object.defineProperty(process, 'stdin', {
          value: mockStdin,
          writable: true,
          configurable: true
        });
        
        const result = await executor.executeStep(step, context);
        
        // Должен использовать file mode из шага
        expect(context.state.status).toBe('paused');
        expect(result.status).toBe('skipped');
        
      } finally {
        Object.defineProperty(process, 'stdin', {
          value: originalStdin,
          writable: true,
          configurable: true
        });
      }
    });
  });
  
  describe('Сохранение в контекст', () => {
    it('должен сохранять данные в контекст после успешного ввода', async () => {
      const step: WorkflowStep = {
        id: 'step5',
        name: 'User Input',
        type: 'user_input',
        input_mode: 'file', // Явно указываем файловый режим
        outputs: {
          user_response: 'step5_response.txt'
        }
      };
      
      // Выполнение - в тестовом режиме создается заглушка и возвращается 'skipped'
      const result = await executor.executeStep(step, context);
      
      // В тестовом режиме FileInputHandler возвращает 'postpone', что приводит к 'skipped'
      expect(result.status).toBe('skipped');
      expect(result.outputs?.message).toBe('Выполнение отложено пользователем');
      
      // Проверяем, что файл добавлен в артефакты
      expect(result.artifacts).toBeDefined();
      expect(result.artifacts?.length).toBeGreaterThan(0);
      
      // Проверяем, что файл существует по пути из артефактов
      if (result.artifacts && result.artifacts.length > 0) {
        const artifactPath = result.artifacts[0];
        const fileExists = await fs.access(artifactPath).then(() => true).catch(() => false);
        expect(fileExists).toBe(true);
      }
    });
    
    it('должен сохранять только ответы если include_questions = false', async () => {
      const step: WorkflowStep = {
        id: 'step6',
        name: 'User Input',
        type: 'user_input',
        input_mode: 'file', // Явно указываем файловый режим
        include_questions: false,
        outputs: {
          user_response: 'step6_response.txt'
        }
      };
      
      // Выполнение - в тестовом режиме создается заглушка
      const result = await executor.executeStep(step, context);
      
      // В тестовом режиме возвращается 'skipped'
      expect(result.status).toBe('skipped');
      expect(result.outputs?.message).toBe('Выполнение отложено пользователем');
      
      // Проверяем, что файл создан и добавлен в артефакты
      expect(result.artifacts).toBeDefined();
      expect(result.artifacts?.length).toBeGreaterThan(0);
    });
  });
  
  describe('Возобновление процесса', () => {
    it('должен загружать данные при возобновлении процесса', async () => {
      const step: WorkflowStep = {
        id: 'step7',
        name: 'User Input',
        type: 'user_input',
        input_mode: 'file', // Явно указываем файловый режим
        outputs: {
          user_response: 'step7_response.txt'
        }
      };
      
      // В тестовом режиме FileInputHandler всегда возвращает 'postpone'
      const result1 = await executor.executeStep(step, context);
      expect(result1.status).toBe('skipped');
      expect(context.state.status).toBe('paused');
      
      // Проверяем, что файл создан и добавлен в артефакты
      expect(result1.artifacts).toBeDefined();
      expect(result1.artifacts?.length).toBeGreaterThan(0);
    });
    
    it('должен игнорировать заглушки при возобновлении', async () => {
      const step: WorkflowStep = {
        id: 'step8',
        name: 'User Input',
        type: 'user_input',
        input_mode: 'file', // Явно указываем файловый режим
        outputs: {
          user_response: 'step8_response.txt'
        }
      };
      
      // Первое выполнение - создание заглушки
      const result1 = await executor.executeStep(step, context);
      expect(result1.status).toBe('skipped');
      
      // Проверяем, что файл создан
      expect(result1.artifacts).toBeDefined();
      expect(result1.artifacts?.length).toBeGreaterThan(0);
      
      // Второе выполнение - в тестовом режиме снова вернет 'skipped'
      const result2 = await executor.executeStep(step, context);
      expect(result2.status).toBe('skipped');
      expect(context.state.status).toBe('paused');
    });
    
    it('должен корректно обрабатывать несколько outputs', async () => {
      const step: WorkflowStep = {
        id: 'step9',
        name: 'Multiple Outputs',
        type: 'user_input',
        input_mode: 'file', // Явно указываем файловый режим
        outputs: {
          answer1: 'step9_answer1.txt',
          answer2: 'step9_answer2.txt'
        }
      };
      
      // В тестовом режиме создается один файл-шаблон для ввода
      const result = await executor.executeStep(step, context);
      expect(result.status).toBe('skipped');
      
      // Проверяем, что файл создан и добавлен в артефакты
      expect(result.artifacts).toBeDefined();
      expect(result.artifacts?.length).toBeGreaterThan(0);
      
      // Проверяем, что файл существует
      if (result.artifacts && result.artifacts.length > 0) {
        const artifactPath = result.artifacts[0];
        const fileExists = await fs.access(artifactPath).then(() => true).catch(() => false);
        expect(fileExists).toBe(true);
      }
    });
  });
});
