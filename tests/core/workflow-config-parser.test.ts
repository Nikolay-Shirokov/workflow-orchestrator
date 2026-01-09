/**
 * Тесты для парсера конфигурации рабочих процессов
 * 
 * Включает property-based тесты для проверки свойств корректности
 */

import * as fc from 'fast-check';
import { WorkflowConfigParser } from '../../src/core/workflow-config-parser.js';
import { WorkflowConfig, WorkflowStep, StepType } from '../../src/core/types.js';
import { stringify as stringifyYAML } from 'yaml';

describe('WorkflowConfigParser', () => {
  let parser: WorkflowConfigParser;
  
  beforeEach(() => {
    parser = new WorkflowConfigParser();
  });
  
  // ============================================================================
  // Property-Based Tests
  // ============================================================================
  
  describe('Property 6: Парсинг форматов конфигурации', () => {
    /**
     * Feature: workflow-orchestrator, Property 6: Парсинг форматов конфигурации
     * 
     * Для любой валидной конфигурации рабочего процесса в формате YAML или JSON,
     * система должна успешно парсить оба формата в эквивалентные внутренние представления.
     * 
     * Validates: Requirements 2.1
     */
    test('YAML и JSON парсинг производят эквивалентные результаты', () => {
      fc.assert(
        fc.property(
          arbitraryValidWorkflowConfig(),
          (config) => {
            // Сериализуем в YAML и JSON
            const yamlString = stringifyYAML({ workflow: config });
            const jsonString = JSON.stringify({ workflow: config });
            
            // Парсим обратно
            const fromYAML = parser.parseYAML(yamlString);
            const fromJSON = parser.parseJSON(jsonString);
            
            // Проверяем эквивалентность основных полей
            expect(fromYAML.name).toBe(fromJSON.name);
            expect(fromYAML.version).toBe(fromJSON.version);
            expect(fromYAML.description).toBe(fromJSON.description);
            expect(fromYAML.settings.artifacts_dir).toBe(fromJSON.settings.artifacts_dir);
            expect(fromYAML.steps.length).toBe(fromJSON.steps.length);
            
            // Проверяем, что все ID шагов совпадают
            const yamlStepIds = fromYAML.steps.map(s => s.id).sort();
            const jsonStepIds = fromJSON.steps.map(s => s.id).sort();
            expect(yamlStepIds).toEqual(jsonStepIds);
            
            // Проверяем, что типы шагов совпадают
            for (let i = 0; i < fromYAML.steps.length; i++) {
              const yamlStep = fromYAML.steps.find(s => s.id === yamlStepIds[i]);
              const jsonStep = fromJSON.steps.find(s => s.id === jsonStepIds[i]);
              expect(yamlStep?.type).toBe(jsonStep?.type);
              expect(yamlStep?.name).toBe(jsonStep?.name);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
  
  describe('Property 7: Валидация зависимостей', () => {
    /**
     * Feature: workflow-orchestrator, Property 7: Валидация зависимостей
     * 
     * Для любого рабочего процесса с циклическими зависимостями или ссылками на несуществующие шаги,
     * валидация должна обнаруживать и сообщать об этих ошибках.
     * 
     * Validates: Requirements 2.2
     */
    test('Обнаружение циклических зависимостей', () => {
      fc.assert(
        fc.property(
          arbitraryConfigWithCycle(),
          (config) => {
            // Валидация должна обнаружить ошибку
            const result = parser.validate(config);
            
            // Проверяем, что валидация не прошла
            expect(result.valid).toBe(false);
            
            // Проверяем, что есть ошибка о циклической зависимости
            const hasCycleError = result.errors.some(
              err => err.code === 'CIRCULAR_DEPENDENCY'
            );
            expect(hasCycleError).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
    
    test('Обнаружение ссылок на несуществующие шаги', () => {
      fc.assert(
        fc.property(
          arbitraryConfigWithInvalidDependency(),
          (config) => {
            // Валидация должна обнаружить ошибку
            const result = parser.validate(config);
            
            // Проверяем, что валидация не прошла
            expect(result.valid).toBe(false);
            
            // Проверяем, что есть ошибка о невалидной зависимости
            const hasInvalidDepError = result.errors.some(
              err => err.code === 'INVALID_DEPENDENCY'
            );
            expect(hasInvalidDepError).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
    
    test('Валидные зависимости проходят проверку', () => {
      fc.assert(
        fc.property(
          arbitraryConfigWithValidDependencies(),
          (config) => {
            // Валидация должна пройти успешно
            const result = parser.validate(config);
            
            // Проверяем, что нет ошибок циклов или невалидных зависимостей
            const hasDependencyErrors = result.errors.some(
              err => err.code === 'CIRCULAR_DEPENDENCY' || err.code === 'INVALID_DEPENDENCY'
            );
            expect(hasDependencyErrors).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
  
  describe('Property 9: Полнота конфигурации шага', () => {
    /**
     * Feature: workflow-orchestrator, Property 9: Полнота конфигурации шага
     * 
     * Для любого определения шага рабочего процесса с адаптером, шаблоном промпта, входами и выходами,
     * все эти поля должны сохраняться и быть доступными после парсинга.
     * 
     * Validates: Requirements 2.4
     */
    test('Все поля шага сохраняются после парсинга', () => {
      fc.assert(
        fc.property(
          arbitraryCompleteWorkflowStep(),
          (step) => {
            // Создаём конфигурацию с этим шагом
            const config: WorkflowConfig = {
              name: 'test-workflow',
              version: '1.0',
              settings: {
                artifacts_dir: 'artifacts'
              },
              steps: [step]
            };
            
            // Сериализуем и парсим
            const jsonString = JSON.stringify({ workflow: config });
            const parsed = parser.parseJSON(jsonString);
            
            // Проверяем, что все поля сохранились
            const parsedStep = parsed.steps[0];
            
            expect(parsedStep.id).toBe(step.id);
            expect(parsedStep.name).toBe(step.name);
            expect(parsedStep.type).toBe(step.type);
            
            // Проверяем опциональные поля, если они были определены
            if (step.adapter !== undefined) {
              expect(parsedStep.adapter).toBe(step.adapter);
            }
            
            if (step.prompt_template !== undefined) {
              expect(parsedStep.prompt_template).toBe(step.prompt_template);
            }
            
            if (step.inputs !== undefined) {
              expect(parsedStep.inputs).toEqual(step.inputs);
            }
            
            if (step.outputs !== undefined) {
              expect(parsedStep.outputs).toEqual(step.outputs);
            }
            
            if (step.depends_on !== undefined) {
              expect(parsedStep.depends_on).toEqual(step.depends_on);
            }
            
            if (step.timeout !== undefined) {
              expect(parsedStep.timeout).toBe(step.timeout);
            }
            
            if (step.retries !== undefined) {
              expect(parsedStep.retries).toBe(step.retries);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
    
    test('Граф зависимостей сохраняет все шаги', () => {
      fc.assert(
        fc.property(
          arbitraryConfigWithValidDependencies(),
          (config) => {
            // Строим граф зависимостей
            const graph = parser.buildDependencyGraph(config.steps);
            
            // Проверяем, что все шаги присутствуют в графе
            expect(graph.steps.size).toBe(config.steps.length);
            
            for (const step of config.steps) {
              expect(graph.steps.has(step.id)).toBe(true);
              expect(graph.dependencies.has(step.id)).toBe(true);
              
              // Проверяем, что зависимости сохранились
              const deps = graph.dependencies.get(step.id) || [];
              const originalDeps = step.depends_on || [];
              expect(deps).toEqual(originalDeps);
            }
            
            // Проверяем, что порядок выполнения содержит все шаги
            expect(graph.executionOrder.length).toBe(config.steps.length);
            
            // Проверяем, что все ID шагов присутствуют в порядке выполнения
            const executionSet = new Set(graph.executionOrder);
            for (const step of config.steps) {
              expect(executionSet.has(step.id)).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

// ============================================================================
// Генераторы для Property-Based Testing
// ============================================================================

/**
 * Генератор валидных конфигураций рабочих процессов
 */
function arbitraryValidWorkflowConfig(): fc.Arbitrary<WorkflowConfig> {
  return fc.record({
    name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
    version: fc.constantFrom('1.0', '1.0.0', '2.0', '0.1.0'),
    description: fc.option(fc.string({ maxLength: 200 }), { nil: undefined }),
    author: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
    created: fc.option(fc.date().map(d => d.toISOString()), { nil: undefined }),
    settings: fc.record({
      artifacts_dir: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
      default_adapter: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
      parallel_execution: fc.option(fc.boolean(), { nil: undefined }),
      max_retries: fc.option(fc.integer({ min: 0, max: 10 }), { nil: undefined }),
      timeout: fc.option(fc.integer({ min: 10, max: 3600 }), { nil: undefined }),
      log_level: fc.option(fc.constantFrom('debug', 'info', 'warning', 'error'), { nil: undefined })
    }),
    adapters: fc.option(fc.array(arbitraryAdapterConfig(), { maxLength: 5 }), { nil: undefined }),
    roles: fc.option(fc.dictionary(
      fc.string({ minLength: 1, maxLength: 20 }),
      arbitraryRoleConfig()
    ), { nil: undefined }),
    steps: fc.array(arbitraryWorkflowStep(), { minLength: 1, maxLength: 10 })
      .chain(steps => {
        // Убеждаемся, что все ID уникальны
        const uniqueSteps = steps.map((step, index) => ({
          ...step,
          id: `step${index + 1}`
        }));
        return fc.constant(uniqueSteps);
      })
  });
}

/**
 * Генератор конфигурации адаптера
 */
function arbitraryAdapterConfig(): fc.Arbitrary<any> {
  return fc.record({
    name: fc.string({ minLength: 1, maxLength: 30 }),
    command: fc.string({ minLength: 1, maxLength: 50 }),
    args: fc.option(fc.array(fc.string({ maxLength: 50 }), { maxLength: 10 }), { nil: undefined }),
    env: fc.option(fc.dictionary(fc.string(), fc.string()), { nil: undefined }),
    parser: fc.option(fc.constantFrom('json', 'yaml', 'text', 'markdown'), { nil: undefined }),
    timeout: fc.option(fc.integer({ min: 10, max: 600 }), { nil: undefined })
  });
}

/**
 * Генератор конфигурации роли
 */
function arbitraryRoleConfig(): fc.Arbitrary<any> {
  return fc.record({
    adapter: fc.string({ minLength: 1, maxLength: 30 }),
    model: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
    role_definition: fc.option(fc.string({ maxLength: 500 }), { nil: undefined }),
    custom_instructions: fc.option(fc.string({ maxLength: 500 }), { nil: undefined }),
    permissions: fc.option(fc.array(fc.string(), { maxLength: 5 }), { nil: undefined }),
    temperature: fc.option(fc.double({ min: 0, max: 2 }), { nil: undefined }),
    max_tokens: fc.option(fc.integer({ min: 100, max: 4000 }), { nil: undefined })
  });
}

/**
 * Генератор шага рабочего процесса
 */
function arbitraryWorkflowStep(): fc.Arbitrary<WorkflowStep> {
  const stepType = fc.constantFrom<StepType>('model', 'script', 'user_input');
  
  return fc.record({
    id: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
    name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
    type: stepType,
    description: fc.option(fc.string({ maxLength: 200 }), { nil: undefined }),
    depends_on: fc.option(fc.array(fc.string(), { maxLength: 3 }), { nil: undefined }),
    condition: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
    role: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
    adapter: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
    model: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
    prompt_template: fc.option(fc.string({ maxLength: 200 }), { nil: undefined }),
    system_prompt: fc.option(fc.string({ maxLength: 200 }), { nil: undefined }),
    script: fc.option(fc.string({ maxLength: 200 }), { nil: undefined }),
    shell: fc.option(fc.constantFrom('bash', 'python', 'node'), { nil: undefined }),
    input_format: fc.option(fc.constantFrom('text', 'json', 'yaml', 'questions'), { nil: undefined }),
    prompt_message: fc.option(fc.string({ maxLength: 200 }), { nil: undefined }),
    inputs: fc.option(fc.dictionary(fc.string(), fc.string()), { nil: undefined }),
    outputs: fc.option(fc.dictionary(fc.string(), fc.string()), { nil: undefined }),
    timeout: fc.option(fc.integer({ min: 10, max: 600 }), { nil: undefined }),
    retries: fc.option(fc.integer({ min: 0, max: 5 }), { nil: undefined }),
    continue_on_error: fc.option(fc.boolean(), { nil: undefined })
  });
}

/**
 * Генератор конфигурации с циклической зависимостью
 */
function arbitraryConfigWithCycle(): fc.Arbitrary<WorkflowConfig> {
  return fc.integer({ min: 2, max: 5 }).chain(numSteps => {
    // Создаём шаги с циклической зависимостью
    const steps: WorkflowStep[] = [];
    
    for (let i = 0; i < numSteps; i++) {
      const stepId = `step${i + 1}`;
      const nextStepId = `step${(i + 1) % numSteps + 1}`;
      
      steps.push({
        id: stepId,
        name: `Step ${i + 1}`,
        type: 'model',
        depends_on: i === numSteps - 1 ? ['step1'] : [nextStepId] // Создаём цикл
      });
    }
    
    return fc.constant({
      name: 'test-workflow',
      version: '1.0',
      settings: {
        artifacts_dir: 'artifacts'
      },
      steps
    } as WorkflowConfig);
  });
}

/**
 * Генератор конфигурации с невалидной зависимостью
 */
function arbitraryConfigWithInvalidDependency(): fc.Arbitrary<WorkflowConfig> {
  return fc.record({
    numSteps: fc.integer({ min: 1, max: 5 }),
    invalidDepName: fc.string({ minLength: 1, maxLength: 20 })
  }).chain(({ numSteps, invalidDepName }) => {
    const steps: WorkflowStep[] = [];
    
    for (let i = 0; i < numSteps; i++) {
      steps.push({
        id: `step${i + 1}`,
        name: `Step ${i + 1}`,
        type: 'model'
      });
    }
    
    // Добавляем шаг с невалидной зависимостью
    const invalidStepIndex = Math.floor(Math.random() * numSteps);
    steps[invalidStepIndex].depends_on = [`nonexistent_${invalidDepName}`];
    
    return fc.constant({
      name: 'test-workflow',
      version: '1.0',
      settings: {
        artifacts_dir: 'artifacts'
      },
      steps
    } as WorkflowConfig);
  });
}

/**
 * Генератор конфигурации с валидными зависимостями
 */
function arbitraryConfigWithValidDependencies(): fc.Arbitrary<WorkflowConfig> {
  return fc.integer({ min: 2, max: 6 }).chain(numSteps => {
    const steps: WorkflowStep[] = [];
    
    // Создаём шаги с валидными зависимостями (линейная цепочка)
    for (let i = 0; i < numSteps; i++) {
      const stepId = `step${i + 1}`;
      const depends_on = i > 0 ? [`step${i}`] : undefined;
      
      steps.push({
        id: stepId,
        name: `Step ${i + 1}`,
        type: 'model',
        depends_on
      });
    }
    
    return fc.constant({
      name: 'test-workflow',
      version: '1.0',
      settings: {
        artifacts_dir: 'artifacts'
      },
      steps
    } as WorkflowConfig);
  });
}

/**
 * Генератор полного шага с всеми полями
 */
function arbitraryCompleteWorkflowStep(): fc.Arbitrary<WorkflowStep> {
  return fc.record({
    id: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
    name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
    type: fc.constantFrom<StepType>('model', 'script', 'user_input'),
    description: fc.option(fc.string({ maxLength: 200 }), { nil: undefined }),
    depends_on: fc.option(fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 3 }), { nil: undefined }),
    adapter: fc.string({ minLength: 1, maxLength: 30 }),
    prompt_template: fc.string({ minLength: 1, maxLength: 200 }),
    inputs: fc.dictionary(
      fc.string({ minLength: 1, maxLength: 20 }),
      fc.string({ minLength: 1, maxLength: 50 }),
      { minKeys: 1, maxKeys: 5 }
    ),
    outputs: fc.dictionary(
      fc.string({ minLength: 1, maxLength: 20 }),
      fc.string({ minLength: 1, maxLength: 50 }),
      { minKeys: 1, maxKeys: 5 }
    ),
    timeout: fc.integer({ min: 10, max: 600 }),
    retries: fc.integer({ min: 0, max: 5 })
  });
}
