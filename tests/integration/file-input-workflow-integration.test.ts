/**
 * Интеграционный тест интеграции файлового ввода с workflow
 * 
 * Проверяет:
 * - Выполнение процесса с файловым вводом
 * - Передачу данных между шагами
 * - Совместимость с другими типами шагов
 * 
 * Validates: Requirements 1.1, 4.6, 6.1, 6.2, 7.1, 7.2, 7.3
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
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'file-input-workflow-test-'));
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
    templateEngine: { render: (template: string) => template } as any
  } as ExecutionContext;
}

describe('File Input - Workflow Integration Tests', () => {
  let env: Awaited<ReturnType<typeof createTestEnvironment>>;
  
  beforeEach(async () => {
    env = await createTestEnvironment();
  });
  
  afterEach(async () => {
    await env.cleanup();
  });
  
  /**
   * Тест 1: Передача данных между шагами через контекст
   * Validates: Requirements 4.6, 6.1, 6.2
   */
  it('должен передавать данные между шагами через контекст', async () => {
    const sessionId = 'workflow-context-session';
    
    // Шаг 1: Файловый ввод
    const step1: WorkflowStep = {
      id: 'input-step',
      name: 'Ввод данных пользователя',
      type: 'user_input',
      prompt_message: 'Введите информацию о проекте',
      file_format: 'json' as FileFormat,
      input_mode: 'file'
    };
    
    const context = createExecutionContext(env.artifactManager, env.logger, sessionId);
    
    const fileInputHandler = new FileInputHandler(
      env.templateGenerator,
      env.editorManager,
      env.userInputHandler,
      env.logger,
      true
    );
    
    // Создаем и заполняем файл
    const result1 = await fileInputHandler.handleFileInput(step1, context);
    
    const projectData = {
      projectName: 'TestProject',
      version: '1.0.0',
      description: 'Test project description'
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
    const parsedInput = await readAndValidate(result1.filePath, step1, context);
    
    // Сохраняем в контекст (симуляция StepExecutor)
    context.state.context['project_info'] = parsedInput.data;
    context.state.completedSteps.push(step1.id);
    
    // Шаг 2: Использование данных из контекста
    const step2: WorkflowStep = {
      id: 'processing-step',
      name: 'Обработка данных',
      type: 'script',
      script: 'echo "Processing project: ${project_info.projectName}"'
    };
    
    // Проверяем доступность данных для следующего шага
    expect(context.state.context['project_info']).toBeDefined();
    const projectInfo = context.state.context['project_info'] as Record<string, unknown>;
    expect(projectInfo['projectName']).toBe('TestProject');
    expect(projectInfo['version']).toBe('1.0.0');
    expect(projectInfo['description']).toBe('Test project description');
    
    // Симуляция использования данных в следующем шаге
    const scriptCommand = step2.script?.replace(
      '${project_info.projectName}',
      projectInfo['projectName'] as string
    );
    
    expect(scriptCommand).toContain('TestProject');
  });
  
  /**
   * Тест 2: Выбор режима ввода (file vs console)
   * Validates: Requirements 7.1, 7.2, 7.3
   */
  it('должен поддерживать выбор режима ввода', async () => {
    // Шаг с явным указанием file mode
    const fileStep: WorkflowStep = {
      id: 'file-input-step',
      name: 'Файловый ввод',
      type: 'user_input',
      prompt_message: 'Введите данные',
      file_format: 'json' as FileFormat,
      input_mode: 'file'
    };
    
    // Шаг с явным указанием console mode
    const consoleStep: WorkflowStep = {
      id: 'console-input-step',
      name: 'Консольный ввод',
      type: 'user_input',
      prompt_message: 'Введите данные',
      input_mode: 'console'
    };
    
    // Проверяем, что режимы указаны корректно
    expect(fileStep.input_mode).toBe('file');
    expect(consoleStep.input_mode).toBe('console');
    
    // Для file mode должен создаваться файл
    const context = createExecutionContext(env.artifactManager, env.logger);
    
    const fileInputHandler = new FileInputHandler(
      env.templateGenerator,
      env.editorManager,
      env.userInputHandler,
      env.logger,
      true
    );
    
    const result = await fileInputHandler.handleFileInput(fileStep, context);
    
    expect(result.filePath).toBeDefined();
    
    const fileExists = await fs.access(result.filePath)
      .then(() => true)
      .catch(() => false);
    
    expect(fileExists).toBe(true);
  });
  
  /**
   * Тест 3: Последовательность шагов с файловым вводом
   * Validates: Requirements 1.1, 4.6
   */
  it('должен поддерживать последовательность шагов с файловым вводом', async () => {
    const sessionId = 'sequential-workflow-session';
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
    
    // Определяем последовательность шагов
    const steps: WorkflowStep[] = [
      {
        id: 'step-1',
        name: 'Ввод базовой информации',
        type: 'user_input',
        prompt_message: 'Введите базовую информацию',
        file_format: 'json' as FileFormat,
        input_mode: 'file'
      },
      {
        id: 'step-2',
        name: 'Ввод дополнительной информации',
        type: 'user_input',
        prompt_message: 'Введите дополнительную информацию',
        file_format: 'json' as FileFormat,
        input_mode: 'file'
      },
      {
        id: 'step-3',
        name: 'Ввод конфигурации',
        type: 'user_input',
        prompt_message: 'Введите конфигурацию',
        file_format: 'json' as FileFormat,
        input_mode: 'file'
      }
    ];
    
    // Выполняем каждый шаг
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      
      // Создаем файл
      const result = await fileInputHandler.handleFileInput(step, context);
      
      // Заполняем файл
      const data = {
        stepNumber: i + 1,
        stepId: step.id,
        data: `Data for step ${i + 1}`
      };
      
      await fs.writeFile(result.filePath, JSON.stringify(data, null, 2), 'utf-8');
      
      // Читаем данные
      const parsedInput = await readAndValidate(result.filePath, step, context);
      
      // Сохраняем в контекст
      context.state.context[`step_${i + 1}_data`] = parsedInput.data;
      context.state.completedSteps.push(step.id);
    }
    
    // Проверяем, что все шаги выполнены
    expect(context.state.completedSteps).toHaveLength(3);
    expect(context.state.completedSteps).toEqual(['step-1', 'step-2', 'step-3']);
    
    // Проверяем, что данные всех шагов доступны в контексте
    expect(context.state.context['step_1_data']).toBeDefined();
    expect(context.state.context['step_2_data']).toBeDefined();
    expect(context.state.context['step_3_data']).toBeDefined();
    
    // Проверяем содержимое данных
    const step1Data = context.state.context['step_1_data'] as Record<string, unknown>;
    expect(step1Data['stepNumber']).toBe(1);
    expect(step1Data['stepId']).toBe('step-1');
  });
  
  /**
   * Тест 4: Совместимость с разными форматами файлов
   * Validates: Requirements 9.1, 9.2, 9.3, 9.4
   */
  it('должен поддерживать разные форматы файлов в одном workflow', async () => {
    const sessionId = 'multi-format-session';
    const context = createExecutionContext(env.artifactManager, env.logger, sessionId);
    
    const fileInputHandler = new FileInputHandler(
      env.templateGenerator,
      env.editorManager,
      env.userInputHandler,
      env.logger,
      true
    );
    
    // Шаги с разными форматами
    const jsonStep: WorkflowStep = {
      id: 'json-step',
      name: 'JSON ввод',
      type: 'user_input',
      prompt_message: 'JSON данные',
      file_format: 'json' as FileFormat,
      input_mode: 'file'
    };
    
    const yamlStep: WorkflowStep = {
      id: 'yaml-step',
      name: 'YAML ввод',
      type: 'user_input',
      prompt_message: 'YAML данные',
      file_format: 'yaml' as FileFormat,
      input_mode: 'file'
    };
    
    const markdownStep: WorkflowStep = {
      id: 'markdown-step',
      name: 'Markdown ввод',
      type: 'user_input',
      prompt_message: 'Markdown данные',
      file_format: 'markdown' as FileFormat,
      input_mode: 'file'
    };
    
    // Создаем файлы для каждого формата
    const jsonResult = await fileInputHandler.handleFileInput(jsonStep, context);
    const yamlResult = await fileInputHandler.handleFileInput(yamlStep, context);
    const markdownResult = await fileInputHandler.handleFileInput(markdownStep, context);
    
    // Проверяем расширения файлов
    expect(jsonResult.filePath).toContain('.json');
    expect(yamlResult.filePath).toContain('.yaml');
    expect(markdownResult.filePath).toContain('.md');
    
    // Проверяем, что все файлы созданы
    const jsonExists = await fs.access(jsonResult.filePath).then(() => true).catch(() => false);
    const yamlExists = await fs.access(yamlResult.filePath).then(() => true).catch(() => false);
    const markdownExists = await fs.access(markdownResult.filePath).then(() => true).catch(() => false);
    
    expect(jsonExists).toBe(true);
    expect(yamlExists).toBe(true);
    expect(markdownExists).toBe(true);
  });
});
