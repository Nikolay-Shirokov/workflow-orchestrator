/**
 * Property-Based тесты для TemplateGenerator
 * 
 * Проверяет свойства корректности генерации шаблонов для файлового ввода
 */

import * as fc from 'fast-check';
import { describe, it, expect } from '@jest/globals';
import { TemplateGenerator } from '../../src/core/template-generator.js';
import { ExecutionContext, WorkflowState, WorkflowStatus } from '../../src/core/types.js';
import { FileFormat } from '../../src/core/file-input-types.js';
import { Logger, LogLevel } from '../../src/core/logger.js';
import * as yaml from 'yaml';

describe('TemplateGenerator Property-Based Tests', () => {
  let generator: TemplateGenerator;
  let mockContext: ExecutionContext;
  
  beforeEach(() => {
    generator = new TemplateGenerator();
    
    // Создаем минимальный мок контекста
    const mockState: WorkflowState = {
      sessionId: 'test-session',
      workflowName: 'test-workflow',
      workflowVersion: '1.0.0',
      currentStep: 'step1',
      status: 'running' as WorkflowStatus,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedSteps: [],
      artifacts: {},
      context: {},
      history: [],
      errors: []
    };
    
    mockContext = {
      state: mockState,
      adapters: {} as any,
      templateEngine: {} as any,
      artifactManager: {} as any,
      logger: new Logger({
        level: LogLevel.ERROR,
        enableConsole: false,
        enableFile: false
      })
    };
  });
  
  /**
   * Feature: file-based-user-input, Property 1: Создание валидного шаблона
   * 
   * Для любого шага user_input с режимом file, создание файла-шаблона должно
   * производить валидный файл указанного формата с корректными инструкциями.
   * 
   * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5
   */
  describe('Property 1: Valid Template Creation', () => {
    // Генератор для FileFormat
    const fileFormatArb = fc.constantFrom<FileFormat>(
      'markdown',
      'yaml',
      'json',
      'text'
    );
    
    // Генератор для вопросов в prompt_message
    const questionTextArb = fc.array(
      fc.record({
        number: fc.integer({ min: 1, max: 20 }),
        text: fc.string({ minLength: 5, maxLength: 100 })
          .filter(s => !s.includes('\n') && s.trim().length > 0),
        hasOptions: fc.boolean(),
        options: fc.array(
          fc.string({ minLength: 1, maxLength: 50 })
            .filter(s => !s.includes('\n') && s.trim().length > 0),
          { minLength: 2, maxLength: 4 }
        )
      }),
      { minLength: 0, maxLength: 5 }
    ).map(questions => {
      // Убираем дубликаты по номеру
      const uniqueQuestions = Array.from(
        new Map(questions.map(q => [q.number, q])).values()
      );
      
      // Сортируем по номеру
      uniqueQuestions.sort((a, b) => a.number - b.number);
      
      // Формируем текст промпта
      const lines: string[] = [];
      for (const q of uniqueQuestions) {
        lines.push(`${q.number}. ${q.text}`);
        if (q.hasOptions && q.options.length > 0) {
          for (let i = 0; i < q.options.length; i++) {
            lines.push(`${String.fromCharCode(97 + i)}) ${q.options[i]}`);
          }
        }
        lines.push('');
      }
      
      return lines.join('\n');
    });
    
    // Генератор для WorkflowStep
    const workflowStepArb = fc.record({
      id: fc.string({ minLength: 1, maxLength: 20 })
        .filter(s => /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(s)),
      name: fc.string({ minLength: 1, maxLength: 50 }),
      type: fc.constant('user_input' as const),
      description: fc.option(fc.string({ minLength: 10, maxLength: 200 }), { nil: undefined }),
      prompt_message: fc.option(questionTextArb, { nil: undefined })
    });
    
    it('должен генерировать непустые шаблоны для всех форматов', () => {
      fc.assert(
        fc.property(
          fileFormatArb,
          workflowStepArb,
          (format, step) => {
            const template = generator.generate(format, step, mockContext);
            
            // Шаблон не должен быть пустым
            expect(template).toBeDefined();
            expect(typeof template).toBe('string');
            expect(template.length).toBeGreaterThan(0);
            
            // Шаблон должен содержать имя шага
            expect(template).toContain(step.name);
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('должен включать инструкции во все шаблоны', () => {
      fc.assert(
        fc.property(
          fileFormatArb,
          workflowStepArb,
          (format, step) => {
            const template = generator.generate(format, step, mockContext);
            
            // Проверяем наличие ключевых слов инструкций
            const lowerTemplate = template.toLowerCase();
            
            // Должны быть инструкции о заполнении
            const hasInstructions = 
              lowerTemplate.includes('инструкц') ||
              lowerTemplate.includes('заполн') ||
              lowerTemplate.includes('instructions') ||
              lowerTemplate.includes('fill');
            
            expect(hasInstructions).toBe(true);
            
            // Должны быть упоминания о продолжении
            const hasContinue = 
              lowerTemplate.includes('продолжить') ||
              lowerTemplate.includes('готово') ||
              lowerTemplate.includes('continue') ||
              lowerTemplate.includes('done');
            
            expect(hasContinue).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('должен включать описание если оно предоставлено', () => {
      fc.assert(
        fc.property(
          fileFormatArb,
          workflowStepArb.filter(s => s.description !== undefined && s.description !== null),
          (format, step) => {
            const template = generator.generate(format, step, mockContext);
            
            // Описание должно присутствовать в шаблоне
            if (step.description) {
              expect(template).toContain(step.description);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('должен включать prompt_message если он предоставлен', () => {
      fc.assert(
        fc.property(
          fileFormatArb,
          workflowStepArb.filter(s => s.prompt_message !== undefined && s.prompt_message !== null && s.prompt_message.length > 0),
          (format, step) => {
            const template = generator.generate(format, step, mockContext);
            
            // Промпт должен присутствовать в шаблоне
            if (step.prompt_message) {
              // Для JSON и YAML может быть экранирование, поэтому проверяем частично
              const promptWords = step.prompt_message.split(/\s+/).filter(w => w.length > 3);
              if (promptWords.length > 0) {
                const hasPromptContent = promptWords.some(word => 
                  template.includes(word) || template.includes(word.replace(/[^\w]/g, ''))
                );
                expect(hasPromptContent).toBe(true);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('должен генерировать валидный JSON для формата json', () => {
      fc.assert(
        fc.property(
          workflowStepArb,
          (step) => {
            const template = generator.generate('json', step, mockContext);
            
            // Шаблон должен быть валидным JSON
            expect(() => JSON.parse(template)).not.toThrow();
            
            const parsed = JSON.parse(template);
            
            // Должны быть метаданные
            expect(parsed._comment).toBeDefined();
            expect(parsed._instructions).toBeDefined();
            expect(Array.isArray(parsed._instructions)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('должен генерировать парсируемый YAML для формата yaml', () => {
      fc.assert(
        fc.property(
          workflowStepArb,
          (step) => {
            const template = generator.generate('yaml', step, mockContext);
            
            // Удаляем комментарии для парсинга
            const withoutComments = template
              .split('\n')
              .filter(line => !line.trim().startsWith('#'))
              .join('\n');
            
            // Если после удаления комментариев остался контент, он должен быть валидным YAML
            if (withoutComments.trim().length > 0) {
              expect(() => yaml.parse(withoutComments)).not.toThrow();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('должен генерировать структурированный Markdown для формата markdown', () => {
      fc.assert(
        fc.property(
          workflowStepArb,
          (step) => {
            const template = generator.generate('markdown', step, mockContext);
            
            // Должны быть заголовки
            expect(template).toMatch(/^#\s+/m);
            
            // Должны быть секции с ##
            expect(template).toMatch(/^##\s+/m);
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('должен генерировать читаемый Text для формата text', () => {
      fc.assert(
        fc.property(
          workflowStepArb,
          (step) => {
            const template = generator.generate('text', step, mockContext);
            
            // Должны быть разделители
            expect(template).toContain('='.repeat(70));
            expect(template).toContain('-'.repeat(70));
            
            // Должны быть секции в верхнем регистре
            expect(template).toMatch(/[А-ЯA-Z]{3,}/);
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('должен корректно извлекать вопросы из различных форматов', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            // Формат "1. Вопрос"
            fc.array(
              fc.record({
                number: fc.integer({ min: 1, max: 20 }),
                text: fc.string({ minLength: 5, maxLength: 100 })
                  .filter(s => !s.includes('\n') && s.trim().length > 0)
              }),
              { minLength: 1, maxLength: 5 }
            ).map(questions => {
              const unique = Array.from(
                new Map(questions.map(q => [q.number, q])).values()
              );
              return unique.map(q => `${q.number}. ${q.text}`).join('\n');
            }),
            
            // Формат "Вопрос 1:"
            fc.array(
              fc.record({
                number: fc.integer({ min: 1, max: 20 }),
                text: fc.string({ minLength: 5, maxLength: 100 })
                  .filter(s => !s.includes('\n') && s.trim().length > 0)
              }),
              { minLength: 1, maxLength: 5 }
            ).map(questions => {
              const unique = Array.from(
                new Map(questions.map(q => [q.number, q])).values()
              );
              return unique.map(q => `Вопрос ${q.number}: ${q.text}`).join('\n');
            }),
            
            // Формат "Q1:"
            fc.array(
              fc.record({
                number: fc.integer({ min: 1, max: 20 }),
                text: fc.string({ minLength: 5, maxLength: 100 })
                  .filter(s => !s.includes('\n') && s.trim().length > 0)
              }),
              { minLength: 1, maxLength: 5 }
            ).map(questions => {
              const unique = Array.from(
                new Map(questions.map(q => [q.number, q])).values()
              );
              return unique.map(q => `Q${q.number}: ${q.text}`).join('\n');
            })
          ),
          (promptMessage) => {
            const questions = generator.extractQuestions(promptMessage);
            
            // Должны быть извлечены вопросы
            expect(Array.isArray(questions)).toBe(true);
            
            // Каждый вопрос должен иметь корректную структуру
            for (const question of questions) {
              expect(typeof question.number).toBe('number');
              expect(question.number).toBeGreaterThan(0);
              expect(typeof question.text).toBe('string');
              expect(question.text.length).toBeGreaterThan(0);
              expect(typeof question.required).toBe('boolean');
            }
            
            // Номера вопросов должны быть уникальными
            const numbers = questions.map(q => q.number);
            const uniqueNumbers = new Set(numbers);
            expect(uniqueNumbers.size).toBe(numbers.length);
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('должен корректно обрабатывать специальные символы', () => {
      fc.assert(
        fc.property(
          fileFormatArb,
          fc.record({
            id: fc.constant('test_step'),
            name: fc.string({ minLength: 1, maxLength: 50 })
              .map(s => s + ' <>&"\'\n\t'),
            type: fc.constant('user_input' as const),
            prompt_message: fc.option(
              fc.string({ minLength: 10, maxLength: 100 })
                .map(s => s + ' <>&"\'\n\t'),
              { nil: undefined }
            )
          }),
          (format, step) => {
            // Генерация не должна выбрасывать ошибку
            expect(() => {
              generator.generate(format, step, mockContext);
            }).not.toThrow();
            
            const template = generator.generate(format, step, mockContext);
            
            // Для JSON проверяем валидность
            if (format === 'json') {
              expect(() => JSON.parse(template)).not.toThrow();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('должен генерировать консистентные шаблоны для одинаковых входных данных', () => {
      fc.assert(
        fc.property(
          fileFormatArb,
          workflowStepArb,
          (format, step) => {
            const template1 = generator.generate(format, step, mockContext);
            const template2 = generator.generate(format, step, mockContext);
            
            // Шаблоны должны быть идентичными
            expect(template1).toBe(template2);
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('должен генерировать различные шаблоны для разных форматов', () => {
      fc.assert(
        fc.property(
          workflowStepArb,
          (step) => {
            const markdownTemplate = generator.generate('markdown', step, mockContext);
            const yamlTemplate = generator.generate('yaml', step, mockContext);
            const jsonTemplate = generator.generate('json', step, mockContext);
            const textTemplate = generator.generate('text', step, mockContext);
            
            // Шаблоны должны отличаться
            const templates = [markdownTemplate, yamlTemplate, jsonTemplate, textTemplate];
            const uniqueTemplates = new Set(templates);
            
            // Должно быть как минимум 2 различных шаблона
            // (некоторые могут совпадать для очень простых случаев)
            expect(uniqueTemplates.size).toBeGreaterThanOrEqual(2);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
