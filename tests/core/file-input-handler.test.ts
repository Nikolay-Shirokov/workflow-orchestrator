/**
 * Unit тесты для FileInputHandler
 * 
 * Проверяет функциональность обработчика файлового ввода
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { FileInputHandler } from '../../src/core/file-input-handler.js';
import { TemplateGenerator } from '../../src/core/template-generator.js';
import { EditorManager } from '../../src/core/editor-manager.js';
import { UserInputHandler } from '../../src/core/user-input-handler.js';
import { Logger, LogLevel } from '../../src/core/logger.js';
import { WorkflowStep, ExecutionContext, WorkflowState } from '../../src/core/types.js';
import { DefaultArtifactManager } from '../../src/core/artifact-manager.js';

describe('FileInputHandler Unit Tests', () => {
  let fileInputHandler: FileInputHandler;
  let templateGenerator: TemplateGenerator;
  let editorManager: EditorManager;
  let userInputHandler: UserInputHandler;
  let logger: Logger;
  let context: ExecutionContext;
  let tempDir: string;
  
  beforeEach(async () => {
    // Создаем временную директорию для тестов
    tempDir = path.join(process.cwd(), 'tmp', `file-input-test-${Date.now()}-${Math.random().toString(36).substring(7)}`);
    await fs.mkdir(tempDir, { recursive: true });
    
    // Инициализируем зависимости
    logger = new Logger({
      level: LogLevel.ERROR,
      enableConsole: false,
      enableFile: false
    });
    
    templateGenerator = new TemplateGenerator();
    editorManager = new EditorManager(logger);
    userInputHandler = new UserInputHandler();
    
    fileInputHandler = new FileInputHandler(
      templateGenerator,
      editorManager,
      userInputHandler,
      logger
    );
    
    // Создаем mock контекст
    const artifactManager = new DefaultArtifactManager({
      baseDir: tempDir,
      sessionDirTemplate: '',
      logger
    });
    
    const state: WorkflowState = {
      sessionId: 'test-session',
      workflowName: 'test-workflow',
      workflowVersion: '1.0.0',
      currentStep: 'test-step',
      status: 'running',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedSteps: [],
      artifacts: {},
      context: {},
      history: [],
      errors: []
    };
    
    context = {
      state,
      adapters: {} as any,
      templateEngine: {} as any,
      artifactManager,
      logger
    };
  });
  
  afterEach(async () => {
    // Очищаем временную директорию
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Игнорируем ошибки очистки
    }
  });
  
  describe('handleFileInput', () => {
    it('должен создать файл-шаблон и вернуть результат', async () => {
      const step: WorkflowStep = {
        id: 'test-step',
        name: 'Test Step',
        type: 'user_input',
        prompt_message: 'Test prompt',
        file_format: 'markdown'
      };
      
      // Мокаем методы для избежания интерактивного ввода
      const originalOpenInEditor = (fileInputHandler as any).openInEditor;
      const originalWaitForUserConfirmation = (fileInputHandler as any).waitForUserConfirmation;
      const originalReadAndValidate = (fileInputHandler as any).readAndValidate;
      
      (fileInputHandler as any).openInEditor = jest.fn().mockResolvedValue(undefined);
      (fileInputHandler as any).waitForUserConfirmation = jest.fn().mockResolvedValue('continue');
      (fileInputHandler as any).readAndValidate = jest.fn().mockResolvedValue({
        format: 'markdown',
        data: { answer: 'test answer' },
        rawText: 'test content'
      });
      
      try {
        const result = await fileInputHandler.handleFileInput(step, context);
        
        expect(result.success).toBe(true);
        expect(result.filePath).toBeDefined();
        expect(result.userCommand).toBe('continue');
        expect(result.data).toEqual({ answer: 'test answer' });
        
        // Проверяем, что файл был создан
        const fileExists = await fs.access(result.filePath).then(() => true).catch(() => false);
        expect(fileExists).toBe(true);
      } finally {
        // Восстанавливаем оригинальные методы
        (fileInputHandler as any).openInEditor = originalOpenInEditor;
        (fileInputHandler as any).waitForUserConfirmation = originalWaitForUserConfirmation;
        (fileInputHandler as any).readAndValidate = originalReadAndValidate;
      }
    });
    
    it('должен обработать команду "postpone"', async () => {
      const step: WorkflowStep = {
        id: 'test-step',
        name: 'Test Step',
        type: 'user_input',
        prompt_message: 'Test prompt'
      };
      
      // Мокаем методы
      const originalOpenInEditor = (fileInputHandler as any).openInEditor;
      const originalWaitForUserConfirmation = (fileInputHandler as any).waitForUserConfirmation;
      
      (fileInputHandler as any).openInEditor = jest.fn().mockResolvedValue(undefined);
      (fileInputHandler as any).waitForUserConfirmation = jest.fn().mockResolvedValue('postpone');
      
      try {
        const result = await fileInputHandler.handleFileInput(step, context);
        
        expect(result.success).toBe(false);
        expect(result.userCommand).toBe('postpone');
        expect(context.state.status).toBe('paused');
      } finally {
        // Восстанавливаем оригинальные методы
        (fileInputHandler as any).openInEditor = originalOpenInEditor;
        (fileInputHandler as any).waitForUserConfirmation = originalWaitForUserConfirmation;
      }
    });
  });
  
  describe('createTemplateFile', () => {
    it('должен создать файл-шаблон в формате markdown', async () => {
      const step: WorkflowStep = {
        id: 'test-step',
        name: 'Test Step',
        type: 'user_input',
        prompt_message: 'Test prompt',
        file_format: 'markdown'
      };
      
      const filePath = await (fileInputHandler as any).createTemplateFile(step, context);
      
      expect(filePath).toBeDefined();
      expect(filePath).toContain('.md');
      
      // Проверяем, что файл существует
      const fileExists = await fs.access(filePath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);
      
      // Проверяем содержимое
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toContain('Test Step');
      expect(content).toContain('Test prompt');
    });
    
    it('должен создать файл-шаблон в формате yaml', async () => {
      const step: WorkflowStep = {
        id: 'test-step',
        name: 'Test Step',
        type: 'user_input',
        prompt_message: 'Test prompt',
        file_format: 'yaml'
      };
      
      const filePath = await (fileInputHandler as any).createTemplateFile(step, context);
      
      expect(filePath).toContain('.yaml');
      
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toContain('Test Step');
    });
    
    it('должен создать файл-шаблон в формате json', async () => {
      const step: WorkflowStep = {
        id: 'test-step',
        name: 'Test Step',
        type: 'user_input',
        prompt_message: 'Test prompt',
        file_format: 'json'
      };
      
      const filePath = await (fileInputHandler as any).createTemplateFile(step, context);
      
      expect(filePath).toContain('.json');
      
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed._comment).toContain('Test Step');
    });
    
    it('должен создать файл-шаблон в формате text', async () => {
      const step: WorkflowStep = {
        id: 'test-step',
        name: 'Test Step',
        type: 'user_input',
        prompt_message: 'Test prompt',
        file_format: 'text'
      };
      
      const filePath = await (fileInputHandler as any).createTemplateFile(step, context);
      
      expect(filePath).toContain('.txt');
      
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toContain('TEST STEP');
    });
  });
  
  describe('readAndValidate', () => {
    it('должен прочитать и провалидировать корректный файл', async () => {
      const step: WorkflowStep = {
        id: 'test-step',
        name: 'Test Step',
        type: 'user_input',
        file_format: 'json'
      };
      
      // Создаем тестовый файл
      const testFilePath = path.join(tempDir, 'test-input.json');
      const testData = { answer: 'test answer' };
      await fs.writeFile(testFilePath, JSON.stringify(testData), 'utf-8');
      
      const result = await (fileInputHandler as any).readAndValidate(testFilePath, step, context);
      
      expect(result.format).toBe('json');
      expect(result.data).toEqual(testData);
    });
    
    it('должен выбросить ошибку если файл не найден', async () => {
      const step: WorkflowStep = {
        id: 'test-step',
        name: 'Test Step',
        type: 'user_input'
      };
      
      const nonExistentPath = path.join(tempDir, 'non-existent.txt');
      
      await expect(
        (fileInputHandler as any).readAndValidate(nonExistentPath, step, context)
      ).rejects.toThrow();
    });
    
    it('должен провалидировать данные согласно правилам', async () => {
      const step: WorkflowStep = {
        id: 'test-step',
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
      
      // Создаем файл с валидными данными
      const testFilePath = path.join(tempDir, 'test-valid.json');
      const testData = { name: 'John Doe' };
      await fs.writeFile(testFilePath, JSON.stringify(testData), 'utf-8');
      
      const result = await (fileInputHandler as any).readAndValidate(testFilePath, step, context);
      
      expect(result.data).toEqual(testData);
    });
  });
  
  describe('getFileExtension', () => {
    it('должен вернуть правильное расширение для markdown', () => {
      const ext = (fileInputHandler as any).getFileExtension('markdown');
      expect(ext).toBe('.md');
    });
    
    it('должен вернуть правильное расширение для yaml', () => {
      const ext = (fileInputHandler as any).getFileExtension('yaml');
      expect(ext).toBe('.yaml');
    });
    
    it('должен вернуть правильное расширение для json', () => {
      const ext = (fileInputHandler as any).getFileExtension('json');
      expect(ext).toBe('.json');
    });
    
    it('должен вернуть правильное расширение для text', () => {
      const ext = (fileInputHandler as any).getFileExtension('text');
      expect(ext).toBe('.txt');
    });
  });
  
  describe('getInputFormat', () => {
    it('должен преобразовать FileFormat в InputFormat', () => {
      expect((fileInputHandler as any).getInputFormat('markdown')).toBe('markdown');
      expect((fileInputHandler as any).getInputFormat('yaml')).toBe('yaml');
      expect((fileInputHandler as any).getInputFormat('json')).toBe('json');
      expect((fileInputHandler as any).getInputFormat('text')).toBe('text');
    });
  });
});
