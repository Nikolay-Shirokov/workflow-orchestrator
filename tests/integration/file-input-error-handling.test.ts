/**
 * Интеграционный тест обработки ошибок при файловом вводе
 * 
 * Проверяет:
 * - Симуляцию различных ошибок
 * - Проверку стратегий восстановления
 * - Проверку сохранения состояния при ошибках
 * 
 * Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { FileInputHandler } from '../../src/core/file-input-handler.js';
import { TemplateGenerator } from '../../src/core/template-generator.js';
import { EditorManager } from '../../src/core/editor-manager.js';
import { UserInputHandler } from '../../src/core/user-input-handler.js';
import { DefaultArtifactManager } from '../../src/core/artifact-manager.js';
import { Logger, LogLevel } from '../../src/core/logger.js';
import { WorkflowStep, ExecutionContext, WorkflowState } from '../../src/core/types.js';
import { FileFormat } from '../../src/core/file-input-types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

/**
 * Создание тестового окружения
 */
async function createTestEnvironment() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'file-input-error-test-'));
  const artifactsDir = path.join(tempDir, 'artifacts');
  
  await fs.mkdir(artifactsDir, { recursive: true });
  
  const logger = new Logger({
    level: LogLevel.ERROR,
    enableConsole: false,
    enableFile: false
  });
  
  const templateGenerator = new TemplateGenerator();
  const editorManager = new EditorManager(logger);
  const userInputHandler = new UserInputHandler();
  const artifactManager = new DefaultArtifactManager({
    baseDir: artifactsDir,
    logger
  });
  
  return {
    templateGenerator,
    editorManager,
    userInputHandler,
    artifactManager,
    logger,
    tempDir,
    artifactsDir,
    cleanup: async () => {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (error) {
        // Игнорируем ошибки очистки
      }
    }
  };
}

/**
 * Создание тестового контекста выполнения
 */
