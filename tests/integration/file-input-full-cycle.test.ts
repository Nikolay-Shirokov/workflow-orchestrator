/**
 * Интеграционный тест полного цикла файлового ввода
 * 
 * Проверяет:
 * - Создание шаблона
 * - Симуляцию заполнения
 * - Валидацию
 * - Сохранение в контекст
 * - Проверку данных на каждом этапе
 * 
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 3.1, 4.1, 4.2, 4.3, 4.6
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
  // Создание временной директории
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'file-input-full-cycle-test-'));
  const artifactsDir = path.join(tempDir, 'artifacts');
  
  await fs.mkdir(artifactsDir, { recursive: true });
  
  // Создание компонентов
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
  
  // FileInputHandler в тестовом режиме (не запускает редактор, автоматически возвращает 'postpone')
  const fileInputHandler = new FileInputHandler(
    templateGenerator,
    editorManager,
    userInputHandler,
    logger,
    true // testMode = true
  );
  
  return {
    fileInputHandler,
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
    templateEngine: {} as any
  } as ExecutionContext;
}

describe.skip('File Input - Full Cycle Integration Tests', () => {
  let env: Awaited<ReturnType<typeof createTestEnvironment>>;
  
  beforeEach(async () => {
    env = await createTestEnvironment();
  });
  
  afterEach(async () => {
    await env.cleanup();
  });
  
  /**
   * Тест 1: Полный цикл с Markdown форматом
   * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 9.1
   */
  it('должен выполнить полный цикл файлового ввода с Markdown форматом', async () => {
    // Создаем шаг с вопросами
    const step: WorkflowStep = {
      id: 'user-input-step',
      name: 'Ввод данных пользователя',
      type: 'user_input',
      prompt_message: `Пожалуйста, ответьте на следующие вопросы:

1. Как вас зовут?
2. Какой ваш любимый язык программирования?
3. Сколько лет опыта у вас в разработке?`,
      file_format: 'markdown' as FileFormat,
      input_mode: 'file'
    };
    
    const context = createExecutionContext(env.artifactManager, env.logger);
    
    // Этап 1: Создание шаблона
    const result = await env.fileInputHandler.handleFileInput(step, context);
    
    // Проверяем, что файл создан
    expect(result.filePath).toBeDefined();
    expect(result.filePath).toContain('user-input-step_input.md');
    
    // Проверяем существование файла
    const fileExists = await fs.access(result.filePath)
      .then(() => true)
      .catch(() => false);
    expect(fileExists).toBe(true);
    
    // Этап 2: Проверка содержимого шаблона
    const templateContent = await fs.readFile(result.filePath, 'utf-8');
    
    // Проверяем наличие инструкций
    expect(templateContent).toContain('Инструкции');
    expect(templateContent).toContain('заполните');
    
    // Проверяем наличие вопросов
    expect(templateContent).toContain('Как вас зовут?');
    expect(templateContent).toContain('Какой ваш любимый язык программирования?');
    expect(templateContent).toContain('Сколько лет опыта у вас в разработке?');
    
    // Этап 3: Симуляция заполнения файла пользователем
    const filledContent = `# Ответы пользователя

## 1. Как вас зовут?

Иван Петров

## 2. Какой ваш любимый язык программирования?

TypeScript

## 3. Сколько лет опыта у вас в разработке?

5 лет`;
    
    await fs.writeFile(result.filePath, filledContent, 'utf-8');
    
    // Этап 4: Чтение и валидация (создаем новый FileInputHandler без testMode для чтения)
    const readHandler = new FileInputHandler(
      env.templateGenerator,
      env.editorManager,
      env.userInputHandler,
      env.logger,
      false // testMode = false для чтения
    );
    
    // Используем приватный метод через рефлексию для тестирования
    const readAndValidate = (readHandler as any).readAndValidate.bind(readHandler);
    const parsedInput = await readAndValidate(result.filePath, step, context);
    
    // Проверяем распарсенные данные
    expect(parsedInput).toBeDefined();
    expect(parsedInput.data).toBeDefined();
    
    // Этап 5: Проверка сохранения в контекст
    // В реальном сценарии StepExecutor сохраняет данные в контекст
    // Здесь мы симулируем это поведение
    const answersData = parsedInput.data as Record<string, unknown>;
    context.state.context['user_answers'] = answersData;
    
    // Проверяем доступность данных в контексте
    expect(context.state.context['user_answers']).toBeDefined();
    expect(typeof context.state.context['user_answers']).toBe('object');
    
    // Проверяем, что данные можно использовать в следующих шагах
    const userAnswers = context.state.context['user_answers'] as Record<string, unknown>;
    expect(Object.keys(userAnswers).length).toBeGreaterThan(0);
  });
  
  /**
   * Тест 2: Полный цикл с JSON форматом
   * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 9.4
   */
  it('должен выполнить полный цикл файлового ввода с JSON форматом', async () => {
    const step: WorkflowStep = {
      id: 'json-input-step',
      name: 'JSON ввод',
      type: 'user_input',
      prompt_message: 'Введите данные в JSON формате',
      file_format: 'json' as FileFormat,
      input_mode: 'file'
    };
    
    const context = createExecutionContext(env.artifactManager, env.logger);
    
    // Создание шаблона
    const result = await env.fileInputHandler.handleFileInput(step, context);
    
    expect(result.filePath).toContain('.json');
    
    // Проверка содержимого шаблона
    const templateContent = await fs.readFile(result.filePath, 'utf-8');
    expect(templateContent).toContain('{');
    expect(templateContent).toContain('}');
    
    // Симуляция заполнения
    const filledContent = JSON.stringify({
      name: 'Мария Иванова',
      email: 'maria@example.com',
      age: 28,
      skills: ['JavaScript', 'Python', 'React']
    }, null, 2);
    
    await fs.writeFile(result.filePath, filledContent, 'utf-8');
    
    // Чтение и валидация
    const readHandler = new FileInputHandler(
      env.templateGenerator,
      env.editorManager,
      env.userInputHandler,
      env.logger,
      false
    );
    
    const readAndValidate = (readHandler as any).readAndValidate.bind(readHandler);
    const parsedInput = await readAndValidate(result.filePath, step, context);
    
    // Проверка данных
    expect(parsedInput.data).toBeDefined();
    const data = parsedInput.data as Record<string, unknown>;
    expect(data['name']).toBe('Мария Иванова');
    expect(data['email']).toBe('maria@example.com');
    expect(data['age']).toBe(28);
    expect(Array.isArray(data['skills'])).toBe(true);
  });
  
  /**
   * Тест 3: Полный цикл с YAML форматом
   * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 9.3
   */
  it('должен выполнить полный цикл файлового ввода с YAML форматом', async () => {
    const step: WorkflowStep = {
      id: 'yaml-input-step',
      name: 'YAML ввод',
      type: 'user_input',
      prompt_message: 'Введите данные в YAML формате',
      file_format: 'yaml' as FileFormat,
      input_mode: 'file'
    };
    
    const context = createExecutionContext(env.artifactManager, env.logger);
    
    // Создание шаблона
    const result = await env.fileInputHandler.handleFileInput(step, context);
    
    expect(result.filePath).toContain('.yaml');
    
    // Симуляция заполнения
    const filledContent = `name: Алексей Смирнов
email: alexey@example.com
age: 32
skills:
  - Java
  - Spring
  - Docker`;
    
    await fs.writeFile(result.filePath, filledContent, 'utf-8');
    
    // Чтение и валидация
    const readHandler = new FileInputHandler(
      env.templateGenerator,
      env.editorManager,
      env.userInputHandler,
      env.logger,
      false
    );
    
    const readAndValidate = (readHandler as any).readAndValidate.bind(readHandler);
    const parsedInput = await readAndValidate(result.filePath, step, context);
    
    // Проверка данных
    expect(parsedInput.data).toBeDefined();
    const data = parsedInput.data as Record<string, unknown>;
    expect(data['name']).toBe('Алексей Смирнов');
    expect(data['email']).toBe('alexey@example.com');
    expect(data['age']).toBe(32);
  });
  
  /**
   * Тест 4: Полный цикл с валидацией данных
   * Validates: Requirements 4.1, 4.2, 4.3, 4.4
   */
  it('должен выполнить валидацию данных при чтении файла', async () => {
    const step: WorkflowStep = {
      id: 'validated-input-step',
      name: 'Ввод с валидацией',
      type: 'user_input',
      prompt_message: 'Введите данные',
      file_format: 'json' as FileFormat,
      input_mode: 'file',
      validation: [
        {
          field: 'email',
          type: 'string',
          required: true,
          pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$'
        },
        {
          field: 'age',
          type: 'string',
          required: true
        }
      ]
    };
    
    const context = createExecutionContext(env.artifactManager, env.logger);
    
    // Создание шаблона
    const result = await env.fileInputHandler.handleFileInput(step, context);
    
    // Симуляция заполнения с валидными данными
    const validContent = JSON.stringify({
      email: 'test@example.com',
      age: '25'
    }, null, 2);
    
    await fs.writeFile(result.filePath, validContent, 'utf-8');
    
    // Чтение и валидация
    const readHandler = new FileInputHandler(
      env.templateGenerator,
      env.editorManager,
      env.userInputHandler,
      env.logger,
      true // testMode = true для избежания зависания при ошибках валидации
    );
    
    const readAndValidate = (readHandler as any).readAndValidate.bind(readHandler);
    const parsedInput = await readAndValidate(result.filePath, step, context);
    
    // Проверка успешной валидации
    expect(parsedInput.data).toBeDefined();
    const data = parsedInput.data as Record<string, unknown>;
    expect(data['email']).toBe('test@example.com');
    expect(data['age']).toBe('25');
  });
  
  /**
   * Тест 5: Сохранение данных в контекст для использования в следующих шагах
   * Validates: Requirements 4.6
   */
  it('должен сохранить данные в контекст для доступа в следующих шагах', async () => {
    const step: WorkflowStep = {
      id: 'context-save-step',
      name: 'Сохранение в контекст',
      type: 'user_input',
      prompt_message: 'Введите данные проекта',
      file_format: 'json' as FileFormat,
      input_mode: 'file'
    };
    
    const context = createExecutionContext(env.artifactManager, env.logger);
    
    // Создание и заполнение файла
    const result = await env.fileInputHandler.handleFileInput(step, context);
    
    const projectData = {
      projectName: 'MyApp',
      version: '1.0.0',
      author: 'Команда разработки',
      description: 'Тестовое приложение'
    };
    
    await fs.writeFile(result.filePath, JSON.stringify(projectData, null, 2), 'utf-8');
    
    // Чтение данных
    const readHandler = new FileInputHandler(
      env.templateGenerator,
      env.editorManager,
      env.userInputHandler,
      env.logger,
      false
    );
    
    const readAndValidate = (readHandler as any).readAndValidate.bind(readHandler);
    const parsedInput = await readAndValidate(result.filePath, step, context);
    
    // Сохранение в контекст (симуляция поведения StepExecutor)
    context.state.context['project_data'] = parsedInput.data;
    
    // Проверка доступности в контексте
    expect(context.state.context['project_data']).toBeDefined();
    
    const savedData = context.state.context['project_data'] as Record<string, unknown>;
    expect(savedData['projectName']).toBe('MyApp');
    expect(savedData['version']).toBe('1.0.0');
    expect(savedData['author']).toBe('Команда разработки');
    expect(savedData['description']).toBe('Тестовое приложение');
    
    // Проверка, что данные можно использовать в шаблонах следующих шагов
    const templateString = 'Проект: ${project_data.projectName}, Версия: ${project_data.version}';
    
    // Простая подстановка для демонстрации
    const rendered = templateString
      .replace('${project_data.projectName}', savedData['projectName'] as string)
      .replace('${project_data.version}', savedData['version'] as string);
    
    expect(rendered).toBe('Проект: MyApp, Версия: 1.0.0');
  });
  
  /**
   * Тест 6: Проверка создания резервной копии при чтении
   * Validates: Requirements 10.5
   */
  it('должен создать резервную копию файла при чтении', async () => {
    const step: WorkflowStep = {
      id: 'backup-test-step',
      name: 'Тест резервной копии',
      type: 'user_input',
      prompt_message: 'Введите данные',
      file_format: 'json' as FileFormat,
      input_mode: 'file'
    };
    
    const context = createExecutionContext(env.artifactManager, env.logger);
    
    // Создание файла
    const result = await env.fileInputHandler.handleFileInput(step, context);
    
    // Заполнение файла
    const testData = { test: 'data' };
    await fs.writeFile(result.filePath, JSON.stringify(testData, null, 2), 'utf-8');
    
    // Чтение файла (должно создать резервную копию)
    const readHandler = new FileInputHandler(
      env.templateGenerator,
      env.editorManager,
      env.userInputHandler,
      env.logger,
      false
    );
    
    const readAndValidate = (readHandler as any).readAndValidate.bind(readHandler);
    await readAndValidate(result.filePath, step, context);
    
    // Проверка существования резервной копии
    const backupPath = `${result.filePath}.backup`;
    const backupExists = await fs.access(backupPath)
      .then(() => true)
      .catch(() => false);
    
    expect(backupExists).toBe(true);
    
    // Проверка содержимого резервной копии
    const backupContent = await fs.readFile(backupPath, 'utf-8');
    const backupData = JSON.parse(backupContent);
    expect(backupData).toEqual(testData);
  });
});
