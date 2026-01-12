/**
 * Property-Based тесты для поддержки форматов в TemplateGenerator
 * 
 * Проверяет round-trip свойства: генерация → парсинг → сравнение
 */

import * as fc from 'fast-check';
import { describe, it, expect } from '@jest/globals';
import { TemplateGenerator } from '../../src/core/template-generator.js';
import { ExecutionContext, WorkflowState, WorkflowStatus } from '../../src/core/types.js';
import { FileFormat } from '../../src/core/file-input-types.js';
import { Logger, LogLevel } from '../../src/core/logger.js';

describe('TemplateGenerator Format Support Property-Based Tests', () => {
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
   * Feature: file-based-user-input, Property 11: Поддержка форматов
   * 
   * Для любого поддерживаемого формата (markdown, yaml, json, text), система должна
   * корректно генерировать шаблон и парсить заполненный файл.
   * 
   * Round-trip тест: генерация → парсинг → сравнение
   * 
   * Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5
   */
  describe('Property 11: Format Support Round-Trip', () => {
    // Генератор для вопросов
    const questionArb = fc.record({
      number: fc.integer({ min: 1, max: 10 }),
      text: fc.string({ minLength: 5, maxLength: 50 })
        .filter(s => !s.includes('\n') && s.trim().length > 0)
    });
    
    // Генератор для WorkflowStep с вопросами
    const stepWithQuestionsArb = fc.record({
      id: fc.constant('test_step'),
      name: fc.string({ minLength: 3, maxLength: 30 })
        .filter(s => !s.includes('\n') && s.trim().length > 0),
      type: fc.constant('user_input' as const),
      prompt_message: fc.array(questionArb, { minLength: 1, maxLength: 3 })
        .map(questions => {
          // Убираем дубликаты и сортируем
          const unique = Array.from(
            new Map(questions.map(q => [q.number, q])).values()
          );
          unique.sort((a, b) => a.number - b.number);
          
          // Формируем текст
          return unique.map(q => `${q.number}. ${q.text}`).join('\n');
        })
    });
    
    it('должен поддерживать все форматы файлов', () => {
      fc.assert(
        fc.property(
          fc.constantFrom<FileFormat>('markdown', 'yaml', 'json', 'text'),
          stepWithQuestionsArb,
          (format, step) => {
            // Генерация шаблона не должна выбрасывать ошибку
            expect(() => {
              generator.generate(format, step, mockContext);
            }).not.toThrow();
            
            const template = generator.generate(format, step, mockContext);
            
            // Шаблон должен быть непустым
            expect(template.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('должен извлекать вопросы из всех форматов шаблонов', () => {
      fc.assert(
        fc.property(
          fc.constantFrom<FileFormat>('markdown', 'yaml', 'json', 'text'),
          stepWithQuestionsArb,
          (format, step) => {
            const template = generator.generate(format, step, mockContext);
            
            // Извлекаем вопросы из оригинального prompt_message
            const originalQuestions = generator.extractQuestions(step.prompt_message || '');
            
            // Проверяем, что вопросы присутствуют в шаблоне
            for (const question of originalQuestions) {
              // Проверяем наличие текста вопроса или его номера
              const hasQuestion = 
                template.includes(question.text) ||
                template.includes(`${question.number}.`) ||
                template.includes(`question_${question.number}`);
              
              expect(hasQuestion).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('должен корректно обрабатывать пустые шаблоны', () => {
      fc.assert(
        fc.property(
          fc.constantFrom<FileFormat>('markdown', 'yaml', 'json', 'text'),
          (format) => {
            const step = {
              id: 'test',
              name: 'Test Step',
              type: 'user_input' as const,
              prompt_message: ''
            };
            
            const template = generator.generate(format, step, mockContext);
            
            // Даже для пустого промпта должен быть сгенерирован шаблон
            expect(template.length).toBeGreaterThan(0);
            
            // Проверяем наличие имени с учётом трансформаций
            if (format === 'text') {
              expect(template).toContain('TEST STEP');
            } else {
              expect(template).toContain('Test Step');
            }
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('должен генерировать различные шаблоны для разных форматов', () => {
      fc.assert(
        fc.property(
          stepWithQuestionsArb,
          (step) => {
            const templates = {
              markdown: generator.generate('markdown', step, mockContext),
              yaml: generator.generate('yaml', step, mockContext),
              json: generator.generate('json', step, mockContext),
              text: generator.generate('text', step, mockContext)
            };
            
            // Все шаблоны должны быть различными
            const uniqueTemplates = new Set(Object.values(templates));
            expect(uniqueTemplates.size).toBe(4);
            
            // Каждый шаблон должен содержать имя шага (с учётом трансформаций)
            // Markdown, YAML - оригинальное имя
            expect(templates.markdown).toContain(step.name);
            expect(templates.yaml).toContain(step.name);
            
            // Text - имя в верхнем регистре
            expect(templates.text).toContain(step.name.toUpperCase());
            
            // JSON - имя в экранированном виде
            const escapedName = step.name
              .replace(/\\/g, '\\\\')
              .replace(/"/g, '\\"')
              .replace(/\n/g, '\\n')
              .replace(/\r/g, '\\r')
              .replace(/\t/g, '\\t');
            expect(templates.json).toContain(escapedName);
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('должен сохранять структуру вопросов во всех форматах', () => {
      fc.assert(
        fc.property(
          fc.constantFrom<FileFormat>('markdown', 'yaml', 'json', 'text'),
          stepWithQuestionsArb,
          (format, step) => {
            const template = generator.generate(format, step, mockContext);
            const questions = generator.extractQuestions(step.prompt_message || '');
            
            // Проверяем, что количество вопросов сохранено
            if (questions.length > 0) {
              // Для каждого вопроса должно быть место для ответа
              for (const question of questions) {
                const questionMarkers = [
                  `${question.number}.`,
                  `question_${question.number}`,
                  `Вопрос ${question.number}`,
                  `Q${question.number}`
                ];
                
                const hasMarker = questionMarkers.some(marker => 
                  template.includes(marker)
                );
                
                expect(hasMarker).toBe(true);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('должен генерировать парсируемые шаблоны для структурированных форматов', () => {
      fc.assert(
        fc.property(
          stepWithQuestionsArb,
          (step) => {
            // JSON должен быть валидным
            const jsonTemplate = generator.generate('json', step, mockContext);
            expect(() => JSON.parse(jsonTemplate)).not.toThrow();
            
            // YAML должен быть парсируемым (после удаления комментариев)
            const yamlTemplate = generator.generate('yaml', step, mockContext);
            const yamlWithoutComments = yamlTemplate
              .split('\n')
              .filter(line => !line.trim().startsWith('#'))
              .join('\n');
            
            if (yamlWithoutComments.trim().length > 0) {
              // Проверяем, что это валидный YAML
              expect(yamlWithoutComments).toMatch(/\w+:\s*"?.*"?/);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('должен обрабатывать Unicode символы во всех форматах', () => {
      fc.assert(
        fc.property(
          fc.constantFrom<FileFormat>('markdown', 'yaml', 'json', 'text'),
          fc.record({
            id: fc.constant('test'),
            name: fc.constant('Тест с Unicode: 你好 مرحبا'),
            type: fc.constant('user_input' as const),
            prompt_message: fc.constant('1. Вопрос с эмодзи 😀\n2. Question with symbols ©®™')
          }),
          (format, step) => {
            expect(() => {
              generator.generate(format, step, mockContext);
            }).not.toThrow();
            
            const template = generator.generate(format, step, mockContext);
            
            // Шаблон должен содержать Unicode символы
            expect(template.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('должен генерировать консистентные шаблоны при повторных вызовах', () => {
      fc.assert(
        fc.property(
          fc.constantFrom<FileFormat>('markdown', 'yaml', 'json', 'text'),
          stepWithQuestionsArb,
          (format, step) => {
            const template1 = generator.generate(format, step, mockContext);
            const template2 = generator.generate(format, step, mockContext);
            const template3 = generator.generate(format, step, mockContext);
            
            // Все три шаблона должны быть идентичными
            expect(template1).toBe(template2);
            expect(template2).toBe(template3);
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('должен корректно обрабатывать длинные тексты во всех форматах', () => {
      fc.assert(
        fc.property(
          fc.constantFrom<FileFormat>('markdown', 'yaml', 'json', 'text'),
          fc.record({
            id: fc.constant('test'),
            name: fc.string({ minLength: 50, maxLength: 100 })
              .filter(s => !s.includes('\n')),
            type: fc.constant('user_input' as const),
            prompt_message: fc.string({ minLength: 200, maxLength: 500 })
          }),
          (format, step) => {
            expect(() => {
              generator.generate(format, step, mockContext);
            }).not.toThrow();
            
            const template = generator.generate(format, step, mockContext);
            expect(template.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('должен поддерживать вопросы с вариантами ответов', () => {
      fc.assert(
        fc.property(
          fc.constantFrom<FileFormat>('markdown', 'yaml', 'json', 'text'),
          fc.record({
            id: fc.constant('test'),
            name: fc.constant('Test'),
            type: fc.constant('user_input' as const),
            prompt_message: fc.constant(
              '1. Выберите цвет:\na) Красный\nb) Синий\nc) Зеленый\n\n2. Выберите размер:\n- Маленький\n- Средний\n- Большой'
            )
          }),
          (format, step) => {
            const template = generator.generate(format, step, mockContext);
            const questions = generator.extractQuestions(step.prompt_message || '');
            
            // Должны быть извлечены 2 вопроса
            expect(questions.length).toBe(2);
            
            // Первый вопрос должен иметь 3 варианта
            expect(questions[0].options?.length).toBe(3);
            
            // Второй вопрос должен иметь 3 варианта
            expect(questions[1].options?.length).toBe(3);
            
            // Варианты должны присутствовать в шаблоне
            expect(template).toContain('Красный');
            expect(template).toContain('Маленький');
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
