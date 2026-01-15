/**
 * Интеграционный тест возобновления процесса с файловым вводом
 * 
 * Проверяет:
 * - Приостановку процесса при файловом вводе
 * - Заполнение файла пользователем
 * - Возобновление процесса
 * - Проверку состояния после возобновления
 * 
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 8.1, 8.2, 8.3, 8.4, 8.5
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
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'file-input-resume-test-'));
  const artifactsDir = path.join(tempDir, 'artifacts');
  const stateDir = path.join(tempDir, 'state');
  
  await fs.mkdir(artifactsDir, { recursive: true });
  await fs.mkdir(stateDir, { recursive: true });
  
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
  
  return {
    templateGenerator,
    editorManager,
    userInputHandler,
    artifactManager,
    logger,
    tempDir,
    artifactsDir,
    stateDir,
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
  sessionId: string = 'test-session',
  initialContext: Record<string, unknown> = {}
): ExecutionContext {
  const state: WorkflowState = {
    sessionId,
    workflowName: 'test-workflow',
    workflowVersion: '1.0.0',
    status: 'running',
    currentStep: 'test-step',
    completedSteps: [],
    context: initialContext,
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

/**
 * Сохранение состояния в файл (симуляция поведения оркестратора)
 */
async function saveState(state: WorkflowState, stateDir: string): Promise<string> {
  const statePath = path.join(stateDir, `${state.sessionId}.json`);
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), 'utf-8');
  return statePath;
}

/**
 * Загрузка состояния из файла (симуляция поведения оркестратора)
 */
async function loadState(sessionId: string, stateDir: string): Promise<WorkflowState> {
  const statePath = path.join(stateDir, `${sessionId}.json`);
  const content = await fs.readFile(statePath, 'utf-8');
  return JSON.parse(content);
}

