/**
 * Тесты для цикла с условием (loop_condition)
 */

import { DefaultStepExecutor } from '../../src/core/step-executor.js';
import { WorkflowStep, ExecutionContext, WorkflowState } from '../../src/core/types.js';
import { AdapterRegistry } from '../../src/adapters/adapter-registry.js';
import { MockCLIAdapter } from '../../src/adapters/mock-cli-adapter.js';
import { DefaultTemplateEngine } from '../../src/core/template-engine.js';
import { createArtifactManager } from '../../src/core/artifact-manager.js';
import { getLogger } from '../../src/core/logger.js';

// Вспомогательная функция для создания тестового контекста
function createTestContext(
  contextVariables: Record<string, unknown> = {}
): ExecutionContext {
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
    context: {
      default_adapter: 'mock-adapter',
      artifacts_dir: '.',
      ...contextVariables
    },
    history: [],
    errors: []
  };

  const adapters = new AdapterRegistry();
  const mockAdapter = new MockCLIAdapter('mock-adapter', '1.0.0');
  mockAdapter.setResponse(/.*/, 'Test response');
  adapters.register(mockAdapter);

  const templateEngine = new DefaultTemplateEngine();
  const artifactManager = createArtifactManager({
    baseDir: './test-artifacts'
  });
  const logger = getLogger();

  return {
    state,
    adapters,
    templateEngine,
    artifactManager,
    logger
  };
}