function createExecutionContext(
  artifactManager: DefaultArtifactManager,
  logger: Logger,
  sessionId: string = 'test-session'
): ExecutionContext {
  const state: WorkflowState = {
    sessionId,
    workflowName: 'test-workflow',
    workflowVersion: '1.0.0',
    status: 'running',
    currentStep: 'test-step',
    completedSteps: [],
    context: {},
    artifacts: {},
    history: [],
    errors: [],
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  return {
    state,
    artifactManager,
    logger,
    adapters: {} as any,
    templateEngine: { render: (template: string) => template } as any
  } as ExecutionContext;
}

describe('File Input - Error Handling Integration Tests', () => {
  let env: Awaited<ReturnType<typeof createTestEnvironment>>;
  
  beforeEach(async () => {
    env = await createTestEnvironment();
  });
  
  afterEach(async () => {
    await env.cleanup();
  });
  
  /**
   * Тест 1: Обработка удаленного файла
   * Validates: Requirements 10.3
   */
  it('должен обработать ситуацию когда файл был удален', async () => {
    const step: WorkflowStep = {
      id: 'deleted-file-step',
      name: 'Тест удаленного файла',
      type: 'user_input',
      prompt_message: 'Введите данные',
      file_format: 'json' as FileFormat,
      input_mode: 'file'
    };
    
    const context = createExecutionContext(env.artifactManager, env.logger);
    
    const fileInputHandler = new FileInputHandler(
      env.templateGenerator,
      env.editorManager,
      env.userInputHandler,
      env.logger,
      true
    );
    
    // Создаем файл
    const result = await fileInputHandler.handleFileInput(step, context);
    expect(result.filePath).toBeDefined();
    
    // Проверяем, что файл существует
    const fileExists1 = await fs.access(result.filePath)
      .then(() => true)
      .catch(() => false);
    expect(fileExists1).toBe(true);
    
    // Удаляем файл
    await fs.unlink(result.filePath);
    
    // Проверяем, что файл удален
    const fileExists2 = await fs.access(result.filePath)
      .then(() => true)
      .catch(() => false);
    expect(fileExists2).toBe(false);
    
    // В тестовом режиме система автоматически восстанавливает файл из резервной копии
    const readHandler = new FileInputHandler(
      env.templateGenerator,
      env.editorManager,
      env.userInputHandler,
      env.logger,
      true // testMode - автоматически восстанавливает из резервной копии
    );
    
    const readAndValidate = (readHandler as any).readAndValidate.bind(readHandler);
    
    // Чтение должно успешно восстановить файл из резервной копии
    const data = await readAndValidate(result.filePath, step, context);
    expect(data).toBeDefined();
    
    // Проверяем, что файл был восстановлен
    const fileExists3 = await fs.access(result.filePath)
      .then(() => true)
      .catch(() => false);
    expect(fileExists3).toBe(true);
  });
  
  /**
   * Тест 2: Обработка некорректных данных в файле
   * Validates: Requirements 10.4
   */
  it('должен обработать некорректные данные в файле', async () => {
    const step: WorkflowStep = {
      id: 'invalid-data-step',
      name: 'Тест некорректных данных',
      type: 'user_input',
      prompt_message: 'Введите данные',
      file_format: 'json' as FileFormat,
      input_mode: 'file',
      validation: [
        {
          field: 'email',
          type: 'string',
          required: true
        }
      ]
    };
    
    const context = createExecutionContext(env.artifactManager, env.logger);
    
    const fileInputHandler = new FileInputHandler(
      env.templateGenerator,
      env.editorManager,
      env.userInputHandler,
      env.logger,
      true
    );
    
    // Создаем файл
    const result = await fileInputHandler.handleFileInput(step, context);
    
    // Заполняем файл некорректными данными (отсутствует обязательное поле)
    const invalidData = {
      name: 'Test User'
      // email отсутствует
    };
    
    await fs.writeFile(result.filePath, JSON.stringify(invalidData, null, 2), 'utf-8');
    
    // Попытка чтения должна вызвать ошибку валидации
    const readHandler = new FileInputHandler(
      env.templateGenerator,
      env.editorManager,
      env.userInputHandler,
      env.logger,
      true // testMode для избежания зависания
    );
    
    const readAndValidate = (readHandler as any).readAndValidate.bind(readHandler);
    
    await expect(readAndValidate(result.filePath, step, context)).rejects.toThrow();
  });
  
  /**
   * Тест 3: Обработка некорректного JSON
   * Validates: Requirements 10.4
   */
  it('должен обработать некорректный JSON в файле', async () => {
    const step: WorkflowStep = {
      id: 'invalid-json-step',
      name: 'Тест некорректного JSON',
      type: 'user_input',
      prompt_message: 'Введите данные',
      file_format: 'json' as FileFormat,
      input_mode: 'file'
    };
    
    const context = createExecutionContext(env.artifactManager, env.logger);
    
    const fileInputHandler = new FileInputHandler(
      env.templateGenerator,
      env.editorManager,
      env.userInputHandler,
      env.logger,
      true
    );
    
    // Создаем файл
    const result = await fileInputHandler.handleFileInput(step, context);
    
    // Записываем некорректный JSON
    const invalidJSON = '{ "name": "Test", invalid json }';
    await fs.writeFile(result.filePath, invalidJSON, 'utf-8');
    
    // Попытка чтения должна вызвать ошибку парсинга
    const readHandler = new FileInputHandler(
      env.templateGenerator,
      env.editorManager,
      env.userInputHandler,
      env.logger,
      false
    );
    
    const readAndValidate = (readHandler as any).readAndValidate.bind(readHandler);
    
    await expect(readAndValidate(result.filePath, step, context)).rejects.toThrow();
  });
  
  /**
   * Тест 4: Сохранение резервной копии при ошибке
   * Validates: Requirements 10.5
   */
  it('должен создать резервную копию перед чтением файла', async () => {
    const step: WorkflowStep = {
      id: 'backup-step',
      name: 'Тест резервной копии',
      type: 'user_input',
      prompt_message: 'Введите данные',
      file_format: 'json' as FileFormat,
      input_mode: 'file'
    };
    
    const context = createExecutionContext(env.artifactManager, env.logger);
    
    const fileInputHandler = new FileInputHandler(
      env.templateGenerator,
      env.editorManager,
      env.userInputHandler,
      env.logger,
      true
    );
    
    // Создаем файл
    const result = await fileInputHandler.handleFileInput(step, context);
    
    // Заполняем файл валидными данными
    const validData = { name: 'Test User', email: 'test@example.com' };
    await fs.writeFile(result.filePath, JSON.stringify(validData, null, 2), 'utf-8');
    
    // Читаем файл (должна создаться резервная копия)
    const readHandler = new FileInputHandler(
      env.templateGenerator,
      env.editorManager,
      env.userInputHandler,
      env.logger,
      false
    );
    
    const readAndValidate = (readHandler as any).readAndValidate.bind(readHandler);
    await readAndValidate(result.filePath, step, context);
    
    // Проверяем существование резервной копии
    const backupPath = `${result.filePath}.backup`;
    const backupExists = await fs.access(backupPath)
      .then(() => true)
      .catch(() => false);
    
    expect(backupExists).toBe(true);
    
    // Проверяем содержимое резервной копии
    const backupContent = await fs.readFile(backupPath, 'utf-8');
    const backupData = JSON.parse(backupContent);
    expect(backupData).toEqual(validData);
  });
  
  /**
   * Тест 5: Обработка недоступного редактора
   * Validates: Requirements 10.2
   */
  it('должен обработать недоступный редактор', async () => {
    const step: WorkflowStep = {
      id: 'unavailable-editor-step',
      name: 'Тест недоступного редактора',
      type: 'user_input',
      prompt_message: 'Введите данные',
      file_format: 'markdown' as FileFormat,
      input_mode: 'file',
      editor: {
        command: 'nonexistent-editor-12345',
        wait: true
      }
    };
    
    const context = createExecutionContext(env.artifactManager, env.logger);
    
    // FileInputHandler в тестовом режиме для избежания зависания
    const fileInputHandler = new FileInputHandler(
      env.templateGenerator,
      env.editorManager,
      env.userInputHandler,
      env.logger,
      true
    );
    
    // Создание файла с недоступным редактором не должно вызывать ошибку
    // Система должна продолжить работу и вывести путь к файлу
    const result = await fileInputHandler.handleFileInput(step, context);
    
    // Проверяем, что файл создан несмотря на недоступный редактор
    expect(result.filePath).toBeDefined();
    
    const fileExists = await fs.access(result.filePath)
      .then(() => true)
      .catch(() => false);
    expect(fileExists).toBe(true);
  });
});
