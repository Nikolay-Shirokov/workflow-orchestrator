/**
 * Интеграционный тест для проверки вызова обработчиков событий
 * из workflow engine
 * 
 * Проверяет, что обработчики onStepStart, onStepComplete, onStepError
 * вызываются автоматически во время выполнения процесса.
 */

import { WorkflowEngine, createWorkflowEngine } from '../../src/core/workflow-engine.js';
import { createStateManager } from '../../src/core/state-manager.js';
import { createStepExecutor } from '../../src/core/step-executor.js';
import { AdapterRegistry } from '../../src/adapters/adapter-registry.js';
import { DefaultTemplateEngine } from '../../src/core/template-engine.js';
import { createArtifactManager } from '../../src/core/artifact-manager.js';
import { WorkflowConfigParser } from '../../src/core/workflow-config-parser.js';
import { RoleManager } from '../../src/core/role-manager.js';
import { MCPManager } from '../../src/core/mcp-manager.js';
import { WorkflowConfig, WorkflowStep, WorkflowState, StepHistory } from '../../src/core/types.js';
import { IProgressDisplay } from '../../src/cli/display-types.js';
import { Logger, LogLevel } from '../../src/core/logger.js';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Mock Progress Display для отслеживания вызовов обработчиков
 */
class MockProgressDisplay implements IProgressDisplay {
  public calls: Array<{ method: string; args: any[] }> = [];

  onWorkflowStart(config: WorkflowConfig): void {
    this.calls.push({ method: 'onWorkflowStart', args: [config] });
  }

  onStepStart(step: WorkflowStep, stepNumber: number): void {
    this.calls.push({ method: 'onStepStart', args: [step, stepNumber] });
  }

  onStepComplete(step: WorkflowStep, history: StepHistory): void {
    this.calls.push({ method: 'onStepComplete', args: [step, history] });
  }

  onStepError(step: WorkflowStep, error: Error): void {
    this.calls.push({ method: 'onStepError', args: [step, error] });
  }

  onWorkflowComplete(state: WorkflowState): void {
    this.calls.push({ method: 'onWorkflowComplete', args: [state] });
  }

  getCalls(method: string): Array<{ method: string; args: any[] }> {
    return this.calls.filter(call => call.method === method);
  }

  clear(): void {
    this.calls = [];
  }
}