describe('Loop with condition', () => {
  test('должен выполнять цикл пока условие истинно', async () => {
    const executor = new DefaultStepExecutor();
    const context = createTestContext();

    // Инициализация счётчика
    context.state.context['counter'] = 0;

    const loopStep: WorkflowStep = {
      id: 'counter-loop',
      name: 'Counter Loop',
      type: 'loop',
      loop_condition: "counter < 3",  // Продолжать пока counter < 3
      loop_max_iterations: 10,
      loop_body: {
        id: 'increment',
        name: 'Increment',
        type: 'script',
        script: 'echo $((COUNTER + 1))',
        shell: 'bash',
        outputs: {
          counter: '${artifacts_dir}/counter.txt'
        }
      }
    };

    // Mock для script execution
    let iterationCount = 0;
    executor['executeStep'] = async function(step: WorkflowStep, ctx: ExecutionContext) {
      if (step.id === 'increment') {
        iterationCount++;
        // Увеличиваем счётчик в контексте
        const currentCounter = Number(ctx.state.context['counter'] || 0);
        ctx.state.context['counter'] = currentCounter + 1;

        return {
          stepId: step.id,
          status: 'success' as const,
          outputs: { counter: currentCounter + 1 },
          artifacts: [],
          executionTime: 1
        };
      }
      throw new Error(`Unexpected step: ${step.id}`);
    };

    const result = await executor['executeLoopStep'](loopStep, context);

    // Проверяем, что цикл остановился когда counter достиг 3
    expect(iterationCount).toBe(3);
    expect(context.state.context['counter']).toBe(3);
    expect(result.status).toBe('success');
    expect(result.outputs.iterations).toBe(3);
    expect(result.outputs.condition_met).toBe(true);
  });

  test('должен останавливаться при достижении max_iterations', async () => {
    const executor = new DefaultStepExecutor();
    const context = createTestContext();

    context.state.context['always_true'] = true;

    const loopStep: WorkflowStep = {
      id: 'infinite-loop',
      name: 'Infinite Loop',
      type: 'loop',
      loop_condition: "always_true == true",  // Всегда истинно
      loop_max_iterations: 5,  // Лимит 5 итераций
      loop_body: {
        id: 'noop',
        name: 'No-op',
        type: 'script',
        script: 'echo "iteration"',
        shell: 'bash'
      }
    };

    // Mock
    let iterationCount = 0;
    executor['executeStep'] = async function(step: WorkflowStep) {
      if (step.id === 'noop') {
        iterationCount++;
        return {
          stepId: step.id,
          status: 'success' as const,
          outputs: {},
          artifacts: [],
          executionTime: 1
        };
      }
      throw new Error(`Unexpected step: ${step.id}`);
    };

    const result = await executor['executeLoopStep'](loopStep, context);

    // Проверяем, что цикл остановился на лимите
    expect(iterationCount).toBe(5);
    expect(result.outputs.iterations).toBe(5);
    expect(result.outputs.condition_met).toBe(false);  // Условие всё ещё true
  });

  test('должен выполнить хотя бы одну итерацию даже если условие сразу false', async () => {
    const executor = new DefaultStepExecutor();
    const context = createTestContext();

    context.state.context['status'] = 'DONE';

    const loopStep: WorkflowStep = {
      id: 'immediate-exit',
      name: 'Immediate Exit',
      type: 'loop',
      loop_condition: "status != 'DONE'",  // Сразу false
      loop_max_iterations: 10,
      loop_body: {
        id: 'body',
        name: 'Body',
        type: 'script',
        script: 'echo "executed"',
        shell: 'bash'
      }
    };

    // Mock
    let iterationCount = 0;
    executor['executeStep'] = async function(step: WorkflowStep) {
      if (step.id === 'body') {
        iterationCount++;
        return {
          stepId: step.id,
          status: 'success' as const,
          outputs: {},
          artifacts: [],
          executionTime: 1
        };
      }
      throw new Error(`Unexpected step: ${step.id}`);
    };

    await executor['executeLoopStep'](loopStep, context);

    // Минимум 1 итерация
    expect(iterationCount).toBe(1);
  });

  test('должен поддерживать сложные условия с операторами', async () => {
    const executor = new DefaultStepExecutor();
    const context = createTestContext();

    context.state.context['score'] = 50;
    context.state.context['attempts'] = 0;

    const loopStep: WorkflowStep = {
      id: 'complex-condition',
      name: 'Complex Condition',
      type: 'loop',
      // Продолжать пока score < 80 И attempts < 3
      loop_condition: "score < 80 && attempts < 3",
      loop_max_iterations: 10,
      loop_body: {
        id: 'improve',
        name: 'Improve',
        type: 'script',
        script: 'echo "improving"',
        shell: 'bash'
      }
    };

    // Mock
    let iterationCount = 0;
    executor['executeStep'] = async function(step: WorkflowStep, ctx: ExecutionContext) {
      if (step.id === 'improve') {
        iterationCount++;
        // Увеличиваем score и attempts
        ctx.state.context['score'] = Number(ctx.state.context['score']) + 20;
        ctx.state.context['attempts'] = Number(ctx.state.context['attempts']) + 1;

        return {
          stepId: step.id,
          status: 'success' as const,
          outputs: {
            score: ctx.state.context['score'],
            attempts: ctx.state.context['attempts']
          },
          artifacts: [],
          executionTime: 1
        };
      }
      throw new Error(`Unexpected step: ${step.id}`);
    };

    await executor['executeLoopStep'](loopStep, context);

    // После 2 итераций: score = 90 (>= 80), цикл должен остановиться
    expect(iterationCount).toBe(2);
    expect(context.state.context['score']).toBe(90);
    expect(context.state.context['attempts']).toBe(2);
  });

  test('должен поддерживать строковые операторы (contains, startsWith)', async () => {
    const executor = new DefaultStepExecutor();
    const context = createTestContext();

    context.state.context['status'] = 'PROCESSING';

    const loopStep: WorkflowStep = {
      id: 'string-condition',
      name: 'String Condition',
      type: 'loop',
      loop_condition: "status contains 'PROCESS'",  // Продолжать пока содержит PROCESS
      loop_max_iterations: 5,
      loop_body: {
        id: 'process',
        name: 'Process',
        type: 'script',
        script: 'echo "processing"',
        shell: 'bash'
      }
    };

    // Mock
    let iterationCount = 0;
    executor['executeStep'] = async function(step: WorkflowStep, ctx: ExecutionContext) {
      if (step.id === 'process') {
        iterationCount++;
        // После 2 итераций меняем статус
        if (iterationCount >= 2) {
          ctx.state.context['status'] = 'DONE';
        }

        return {
          stepId: step.id,
          status: 'success' as const,
          outputs: { status: ctx.state.context['status'] },
          artifacts: [],
          executionTime: 1
        };
      }
      throw new Error(`Unexpected step: ${step.id}`);
    };

    await executor['executeLoopStep'](loopStep, context);

    // После 2 итераций статус стал DONE (не содержит PROCESS)
    expect(iterationCount).toBe(2);
    expect(context.state.context['status']).toBe('DONE');
  });
});
