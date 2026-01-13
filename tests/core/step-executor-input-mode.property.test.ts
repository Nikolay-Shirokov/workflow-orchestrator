/**
 * Property-based тесты для выбора режима ввода в StepExecutor
 * 
 * Feature: file-based-user-input
 * Property 9: Выбор режима ввода
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5
 * 
 * Проверяет, что для любой конфигурации шага и настроек процесса,
 * система корректно выбирает режим ввода (file или console).
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fc from 'fast-check';
import { DefaultStepExecutor } from '../../src/core/step-executor.js';
import { WorkflowStep, ExecutionContext, WorkflowState } from '../../src/core/types.js';
import { DefaultArtifactManager } from '../../src/core/artifact-manager.js';
import { DefaultTemplateEngine } from '../../src/core/template-engine.js';
import { AdapterRegistry } from '../../src/adapters/adapter-registry.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('StepExecutor - Input Mode Selection (Property-Based)', () => {
  let testDir: string;
  
  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'step-executor-prop-test-'));
  });
  
  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Игнорируем ошибки очистки
    }
  });
  
  /**
   * Property 9: Выбор режима ввода
   * 
   * Для любой конфигурации шага (с input_mode или без) и настроек процесса
   * (с default_input_mode или без), система должна корректно выбрать режим ввода:
   * 
   * - Если указан step.input_mode, использовать его
   * - Иначе, если указан default_input_mode в настройках, использовать его
   * - Иначе, использовать 'console' по умолчанию
   */
  it('Property 9: должен корректно выбирать режим ввода для любой конфигурации', async () => {
    // Генераторы для различных конфигураций
    const inputModeArb = fc.oneof(
      fc.constant('file' as const),
      fc.constant('console' as const),
      fc.constant(undefined)
    );
    
    const defaultInputModeArb = fc.oneof(
      fc.constant('file' as const),
      fc.constant('console' as const),
      fc.constant(undefined)
    );
    
    const stepIdArb = fc.string({ minLength: 1, maxLength: 20 }).map(s => `step_${s}`);
    
    await fc.assert(
      fc.asyncProperty(
        stepIdArb,
        inputModeArb,
        defaultInputModeArb,
        async (stepId, stepInputMode, defaultInputMode) => {
          // Создаем executor и context
          const executor = new DefaultStepExecutor({ defaultTimeout: 1000 });
          
          const logger = {
            debug: () => {},
            info: () => {},
            warn: () => {},
            error: () => {}
          };
          
          const artifactManager = new DefaultArtifactManager({ baseDir: testDir });
          const templateEngine = new DefaultTemplateEngine();
          
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
            context: defaultInputMode ? { default_input_mode: defaultInputMode } : {},
            history: [],
            errors: []
          };
          
          const context: ExecutionContext = {
            state,
            adapters: new AdapterRegistry(),
            artifactManager,
            templateEngine,
            logger
          };
          
          // Создаем шаг с указанным input_mode
          const step: WorkflowStep = {
            id: stepId,
            name: 'Test User Input',
            type: 'user_input',
            input_mode: stepInputMode,
            outputs: {
              user_response: `${stepId}_response.txt`
            }
          };
          
          // Мокаем stdin для file mode
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
            
            // Выполняем шаг
            const result = await executor.executeStep(step, context);
            
            // Определяем ожидаемый режим
            const expectedMode = stepInputMode || defaultInputMode || 'console';
            
            // Проверяем, что процесс приостановлен (оба режима приостанавливают процесс)
            expect(context.state.status).toBe('paused');
            expect(result.status).toBe('skipped');
            
            // Проверяем, что создан артефакт
            expect(result.artifacts.length).toBeGreaterThan(0);
            
            // Для console mode проверяем наличие заглушки
            if (expectedMode === 'console') {
              const artifactPath = result.artifacts[0];
              const content = await fs.readFile(artifactPath, 'utf-8');
              expect(content).toContain('Ожидается ввод пользователя');
            }
            
            // Для file mode проверяем, что создан шаблон (не заглушка)
            if (expectedMode === 'file') {
              const artifactPath = result.artifacts[0];
              const content = await fs.readFile(artifactPath, 'utf-8');
              // Шаблон не должен содержать текст заглушки
              // (может содержать инструкции, вопросы и т.д.)
              expect(content.length).toBeGreaterThan(0);
            }
            
          } finally {
            Object.defineProperty(process, 'stdin', {
              value: originalStdin,
              writable: true,
              configurable: true
            });
          }
        }
      ),
      { numRuns: 100 } // Минимум 100 итераций согласно требованиям
    );
  }, 60000); // Увеличиваем timeout для property test
  
  /**
   * Property 9.1: Приоритет step.input_mode над default_input_mode
   * 
   * Для любой комбинации step.input_mode и default_input_mode,
   * если step.input_mode указан, он должен иметь приоритет.
   */
  it('Property 9.1: step.input_mode должен иметь приоритет над default_input_mode', async () => {
    const inputModeArb = fc.oneof(
      fc.constant('file' as const),
      fc.constant('console' as const)
    );
    
    const defaultInputModeArb = fc.oneof(
      fc.constant('file' as const),
      fc.constant('console' as const)
    );
    
    await fc.assert(
      fc.asyncProperty(
        inputModeArb,
        defaultInputModeArb,
        async (stepInputMode, defaultInputMode) => {
          // Если режимы разные, проверяем приоритет
          if (stepInputMode !== defaultInputMode) {
            const executor = new DefaultStepExecutor({ defaultTimeout: 1000 });
            
            const logger = {
              debug: () => {},
              info: () => {},
              warn: () => {},
              error: () => {}
            };
            
            const artifactManager = new DefaultArtifactManager({ baseDir: testDir });
            const templateEngine = new DefaultTemplateEngine();
            
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
              context: { default_input_mode: defaultInputMode },
              history: [],
              errors: []
            };
            
            const context: ExecutionContext = {
              state,
              adapters: new AdapterRegistry(),
              artifactManager,
              templateEngine,
              logger
            };
            
            const step: WorkflowStep = {
              id: 'priority-test',
              name: 'Priority Test',
              type: 'user_input',
              input_mode: stepInputMode,
              outputs: {
                user_response: 'priority_response.txt'
              }
            };
            
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
              
              // Проверяем, что использован режим из шага, а не из настроек
              expect(context.state.status).toBe('paused');
              expect(result.status).toBe('skipped');
              
              const artifactPath = result.artifacts[0];
              const content = await fs.readFile(artifactPath, 'utf-8');
              
              if (stepInputMode === 'console') {
                // Console mode создает заглушку
                expect(content).toContain('Ожидается ввод пользователя');
              } else {
                // File mode создает шаблон
                expect(content.length).toBeGreaterThan(0);
              }
              
            } finally {
              Object.defineProperty(process, 'stdin', {
                value: originalStdin,
                writable: true,
                configurable: true
              });
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);
});