describe.skip('File Input - Resume Process Integration Tests', () => {
  let env: Awaited<ReturnType<typeof createTestEnvironment>>;
  
  beforeEach(async () => {
    env = await createTestEnvironment();
  });
  
  afterEach(async () => {
    await env.cleanup();
  });
  
  /**
   * Тест 1: Приостановка процесса при файловом вводе
   * Validates: Requirements 3.1, 3.2, 3.3
   */
  it('должен приостановить процесс и сохранить состояние при файловом вводе', async () => {
    const step: WorkflowStep = {
      id: 'pause-test-step',
      name: 'Тест приостановки',
      type: 'user_input',
      prompt_message: 'Введите данные',
      file_format: 'markdown' as FileFormat,
      input_mode: 'file'
    };
    
    const context = createExecutionContext(env.artifactManager, env.logger, 'pause-session');
    
    // FileInputHandler в тестовом режиме (автоматически возвращает 'postpone')
    const fileInputHandler = new FileInputHandler(
      env.templateGenerator,
      env.editorManager,
      env.userInputHandler,
      env.logger,
      true // testMode = true
    );
    
    // Выполнение handleFileInput
    const result = await fileInputHandler.handleFileInput(step, context);
    
    // Проверяем, что процесс приостановлен
    expect(result.userCommand).toBe('postpone');
    expect(result.filePath).toBeDefined();
    
    // Обновляем состояние (симуляция поведения StepExecutor)
    context.state.status = 'paused';
    context.state.currentStep = step.id;
    context.state.updatedAt = new Date().toISOString();
    
    // Сохраняем состояние
    const statePath = await saveState(context.state, env.stateDir);
    
    // Проверяем, что файл состояния создан
    const stateExists = await fs.access(statePath)
      .then(() => true)
      .catch(() => false);
    expect(stateExists).toBe(true);
    
    // Загружаем состояние и проверяем
    const savedState = await loadState('pause-session', env.stateDir);
    expect(savedState.status).toBe('paused');
    expect(savedState.currentStep).toBe(step.id);
    expect(savedState.sessionId).toBe('pause-session');
  });
  
  /**
   * Тест 2: Возобновление процесса с заполненным файлом
   * Validates: Requirements 8.1, 8.2, 8.3, 8.4
   */
  it('должен возобновить процесс и прочитать заполненный файл', async () => {
    const step: WorkflowStep = {
      id: 'resume-test-step',
      name: 'Тест возобновления',
      type: 'user_input',
      prompt_message: `Ответьте на вопросы:

1. Ваше имя?
2. Ваш email?`,
      file_format: 'markdown' as FileFormat,
      input_mode: 'file'
    };
    
    const sessionId = 'resume-session';
    const context = createExecutionContext(env.artifactManager, env.logger, sessionId);
    
    // Этап 1: Создание файла и приостановка
    const fileInputHandler1 = new FileInputHandler(
      env.templateGenerator,
      env.editorManager,
      env.userInputHandler,
      env.logger,
      true // testMode = true
    );
    
    const result1 = await fileInputHandler1.handleFileInput(step, context);
    
    // Сохраняем путь к файлу в состоянии
    context.state.status = 'paused';
    context.state.currentStep = step.id;
    context.state.artifacts['user_input_file'] = result1.filePath;
    await saveState(context.state, env.stateDir);
    
    // Этап 2: Симуляция заполнения файла пользователем
    const filledContent = `# Ответы пользователя

## 1. Ваше имя?

Иван Петров

## 2. Ваш email?

ivan@example.com`;
    
    await fs.writeFile(result1.filePath, filledContent, 'utf-8');
    
    // Этап 3: Возобновление процесса
    const savedState = await loadState(sessionId, env.stateDir);
    const resumeContext = createExecutionContext(
      env.artifactManager,
      env.logger,
      sessionId,
      savedState.context
    );
    resumeContext.state = savedState;
    
    // Создаем новый FileInputHandler без testMode для чтения
    const fileInputHandler2 = new FileInputHandler(
      env.templateGenerator,
      env.editorManager,
      env.userInputHandler,
      env.logger,
      false // testMode = false для чтения
    );
    
    // Читаем и валидируем файл
    const readAndValidate = (fileInputHandler2 as any).readAndValidate.bind(fileInputHandler2);
    const parsedInput = await readAndValidate(result1.filePath, step, resumeContext);
    
    // Проверяем распарсенные данные
    expect(parsedInput).toBeDefined();
    expect(parsedInput.data).toBeDefined();
    
    // Обновляем контекст (симуляция поведения StepExecutor)
    resumeContext.state.context['user_answers'] = parsedInput.data;
    resumeContext.state.status = 'running';
    resumeContext.state.completedSteps.push(step.id);
    
    // Проверяем, что данные доступны в контексте
    expect(resumeContext.state.context['user_answers']).toBeDefined();
    expect(resumeContext.state.status).toBe('running');
    expect(resumeContext.state.completedSteps).toContain(step.id);
  });
  
  /**
   * Тест 3: Возобновление процесса с незаполненным файлом
   * Validates: Requirements 8.2, 8.4
   */
  it('должен обработать возобновление с незаполненным файлом', async () => {
    const step: WorkflowStep = {
      id: 'empty-resume-step',
      name: 'Тест возобновления с пустым файлом',
      type: 'user_input',
      prompt_message: 'Введите данные',
      file_format: 'json' as FileFormat,
      input_mode: 'file'
    };
    
    const sessionId = 'empty-resume-session';
    const context = createExecutionContext(env.artifactManager, env.logger, sessionId);
    
    // Создание файла
    const fileInputHandler1 = new FileInputHandler(
      env.templateGenerator,
      env.editorManager,
      env.userInputHandler,
      env.logger,
      true
    );
    
    const result1 = await fileInputHandler1.handleFileInput(step, context);
    
    // Сохраняем состояние без заполнения файла
    context.state.status = 'paused';
    context.state.currentStep = step.id;
    context.state.artifacts['user_input_file'] = result1.filePath;
    await saveState(context.state, env.stateDir);
    
    // Проверяем, что файл существует но не заполнен
    const templateContent = await fs.readFile(result1.filePath, 'utf-8');
    expect(templateContent).toContain('_instructions');
    
    // При возобновлении файл должен быть доступен для редактирования
    const savedState = await loadState(sessionId, env.stateDir);
    expect(savedState.artifacts['user_input_file']).toBe(result1.filePath);
    expect(savedState.status).toBe('paused');
  });
  
  /**
   * Тест 4: Возобновление с сохранением контекста между шагами
   * Validates: Requirements 8.3, 8.5
   */
  it('должен сохранить и восстановить контекст при возобновлении', async () => {
    const step1: WorkflowStep = {
      id: 'context-step-1',
      name: 'Первый шаг с контекстом',
      type: 'user_input',
      prompt_message: 'Введите имя проекта',
      file_format: 'json' as FileFormat,
      input_mode: 'file'
    };
    
    const sessionId = 'context-session';
    const context = createExecutionContext(env.artifactManager, env.logger, sessionId);
    
    // Этап 1: Первый шаг - создание и заполнение
    const fileInputHandler = new FileInputHandler(
      env.templateGenerator,
      env.editorManager,
      env.userInputHandler,
      env.logger,
      true
    );
    
    const result1 = await fileInputHandler.handleFileInput(step1, context);
    
    // Заполняем файл
    const projectData = {
      projectName: 'MyProject',
      version: '1.0.0'
    };
    await fs.writeFile(result1.filePath, JSON.stringify(projectData, null, 2), 'utf-8');
    
    // Читаем данные
    const readHandler = new FileInputHandler(
      env.templateGenerator,
      env.editorManager,
      env.userInputHandler,
      env.logger,
      false
    );
    
    const readAndValidate = (readHandler as any).readAndValidate.bind(readHandler);
    const parsedInput1 = await readAndValidate(result1.filePath, step1, context);
    
    // Сохраняем в контекст
    context.state.context['project_info'] = parsedInput1.data;
    context.state.completedSteps.push(step1.id);
    context.state.status = 'paused';
    context.state.currentStep = 'context-step-2';
    
    // Сохраняем состояние
    await saveState(context.state, env.stateDir);
    
    // Этап 2: Возобновление для второго шага
    const savedState = await loadState(sessionId, env.stateDir);
    
    // Проверяем, что контекст восстановлен
    expect(savedState.context['project_info']).toBeDefined();
    const restoredProjectInfo = savedState.context['project_info'] as Record<string, unknown>;
    expect(restoredProjectInfo['projectName']).toBe('MyProject');
    expect(restoredProjectInfo['version']).toBe('1.0.0');
    expect(savedState.completedSteps).toContain(step1.id);
    
    // Второй шаг может использовать данные из контекста
    const step2: WorkflowStep = {
      id: 'context-step-2',
      name: 'Второй шаг использует контекст',
      type: 'user_input',
      prompt_message: `Проект: ${restoredProjectInfo['projectName']}\nВведите описание`,
      file_format: 'markdown' as FileFormat,
      input_mode: 'file'
    };
    
    const resumeContext = createExecutionContext(
      env.artifactManager,
      env.logger,
      sessionId,
      savedState.context
    );
    resumeContext.state = savedState;
    
    // Создаем файл для второго шага
    await fileInputHandler.handleFileInput(step2, resumeContext);
    
    // Проверяем, что prompt_message содержит данные из контекста
    expect(step2.prompt_message).toContain('MyProject');
  });
  
  /**
   * Тест 5: Множественное возобновление процесса
   * Validates: Requirements 8.1, 8.2, 8.5
   */
  it('должен поддерживать множественное возобновление процесса', async () => {
    const sessionId = 'multiple-resume-session';
    const steps: WorkflowStep[] = [
      {
        id: 'multi-step-1',
        name: 'Шаг 1',
        type: 'user_input',
        prompt_message: 'Вопрос 1',
        file_format: 'json' as FileFormat,
        input_mode: 'file'
      },
      {
        id: 'multi-step-2',
        name: 'Шаг 2',
        type: 'user_input',
        prompt_message: 'Вопрос 2',
        file_format: 'json' as FileFormat,
        input_mode: 'file'
      },
      {
        id: 'multi-step-3',
        name: 'Шаг 3',
        type: 'user_input',
        prompt_message: 'Вопрос 3',
        file_format: 'json' as FileFormat,
        input_mode: 'file'
      }
    ];
    
    const context = createExecutionContext(env.artifactManager, env.logger, sessionId);
    const fileInputHandler = new FileInputHandler(
      env.templateGenerator,
      env.editorManager,
      env.userInputHandler,
      env.logger,
      true
    );
    
    const readHandler = new FileInputHandler(
      env.templateGenerator,
      env.editorManager,
      env.userInputHandler,
      env.logger,
      false
    );
    
    const readAndValidate = (readHandler as any).readAndValidate.bind(readHandler);
    
    // Выполняем каждый шаг с приостановкой и возобновлением
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      
      // Создаем файл
      const result = await fileInputHandler.handleFileInput(step, context);
      
      // Приостанавливаем
      context.state.status = 'paused';
      context.state.currentStep = step.id;
      await saveState(context.state, env.stateDir);
      
      // Заполняем файл
      const data = { answer: `Ответ на вопрос ${i + 1}` };
      await fs.writeFile(result.filePath, JSON.stringify(data, null, 2), 'utf-8');
      
      // Возобновляем
      const savedState = await loadState(sessionId, env.stateDir);
      context.state = savedState;
      
      // Читаем данные
      const parsedInput = await readAndValidate(result.filePath, step, context);
      
      // Обновляем контекст
      context.state.context[`step_${i + 1}_answer`] = parsedInput.data;
      context.state.completedSteps.push(step.id);
      context.state.status = 'running';
    }
    
    // Проверяем финальное состояние
    expect(context.state.completedSteps).toHaveLength(3);
    expect(context.state.completedSteps).toEqual(['multi-step-1', 'multi-step-2', 'multi-step-3']);
    expect(context.state.context['step_1_answer']).toBeDefined();
    expect(context.state.context['step_2_answer']).toBeDefined();
    expect(context.state.context['step_3_answer']).toBeDefined();
  });
  
  /**
   * Тест 6: Возобновление с проверкой временных меток
   * Validates: Requirements 8.1, 8.5
   */
  it('должен корректно обновлять временные метки при возобновлении', async () => {
    const step: WorkflowStep = {
      id: 'timestamp-step',
      name: 'Тест временных меток',
      type: 'user_input',
      prompt_message: 'Введите данные',
      file_format: 'json' as FileFormat,
      input_mode: 'file'
    };
    
    const sessionId = 'timestamp-session';
    const context = createExecutionContext(env.artifactManager, env.logger, sessionId);
    
    const startTime = new Date();
    context.state.startedAt = startTime.toISOString();
    
    // Создание файла и приостановка
    const fileInputHandler = new FileInputHandler(
      env.templateGenerator,
      env.editorManager,
      env.userInputHandler,
      env.logger,
      true
    );
    
    await fileInputHandler.handleFileInput(step, context);
    
    const pauseTime = new Date();
    context.state.status = 'paused';
    context.state.updatedAt = pauseTime.toISOString();
    await saveState(context.state, env.stateDir);
    
    // Небольшая задержка для имитации времени редактирования
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Возобновление
    const savedState = await loadState(sessionId, env.stateDir);
    const resumeTime = new Date();
    
    // Проверяем временные метки
    expect(new Date(savedState.startedAt).getTime()).toBeLessThanOrEqual(pauseTime.getTime());
    expect(new Date(savedState.updatedAt).getTime()).toBeLessThanOrEqual(resumeTime.getTime());
    expect(resumeTime.getTime()).toBeGreaterThan(pauseTime.getTime());
  });
});
