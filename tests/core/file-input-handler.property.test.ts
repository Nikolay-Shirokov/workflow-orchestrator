/**
 * Property-based тесты для FileInputHandler
 * 
 * Feature: file-based-user-input
 * Проверяет корректность работы FileInputHandler на множестве входных данных
 */

import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as path from 'path';
import { FileInputHandler } from '../../src/core/file-input-handler.js';
import { TemplateGenerator } from '../../src/core/template-generator.js';
import { EditorManager } from '../../src/core/editor-manager.js';
import { UserInputHandler } from '../../src/core/user-input-handler.js';
import { Logger, LogLevel } from '../../src/core/logger.js';
import { WorkflowStep, ExecutionContext, WorkflowState } from '../../src/core/types.js';
import { DefaultArtifactManager } from '../../src/core/artifact-manager.js';
import { FileFormat } from '../../src/core/file-input-types.js';

describe.skip('FileInputHandler Property Tests', () => {
  let tempDir: string;
  
  beforeAll(async () => {
    tempDir = path.join(process.cwd(), 'tmp', `file-input-property-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
  });
  
  afterAll(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Игнорируем ошибки очистки
    }
  });
  
  /**
   * Property 3: Приостановка процесса с интерактивным меню
   * Feature: file-based-user-input, Property 3
   * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5
   * 
   * Для любого шага user_input с файловым вводом, после создания шаблона
   * процесс должен перейти в статус 'paused' и отобразить интерактивное меню
   */
  it('Property 3: должен приостановить процесс при выборе "postpone"', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          stepId: fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-z0-9-]+$/i.test(s)),
          stepName: fc.string({ minLength: 1, maxLength: 50 }),
          promptMessage: fc.string({ minLength: 1, maxLength: 200 }),
          fileFormat: fc.constantFrom<FileFormat>('markdown', 'yaml', 'json', 'text')
        }),
        async ({ stepId, stepName, promptMessage, fileFormat }) => {
          // Создаем уникальную временную директорию для каждого теста
          const testTempDir = path.join(tempDir, `test-${Date.now()}-${Math.random().toString(36).substring(7)}`);
          await fs.mkdir(testTempDir, { recursive: true });
          
          try {
            const logger = new Logger({
              level: LogLevel.ERROR,
              enableConsole: false,
              enableFile: false
            });
            
            const templateGenerator = new TemplateGenerator();
            const editorManager = new EditorManager(logger);
            const userInputHandler = new UserInputHandler();
            const fileInputHandler = new FileInputHandler(
              templateGenerator,
              editorManager,
              userInputHandler,
              logger
            );
            
            const artifactManager = new DefaultArtifactManager({
              baseDir: testTempDir,
              sessionDirTemplate: '',
              logger
            });
            
            const state: WorkflowState = {
              sessionId: 'test-session',
              workflowName: 'test-workflow',
              workflowVersion: '1.0.0',
              currentStep: stepId,
              status: 'running',
              startedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              completedSteps: [],
              artifacts: {},
              context: {},
              history: [],
              errors: []
            };
            
            const context: ExecutionContext = {
              state,
              adapters: {} as any,
              templateEngine: {} as any,
              artifactManager,
              logger
            };
            
            const step: WorkflowStep = {
              id: stepId,
              name: stepName,
              type: 'user_input',
              prompt_message: promptMessage,
              file_format: fileFormat
            };
            
            // Мокаем методы для избежания интерактивного ввода
            (fileInputHandler as any).openInEditor = jest.fn().mockResolvedValue(undefined);
            (fileInputHandler as any).waitForUserConfirmation = jest.fn().mockResolvedValue('postpone');
            
            const result = await fileInputHandler.handleFileInput(step, context);
            
            // Проверяем, что процесс приостановлен
            expect(result.success).toBe(false);
            expect(result.userCommand).toBe('postpone');
            expect(context.state.status).toBe('paused');
            
            // Проверяем, что файл был создан
            expect(result.filePath).toBeDefined();
            const fileExists = await fs.access(result.filePath).then(() => true).catch(() => false);
            expect(fileExists).toBe(true);
          } finally {
            // Очищаем временную директорию
            try {
              await fs.rm(testTempDir, { recursive: true, force: true });
            } catch (error) {
              // Игнорируем ошибки очистки
            }
          }
        }
      ),
      { numRuns: 10 } // Минимальное количество итераций для быстрого выполнения
    );
  }, 30000); // Увеличенный таймаут для property теста
  
  /**
   * Property 4: Обработка выбора в интерактивном меню
   * Feature: file-based-user-input, Property 4
   * Validates: Requirements 3.4, 3.5, 3.6, 3.7
   * 
   * Для любого выбора пользователя в интерактивном меню, система должна
   * корректно обработать выбор и выполнить соответствующее действие
   */
  it('Property 4: должен корректно обработать выбор пользователя', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          stepId: fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-z0-9-]+$/i.test(s)),
          userCommand: fc.constantFrom('continue', 'postpone')
        }),
        async ({ stepId, userCommand }) => {
          const testTempDir = path.join(tempDir, `test-${Date.now()}-${Math.random().toString(36).substring(7)}`);
          await fs.mkdir(testTempDir, { recursive: true });
          
          try {
            const logger = new Logger({
              level: LogLevel.ERROR,
              enableConsole: false,
              enableFile: false
            });
            
            const templateGenerator = new TemplateGenerator();
            const editorManager = new EditorManager(logger);
            const userInputHandler = new UserInputHandler();
            const fileInputHandler = new FileInputHandler(
              templateGenerator,
              editorManager,
              userInputHandler,
              logger
            );
            
            const artifactManager = new DefaultArtifactManager({
              baseDir: testTempDir,
              sessionDirTemplate: '',
              logger
            });
            
            const state: WorkflowState = {
              sessionId: 'test-session',
              workflowName: 'test-workflow',
              workflowVersion: '1.0.0',
              currentStep: stepId,
              status: 'running',
              startedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              completedSteps: [],
              artifacts: {},
              context: {},
              history: [],
              errors: []
            };
            
            const context: ExecutionContext = {
              state,
              adapters: {} as any,
              templateEngine: {} as any,
              artifactManager,
              logger
            };
            
            const step: WorkflowStep = {
              id: stepId,
              name: 'Test Step',
              type: 'user_input',
              prompt_message: 'Test prompt'
            };
            
            // Мокаем методы
            (fileInputHandler as any).openInEditor = jest.fn().mockResolvedValue(undefined);
            (fileInputHandler as any).waitForUserConfirmation = jest.fn().mockResolvedValue(userCommand);
            (fileInputHandler as any).readAndValidate = jest.fn().mockResolvedValue({
              format: 'markdown',
              data: { answer: 'test' },
              rawText: 'test'
            });
            
            const result = await fileInputHandler.handleFileInput(step, context);
            
            // Проверяем корректность обработки команды
            expect(result.userCommand).toBe(userCommand);
            
            if (userCommand === 'continue') {
              expect(result.success).toBe(true);
              expect(result.data).toBeDefined();
            } else {
              expect(result.success).toBe(false);
              expect(context.state.status).toBe('paused');
            }
          } finally {
            try {
              await fs.rm(testTempDir, { recursive: true, force: true });
            } catch (error) {
              // Игнорируем ошибки очистки
            }
          }
        }
      ),
      { numRuns: 10 }
    );
  }, 30000);
  
  /**
   * Property 5: Валидация ввода
   * Feature: file-based-user-input, Property 5
   * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5
   * 
   * Для любого заполненного файла, если данные не проходят валидацию,
   * система должна вернуть конкретные ошибки
   */
  it('Property 5: должен корректно валидировать данные', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          stepId: fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-z0-9-]+$/i.test(s)),
          hasValidData: fc.boolean()
        }),
        async ({ stepId, hasValidData }) => {
          const testTempDir = path.join(tempDir, `test-${Date.now()}-${Math.random().toString(36).substring(7)}`);
          await fs.mkdir(testTempDir, { recursive: true });
          
          try {
            const logger = new Logger({
              level: LogLevel.ERROR,
              enableConsole: false,
              enableFile: false
            });
            
            const userInputHandler = new UserInputHandler();
            
            const artifactManager = new DefaultArtifactManager({
              baseDir: testTempDir,
              sessionDirTemplate: '',
              logger
            });
            
            const state: WorkflowState = {
              sessionId: 'test-session',
              workflowName: 'test-workflow',
              workflowVersion: '1.0.0',
              currentStep: stepId,
              status: 'running',
              startedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              completedSteps: [],
              artifacts: {},
              context: {},
              history: [],
              errors: []
            };
            
            const context: ExecutionContext = {
              state,
              adapters: {} as any,
              templateEngine: {} as any,
              artifactManager,
              logger
            };
            
            const step: WorkflowStep = {
              id: stepId,
              name: 'Test Step',
              type: 'user_input',
              file_format: 'json',
              validation: [
                {
                  field: 'name',
                  required: true,
                  type: 'string'
                }
              ]
            };
            
            // Создаем тестовый файл с валидными или невалидными данными
            const testFilePath = path.join(testTempDir, 'test-input.json');
            const testData = hasValidData ? { name: 'John Doe' } : { age: 30 }; // age вместо name
            await fs.writeFile(testFilePath, JSON.stringify(testData), 'utf-8');
            
            const fileInputHandler = new FileInputHandler(
              new TemplateGenerator(),
              new EditorManager(logger),
              userInputHandler,
              logger
            );
            
            if (hasValidData) {
              // Валидные данные должны пройти валидацию
              const result = await (fileInputHandler as any).readAndValidate(testFilePath, step, context);
              expect(result.data).toEqual(testData);
            } else {
              // Невалидные данные должны вызвать ошибку
              // Мокаем askForRetry чтобы избежать интерактивного ввода
              (fileInputHandler as any).askForRetry = jest.fn().mockResolvedValue(false);
              
              await expect(
                (fileInputHandler as any).readAndValidate(testFilePath, step, context)
              ).rejects.toThrow();
            }
          } finally {
            try {
              await fs.rm(testTempDir, { recursive: true, force: true });
            } catch (error) {
              // Игнорируем ошибки очистки
            }
          }
        }
      ),
      { numRuns: 10 }
    );
  }, 30000);
});