describe('Workflow Engine Progress Integration', () => {
  let workflowEngine: WorkflowEngine;
  let mockProgress: MockProgressDisplay;
  let logger: Logger;
  let testDir: string;

  beforeEach(async () => {
    // Создаем временную директорию для тестов
    testDir = path.join(process.cwd(), 'tmp', `test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });

    // Создаем настоящий Logger с отключенным выводом
    logger = new Logger({
      level: LogLevel.ERROR,
      enableConsole: false,
      enableFile: false
    });
    
    mockProgress = new MockProgressDisplay();

    // Создаем workflow engine
    const configParser = new WorkflowConfigParser();
    const stateManager = createStateManager({
      stateDir: path.join(testDir, 'state'),
      logger: logger
    });
    const adapterRegistry = new AdapterRegistry();
    const templateEngine = new DefaultTemplateEngine();
    const artifactManager = createArtifactManager({
      baseDir: testDir,
      sessionDirTemplate: '',
      logger: logger
    });
    const roleManager = new RoleManager();
    const mcpManager = new MCPManager(logger);
    const stepExecutor = createStepExecutor({
      roleManager,
      mcpManager
    });

    workflowEngine = createWorkflowEngine({
      configParser,
      stateManager,
      stepExecutor,
      adapterRegistry,
      templateEngine,
      artifactManager,
      logger: logger,
      roleManager,
      mcpManager
    });
  });

  afterEach(async () => {
    // Очищаем временную директорию
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Игнорируем ошибки очистки
    }
  });

  test('should call onStepStart and onStepComplete for each step', async () => {
    // Создаем простую конфигурацию с двумя шагами
    const config: WorkflowConfig = {
      name: 'test-workflow',
      version: '1.0',
      settings: {
        artifacts_dir: path.join(testDir, 'artifacts')
      },
      steps: [
        {
          id: 'step1',
          name: 'First Step',
          type: 'script' as const,
          script: 'echo "test1"'
        },
        {
          id: 'step2',
          name: 'Second Step',
          type: 'script' as const,
          script: 'echo "test2"'
        }
      ]
    };

    // Выполняем процесс с progress display
    await workflowEngine.execute(config, {}, mockProgress);

    // Проверяем, что onStepStart был вызван для каждого шага
    const stepStartCalls = mockProgress.getCalls('onStepStart');
    expect(stepStartCalls.length).toBe(2);
    
    // Проверяем, что первый вызов был для step1 с номером 1
    expect(stepStartCalls[0].args[0].id).toBe('step1');
    expect(stepStartCalls[0].args[1]).toBe(1);
    
    // Проверяем, что второй вызов был для step2 с номером 2
    expect(stepStartCalls[1].args[0].id).toBe('step2');
    expect(stepStartCalls[1].args[1]).toBe(2);

    // Проверяем, что onStepComplete был вызван для каждого шага
    const stepCompleteCalls = mockProgress.getCalls('onStepComplete');
    expect(stepCompleteCalls.length).toBe(2);
    
    // Проверяем, что первый вызов был для step1
    expect(stepCompleteCalls[0].args[0].id).toBe('step1');
    expect(stepCompleteCalls[0].args[1].status).toBe('success');
    
    // Проверяем, что второй вызов был для step2
    expect(stepCompleteCalls[1].args[0].id).toBe('step2');
    expect(stepCompleteCalls[1].args[1].status).toBe('success');
  });

  test('should call handlers in correct order', async () => {
    const config: WorkflowConfig = {
      name: 'test-workflow',
      version: '1.0',
      settings: {
        artifacts_dir: path.join(testDir, 'artifacts')
      },
      steps: [
        {
          id: 'step1',
          name: 'First Step',
          type: 'script' as const,
          script: 'echo "test1"'
        }
      ]
    };

    await workflowEngine.execute(config, {}, mockProgress);

    // Проверяем порядок вызовов
    const callMethods = mockProgress.calls.map(call => call.method);
    
    // Ожидаемый порядок: onStepStart -> onStepComplete
    expect(callMethods).toContain('onStepStart');
    expect(callMethods).toContain('onStepComplete');
    
    const stepStartIndex = callMethods.indexOf('onStepStart');
    const stepCompleteIndex = callMethods.indexOf('onStepComplete');
    
    expect(stepStartIndex).toBeLessThan(stepCompleteIndex);
  });

  test('should pass correct step information to handlers', async () => {
    const config: WorkflowConfig = {
      name: 'test-workflow',
      version: '1.0',
      settings: {
        artifacts_dir: path.join(testDir, 'artifacts')
      },
      steps: [
        {
          id: 'test-step',
          name: 'Test Step',
          type: 'script' as const,
          script: 'echo "test"'
        }
      ]
    };

    await workflowEngine.execute(config, {}, mockProgress);

    // Проверяем информацию о шаге в onStepStart
    const stepStartCalls = mockProgress.getCalls('onStepStart');
    expect(stepStartCalls.length).toBe(1);
    
    const stepInStart = stepStartCalls[0].args[0];
    expect(stepInStart.id).toBe('test-step');
    expect(stepInStart.name).toBe('Test Step');
    expect(stepInStart.type).toBe('script');

    // Проверяем информацию о шаге в onStepComplete
    const stepCompleteCalls = mockProgress.getCalls('onStepComplete');
    expect(stepCompleteCalls.length).toBe(1);
    
    const stepInComplete = stepCompleteCalls[0].args[0];
    expect(stepInComplete.id).toBe('test-step');
    
    const history = stepCompleteCalls[0].args[1];
    expect(history.stepId).toBe('test-step');
    expect(history.status).toBe('success');
    expect(history.executionTime).toBeGreaterThan(0);
  });
});
