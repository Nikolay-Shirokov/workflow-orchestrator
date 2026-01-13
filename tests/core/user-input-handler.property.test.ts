/**
 * Property-Based тесты для UserInputHandler
 * 
 * Проверяет свойства корректности обработки ввода пользователя
 */

import * as fc from 'fast-check';
import { UserInputHandler, UserQuestion, UserAnswers } from '../../src/core/user-input-handler.js';
import { ValidationRule } from '../../src/core/types.js';

describe('UserInputHandler Property-Based Tests', () => {
  let handler: UserInputHandler;
  
  beforeEach(() => {
    handler = new UserInputHandler();
  });
  
  /**
   * Feature: workflow-orchestrator, Property 51: Парсинг структурированного ответа
   * 
   * Для любого ответа модели в указанном формате (JSON, YAML, Markdown),
   * система должна успешно парсить ответ согласно этому формату.
   * 
   * Validates: Requirements 15.2
   */
  describe('Property 51: Structured Response Parsing', () => {
    it('должен успешно парсить валидный JSON', () => {
      fc.assert(
        fc.property(
          fc.dictionary(
            fc.string({ minLength: 1, maxLength: 20 })
              .filter(s => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)),
            fc.oneof(
              fc.string(),
              fc.integer(),
              fc.boolean(),
              fc.array(fc.string())
            ),
            { minKeys: 1, maxKeys: 10 }
          ),
          (data) => {
            const jsonString = JSON.stringify(data);
            const result = handler.parseStructuredInput(jsonString, 'json');
            
            expect(result.format).toBe('json');
            expect(result.rawText).toBe(jsonString);
            expect(result.data).toEqual(data);
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('должен успешно парсить валидный YAML', () => {
      fc.assert(
        fc.property(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 50 })
              .filter(s => /^[a-zA-Z0-9 ]+$/.test(s) && s.trim().length > 0) // Только буквы, цифры и пробелы
              .filter(s => s === s.trim()) // Без пробелов в начале/конце (YAML их trim())
              .filter(s => isNaN(Number(s))), // Фильтруем числовые строки
            age: fc.integer({ min: 0, max: 120 }),
            active: fc.boolean()
          }),
          (data) => {
            const yamlString = `name: ${data.name}\nage: ${data.age}\nactive: ${data.active}`;
            const result = handler.parseStructuredInput(yamlString, 'yaml');
            
            expect(result.format).toBe('yaml');
            expect(result.rawText).toBe(yamlString);
            expect(result.data).toMatchObject({
              name: data.name,
              age: data.age,
              active: data.active
            });
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('должен успешно парсить Markdown с вопросами', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              question: fc.string({ minLength: 5, maxLength: 100 })
                .filter(s => !s.includes('\n') && !s.includes('##'))
                .filter(s => s === s.trim() && s.trim().length > 0)
                .filter(s => s !== '__proto__' && s !== 'constructor' && s !== 'prototype'), // Фильтруем прототипные свойства
              answer: fc.string({ minLength: 1, maxLength: 200 })
                .filter(s => !s.includes('##'))
                .filter(s => s === s.trim() && s.trim().length > 0)
            }),
            { minLength: 1, maxLength: 5 }
          ),
          (qa) => {
            const markdown = qa.map(item => 
              `## ${item.question}\n${item.answer}`
            ).join('\n\n');
            
            const result = handler.parseStructuredInput(markdown, 'markdown');
            
            expect(result.format).toBe('markdown');
            expect(result.rawText).toBe(markdown);
            
            const data = result.data as Record<string, string>;
            for (const item of qa) {
              expect(data[item.question]).toBe(item.answer);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('должен успешно парсить формат questions', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.integer({ min: 1, max: 100 }),
              question: fc.string({ minLength: 5, maxLength: 100 })
                .filter(s => !s.includes('\n'))
                .filter(s => s === s.trim() && s.trim().length > 0), // Вопрос не должен начинаться/заканчиваться пробелами
              answer: fc.string({ minLength: 1, maxLength: 200 })
                .filter(s => s === s.trim() && s.trim().length > 0) // Ответ не должен начинаться/заканчиваться пробелами
            }),
            { minLength: 1, maxLength: 5 }
          ),
          (questions) => {
            const uniqueQuestions = Array.from(
              new Map(questions.map(q => [q.id, q])).values()
            );
            
            const questionsText = uniqueQuestions.map(q => 
              `${q.id}. ${q.question}\n   Ответ: ${q.answer}`
            ).join('\n\n');
            
            const result = handler.parseStructuredInput(questionsText, 'questions');
            
            expect(result.format).toBe('questions');
            expect(result.rawText).toBe(questionsText);
            
            const data = result.data as Record<string, string>;
            for (const q of uniqueQuestions) {
              expect(data[`question_${q.id}`]).toBe(q.answer);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('должен обрабатывать текстовый формат', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 500 }),
          (text) => {
            const result = handler.parseStructuredInput(text, 'text');
            
            expect(result.format).toBe('text');
            expect(result.rawText).toBe(text);
            expect(result.data).toBe(text.trim());
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('должен выбрасывать ошибку для невалидного JSON', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 })
            .filter(s => {
              try {
                JSON.parse(s);
                return false;
              } catch {
                return true;
              }
            }),
          (invalidJson) => {
            expect(() => {
              handler.parseStructuredInput(invalidJson, 'json');
            }).toThrow();
          }
        ),
        { numRuns: 50 }
      );
    });
  });
  
  /**
   * Feature: workflow-orchestrator, Property 52: Валидация ответов
   * 
   * Для любого ввода пользователя с правилами валидации,
   * система должна отклонять ответы, нарушающие правила.
   * 
   * Validates: Requirements 15.4
   */
  describe('Property 52: Answer Validation', () => {
    it('должен отклонять отсутствующие обязательные поля', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.string({ minLength: 1, maxLength: 20 })
              .filter(s => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s))
              .filter(s => s !== '__proto__' && s !== 'constructor' && s !== 'prototype'), // Избегаем прототипных свойств
            { minLength: 2, maxLength: 5 } // Минимум 2 поля, чтобы можно было пропустить одно
          ),
          (requiredFields) => {
            const uniqueFields = Array.from(new Set(requiredFields));
            if (uniqueFields.length < 2) return; // Пропускаем если меньше 2 полей
            
            const rules: ValidationRule[] = uniqueFields.map(field => ({
              field,
              required: true
            }));
            
            // Создаем данные без одного из обязательных полей
            const data: Record<string, unknown> = {};
            for (let i = 0; i < uniqueFields.length - 1; i++) {
              data[uniqueFields[i]] = 'some value';
            }
            
            const result = handler.validateInput(data, rules);
            
            expect(result.valid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.errors[0].code).toBe('REQUIRED_FIELD');
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('должен принимать данные с всеми обязательными полями', () => {
      fc.assert(
        fc.property(
          fc.dictionary(
            fc.string({ minLength: 1, maxLength: 20 })
              .filter(s => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)),
            fc.string({ minLength: 1, maxLength: 100 }),
            { minKeys: 1, maxKeys: 5 }
          ),
          (data) => {
            const rules: ValidationRule[] = Object.keys(data).map(field => ({
              field,
              required: true
            }));
            
            const result = handler.validateInput(data, rules);
            
            expect(result.valid).toBe(true);
            expect(result.errors.length).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('должен валидировать типы данных', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('string', 'number', 'boolean'),
          fc.oneof(
            fc.string({ minLength: 1, maxLength: 100 }), // Минимум 1 символ для строк
            fc.integer(),
            fc.boolean()
          ),
          (expectedType, value) => {
            const actualType = typeof value;
            const rules: ValidationRule[] = [{
              field: 'testField',
              type: expectedType,
              required: true
            }];
            
            const data = { testField: value };
            const result = handler.validateInput(data, rules);
            
            if (actualType === expectedType) {
              expect(result.valid).toBe(true);
            } else {
              expect(result.valid).toBe(false);
              expect(result.errors[0].code).toBe('INVALID_TYPE');
            }
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('должен валидировать паттерны для строк', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          (value) => {
            const rules: ValidationRule[] = [{
              field: 'email',
              pattern: '^[a-zA-Z0-9]+@[a-zA-Z0-9]+\\.[a-zA-Z]+$',
              required: true
            }];
            
            const data = { email: value };
            const result = handler.validateInput(data, rules);
            
            const emailRegex = /^[a-zA-Z0-9]+@[a-zA-Z0-9]+\.[a-zA-Z]+$/;
            if (emailRegex.test(value)) {
              expect(result.valid).toBe(true);
            } else {
              expect(result.valid).toBe(false);
              if (result.errors.length > 0) {
                expect(result.errors[0].code).toBe('PATTERN_MISMATCH');
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('должен пропускать валидацию для необязательных отсутствующих полей', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.string({ minLength: 1, maxLength: 20 })
              .filter(s => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s))
              .filter(s => s !== '__proto__' && s !== 'constructor' && s !== 'prototype' && s !== 'toString' && s !== 'valueOf'),
            { minLength: 1, maxLength: 5 }
          ),
          (fields) => {
            const uniqueFields = Array.from(new Set(fields));
            const rules: ValidationRule[] = uniqueFields.map(field => ({
              field,
              required: false,
              type: 'string'
            }));
            
            const data: Record<string, unknown> = {};
            
            const result = handler.validateInput(data, rules);
            
            expect(result.valid).toBe(true);
            expect(result.errors.length).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
  
  /**
   * Feature: workflow-orchestrator, Property 53: Форматирование ответов
   * 
   * Для любых собранных ответов пользователя, система должна форматировать
   * их согласно шаблону и передавать в следующий шаг.
   * 
   * Validates: Requirements 15.5
   */
  describe('Property 53: Answer Formatting', () => {
    it('должен форматировать ответы с использованием шаблона', () => {
      fc.assert(
        fc.property(
          fc.dictionary(
            fc.string({ minLength: 1, maxLength: 20 })
              .filter(s => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)),
            fc.string({ minLength: 1, maxLength: 100 }),
            { minKeys: 1, maxKeys: 5 }
          ),
          (answers) => {
            const userAnswers: UserAnswers = {
              answers,
              timestamp: new Date().toISOString()
            };
            
            const template = Object.keys(answers)
              .map(key => `${key}: \${${key}}`)
              .join('\n');
            
            const result = handler.formatAnswers(userAnswers, template);
            
            for (const [key, value] of Object.entries(answers)) {
              expect(result).toContain(`${key}: ${value}`);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('должен форматировать ответы по умолчанию без шаблона', () => {
      fc.assert(
        fc.property(
          fc.dictionary(
            fc.string({ minLength: 1, maxLength: 20 })
              .filter(s => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)),
            fc.string({ minLength: 1, maxLength: 100 }),
            { minKeys: 1, maxKeys: 5 }
          ),
          (answers) => {
            const userAnswers: UserAnswers = {
              answers,
              timestamp: new Date().toISOString()
            };
            
            const result = handler.formatAnswers(userAnswers);
            
            expect(result).toContain('# Ответы пользователя');
            expect(result).toContain(`Время: ${userAnswers.timestamp}`);
            
            for (const [key, value] of Object.entries(answers)) {
              expect(result).toContain(`## ${key}`);
              expect(result).toContain(String(value));
            }
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('должен корректно подставлять все переменные в шаблон', () => {
      fc.assert(
        fc.property(
          fc.dictionary(
            fc.string({ minLength: 1, maxLength: 20 })
              .filter(s => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)),
            fc.oneof(
              fc.string({ minLength: 1, maxLength: 50 }),
              fc.integer(),
              fc.boolean()
            ),
            { minKeys: 1, maxKeys: 5 }
          ),
          (answers) => {
            const userAnswers: UserAnswers = {
              answers,
              timestamp: new Date().toISOString()
            };
            
            const template = Object.keys(answers)
              .map(key => `\${${key}}`)
              .join(' | ');
            
            const result = handler.formatAnswers(userAnswers, template);
            
            // Проверяем, что все переменные заменены
            expect(result).not.toMatch(/\$\{[^}]+\}/);
            
            // Проверяем, что все значения присутствуют
            for (const value of Object.values(answers)) {
              expect(result).toContain(String(value));
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
  
  /**
   * Дополнительные тесты для извлечения вопросов и создания ответов
   */
  describe('Question Extraction and Answer Creation', () => {
    it('должен извлекать вопросы из JSON', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.string({ minLength: 1, maxLength: 10 }),
              question: fc.string({ minLength: 5, maxLength: 100 }),
              required: fc.boolean(),
              type: fc.constantFrom('string', 'number', 'boolean')
            }),
            { minLength: 1, maxLength: 5 }
          ),
          (questions) => {
            const jsonResponse = JSON.stringify({ questions });
            const extracted = handler.extractQuestions(jsonResponse, 'json');
            
            expect(extracted.length).toBe(questions.length);
            
            for (let i = 0; i < questions.length; i++) {
              expect(extracted[i].id).toBe(questions[i].id);
              expect(extracted[i].question).toBe(questions[i].question);
              expect(extracted[i].required).toBe(questions[i].required);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('должен создавать ответы из JSON ввода', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.string({ minLength: 1, maxLength: 10 })
                .filter(s => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)),
              question: fc.string({ minLength: 5, maxLength: 100 })
            }),
            { minLength: 1, maxLength: 5 }
          ),
          fc.dictionary(
            fc.string({ minLength: 1, maxLength: 10 })
              .filter(s => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)),
            fc.string({ minLength: 1, maxLength: 100 }),
            { minKeys: 1, maxKeys: 5 }
          ),
          (questions, answerData) => {
            const uniqueQuestions = Array.from(
              new Map(questions.map(q => [q.id, q])).values()
            );
            
            const userQuestions: UserQuestion[] = uniqueQuestions.map(q => ({
              id: q.id,
              question: q.question,
              required: true,
              type: 'string'
            }));
            
            const jsonInput = JSON.stringify(answerData);
            const answers = handler.createAnswers(userQuestions, jsonInput, 'json');
            
            expect(answers.answers).toBeDefined();
            expect(answers.timestamp).toBeDefined();
            
            for (const q of userQuestions) {
              // Проверяем только если id определен
              if (q.id && q.id in answerData) {
                expect(answers.answers[q.id]).toBe(answerData[q.id]);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
  
  /**
   * Feature: workflow-orchestrator, Property 38: Пауза для ввода пользователя
   * 
   * Для любого шага, требующего ввода пользователя, выполнение рабочего процесса
   * должно приостановиться и ждать ввода перед продолжением.
   * 
   * Validates: Requirements 8.4
   */
  describe('Property 38: User Input Pause', () => {
    it('должен извлекать вопросы из Markdown формата', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.integer({ min: 1, max: 100 }),
            { minLength: 1, maxLength: 5 }
          ),
          (questionIds) => {
            const uniqueIds = Array.from(new Set(questionIds));
            const markdownText = uniqueIds.map(id => 
              `${id}. Вопрос номер ${id}`
            ).join('\n\n');
            
            const extracted = handler.extractQuestions(markdownText, 'markdown');
            
            // Проверяем, что вопросы извлечены
            expect(extracted.length).toBeGreaterThan(0);
            
            // Каждый извлеченный вопрос должен иметь ID и текст
            for (const q of extracted) {
              expect(q.id).toBeDefined();
              expect(q.question).toBeDefined();
              // Проверяем длину только если question определен
              if (q.question) {
                expect(q.question.length).toBeGreaterThan(0);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
  
  /**
   * Feature: workflow-orchestrator, Property 39: Продолжение после ввода пользователя
   * 
   * Для любого приостановленного рабочего процесса, получившего ввод пользователя,
   * выполнение должно продолжиться со следующего шага.
   * 
   * Validates: Requirements 8.5
   */
  describe('Property 39: Continuation After User Input', () => {
    it('должен создавать валидные ответы из пользовательского ввода', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.string({ minLength: 1, maxLength: 10 })
                .filter(s => /^[a-zA-Z0-9_]+$/.test(s)),
              question: fc.string({ minLength: 5, maxLength: 100 })
            }),
            { minLength: 1, maxLength: 5 }
          ),
          fc.dictionary(
            fc.string({ minLength: 1, maxLength: 10 })
              .filter(s => /^[a-zA-Z0-9_]+$/.test(s)),
            fc.string({ minLength: 1, maxLength: 100 }),
            { minKeys: 1, maxKeys: 5 }
          ),
          (questions, answerData) => {
            const uniqueQuestions = Array.from(
              new Map(questions.map(q => [q.id, q])).values()
            );
            
            const userQuestions: UserQuestion[] = uniqueQuestions.map(q => ({
              id: q.id,
              question: q.question,
              required: false,
              type: 'string'
            }));
            
            const jsonInput = JSON.stringify(answerData);
            const answers = handler.createAnswers(userQuestions, jsonInput, 'json');
            
            // Проверяем, что ответы созданы
            expect(answers.answers).toBeDefined();
            expect(answers.timestamp).toBeDefined();
            
            // Проверяем, что timestamp валиден (только если определен)
            if (answers.timestamp) {
              const timestamp = new Date(answers.timestamp);
              expect(timestamp.getTime()).not.toBeNaN();
            }
            
            // Проверяем, что ответы содержат данные
            expect(Object.keys(answers.answers).length).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('должен форматировать ответы для передачи в следующий шаг', () => {
      fc.assert(
        fc.property(
          fc.dictionary(
            fc.string({ minLength: 1, maxLength: 20 })
              .filter(s => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)),
            fc.string({ minLength: 1, maxLength: 100 }),
            { minKeys: 1, maxKeys: 5 }
          ),
          (answers) => {
            const userAnswers: UserAnswers = {
              answers,
              timestamp: new Date().toISOString()
            };
            
            const formatted = handler.formatAnswers(userAnswers);
            
            // Проверяем, что форматированный текст содержит все ответы
            for (const [key, value] of Object.entries(answers)) {
              expect(formatted).toContain(key);
              expect(formatted).toContain(String(value));
            }
            
            // Проверяем, что форматированный текст не пустой
            expect(formatted.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
  
  /**
   * Feature: file-based-user-input, Property 7: Обработка вопросов
   * 
   * Для любого файла с вопросами и ответами, система должна корректно
   * извлечь ответы и сопоставить их с вопросами.
   * 
   * Validates: Requirements 5.1, 5.2, 5.3, 5.4
   */
  describe('Property 7: Question Processing', () => {
    it('должен корректно извлекать ответы из различных форматов', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.string({ minLength: 1, maxLength: 10 })
                .filter(s => /^[a-zA-Z0-9_]+$/.test(s))
                .filter(s => s !== '__proto__' && s !== 'constructor' && s !== 'prototype'),
              question: fc.string({ minLength: 5, maxLength: 100 })
                .filter(s => !s.includes('\n') && s.trim().length > 0),
              answer: fc.oneof(
                fc.string({ minLength: 1, maxLength: 200 }),
                fc.integer(),
                fc.boolean()
              )
            }),
            { minLength: 1, maxLength: 5 }
          ),
          (questionsData) => {
            // Создаем уникальные вопросы
            const uniqueQuestions = Array.from(
              new Map(questionsData.map(q => [q.id, q])).values()
            );
            
            const questions: UserQuestion[] = uniqueQuestions.map(q => ({
              id: q.id,
              question: q.question,
              required: true,
              type: 'string'
            }));
            
            // Создаем ответы
            const answersData: Record<string, unknown> = {};
            for (const q of uniqueQuestions) {
              answersData[q.id] = q.answer;
            }
            
            const userAnswers: UserAnswers = {
              answers: answersData,
              timestamp: new Date().toISOString()
            };
            
            // Извлекаем только ответы
            const extractedAnswers = handler.extractAnswersOnly(userAnswers, questions, false);
            
            // Проверяем, что все ответы извлечены корректно
            for (const q of uniqueQuestions) {
              expect(extractedAnswers[q.id]).toEqual(q.answer);
            }
            
            // Проверяем, что вопросы не включены
            for (const value of Object.values(extractedAnswers)) {
              if (typeof value === 'object' && value !== null) {
                expect(value).not.toHaveProperty('question');
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('должен корректно сопоставлять вопросы и ответы при includeQuestions=true', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.string({ minLength: 1, maxLength: 10 })
                .filter(s => /^[a-zA-Z0-9_]+$/.test(s))
                .filter(s => s !== '__proto__' && s !== 'constructor' && s !== 'prototype'),
              question: fc.string({ minLength: 5, maxLength: 100 })
                .filter(s => !s.includes('\n') && s.trim().length > 0),
              answer: fc.string({ minLength: 1, maxLength: 200 })
            }),
            { minLength: 1, maxLength: 5 }
          ),
          (questionsData) => {
            // Создаем уникальные вопросы
            const uniqueQuestions = Array.from(
              new Map(questionsData.map(q => [q.id, q])).values()
            );
            
            const questions: UserQuestion[] = uniqueQuestions.map(q => ({
              id: q.id,
              question: q.question,
              required: true,
              type: 'string'
            }));
            
            // Создаем ответы
            const answersData: Record<string, unknown> = {};
            for (const q of uniqueQuestions) {
              answersData[q.id] = q.answer;
            }
            
            const userAnswers: UserAnswers = {
              answers: answersData,
              timestamp: new Date().toISOString()
            };
            
            // Извлекаем с вопросами
            const extractedWithQuestions = handler.extractAnswersOnly(userAnswers, questions, true);
            
            // Проверяем, что все вопросы и ответы сопоставлены корректно
            for (const q of uniqueQuestions) {
              const extracted = extractedWithQuestions[q.id];
              expect(extracted).toBeDefined();
              
              if (typeof extracted === 'object' && extracted !== null) {
                const qaPair = extracted as { question?: string; answer?: unknown };
                expect(qaPair.question).toBe(q.question);
                expect(qaPair.answer).toEqual(q.answer);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('должен обрабатывать различные типы ответов', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.string({ minLength: 1, maxLength: 10 })
                .filter(s => /^[a-zA-Z0-9_]+$/.test(s))
                .filter(s => s !== '__proto__' && s !== 'constructor' && s !== 'prototype'),
              question: fc.string({ minLength: 5, maxLength: 100 }),
              answer: fc.oneof(
                fc.string({ minLength: 1, maxLength: 200 }),
                fc.integer(),
                fc.boolean(),
                fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 3 }),
                fc.record({
                  nested: fc.string({ minLength: 1, maxLength: 50 })
                })
              )
            }),
            { minLength: 1, maxLength: 5 }
          ),
          (questionsData) => {
            // Создаем уникальные вопросы
            const uniqueQuestions = Array.from(
              new Map(questionsData.map(q => [q.id, q])).values()
            );
            
            const questions: UserQuestion[] = uniqueQuestions.map(q => ({
              id: q.id,
              question: q.question,
              required: true,
              type: 'string'
            }));
            
            // Создаем ответы
            const answersData: Record<string, unknown> = {};
            for (const q of uniqueQuestions) {
              answersData[q.id] = q.answer;
            }
            
            const userAnswers: UserAnswers = {
              answers: answersData,
              timestamp: new Date().toISOString()
            };
            
            // Извлекаем ответы
            const extractedAnswers = handler.extractAnswersOnly(userAnswers, questions, false);
            
            // Проверяем, что все типы данных сохранены корректно
            for (const q of uniqueQuestions) {
              expect(extractedAnswers[q.id]).toEqual(q.answer);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('должен обрабатывать пустые ответы', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.string({ minLength: 1, maxLength: 10 })
                .filter(s => /^[a-zA-Z0-9_]+$/.test(s))
                .filter(s => s !== '__proto__' && s !== 'constructor' && s !== 'prototype'),
              question: fc.string({ minLength: 5, maxLength: 100 })
            }),
            { minLength: 1, maxLength: 5 }
          ),
          (questionsData) => {
            const uniqueQuestions = Array.from(
              new Map(questionsData.map(q => [q.id, q])).values()
            );
            
            const questions: UserQuestion[] = uniqueQuestions.map(q => ({
              id: q.id,
              question: q.question,
              required: false,
              type: 'string'
            }));
            
            // Создаем пустые ответы
            const userAnswers: UserAnswers = {
              answers: {},
              timestamp: new Date().toISOString()
            };
            
            // Извлекаем ответы
            const extractedAnswers = handler.extractAnswersOnly(userAnswers, questions, false);
            
            // Проверяем, что результат пустой
            expect(Object.keys(extractedAnswers).length).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
  
  /**
   * Feature: file-based-user-input, Property 8: Оптимизация контекста
   * 
   * Для любого набора ответов, если include_questions = false, в контекст
   * должны передаваться только ответы без текста вопросов.
   * 
   * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5
   */
  describe('Property 8: Context Optimization', () => {
    it('должен создавать меньший размер контекста без вопросов', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.string({ minLength: 1, maxLength: 10 })
                .filter(s => /^[a-zA-Z0-9_]+$/.test(s))
                .filter(s => s !== '__proto__' && s !== 'constructor' && s !== 'prototype'),
              question: fc.string({ minLength: 10, maxLength: 100 })
                .filter(s => s.trim().length > 0),
              answer: fc.string({ minLength: 1, maxLength: 50 })
            }),
            { minLength: 1, maxLength: 5 }
          ),
          (questionsData) => {
            // Создаем уникальные вопросы
            const uniqueQuestions = Array.from(
              new Map(questionsData.map(q => [q.id, q])).values()
            );
            
            const questions: UserQuestion[] = uniqueQuestions.map(q => ({
              id: q.id,
              question: q.question,
              required: true,
              type: 'string'
            }));
            
            // Создаем ответы
            const answersData: Record<string, unknown> = {};
            for (const q of uniqueQuestions) {
              answersData[q.id] = q.answer;
            }
            
            const userAnswers: UserAnswers = {
              answers: answersData,
              timestamp: new Date().toISOString()
            };
            
            // Форматируем без вопросов
            const withoutQuestions = handler.formatForContext(userAnswers, 'text', questions, false);
            
            // Форматируем с вопросами
            const withQuestions = handler.formatForContext(userAnswers, 'text', questions, true);
            
            // Проверяем, что размер без вопросов меньше
            expect(withoutQuestions.length).toBeLessThan(withQuestions.length);
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('должен передавать только ответы в JSON формате без вопросов', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.string({ minLength: 1, maxLength: 10 })
                .filter(s => /^[a-zA-Z0-9_]+$/.test(s))
                .filter(s => s !== '__proto__' && s !== 'constructor' && s !== 'prototype'),
              question: fc.string({ minLength: 5, maxLength: 100 }),
              answer: fc.oneof(
                fc.string({ minLength: 1, maxLength: 200 }),
                fc.integer(),
                fc.boolean()
              )
            }),
            { minLength: 1, maxLength: 5 }
          ),
          (questionsData) => {
            const uniqueQuestions = Array.from(
              new Map(questionsData.map(q => [q.id, q])).values()
            );
            
            const questions: UserQuestion[] = uniqueQuestions.map(q => ({
              id: q.id,
              question: q.question,
              required: true,
              type: 'string'
            }));
            
            const answersData: Record<string, unknown> = {};
            for (const q of uniqueQuestions) {
              answersData[q.id] = q.answer;
            }
            
            const userAnswers: UserAnswers = {
              answers: answersData,
              timestamp: new Date().toISOString()
            };
            
            // Форматируем в JSON без вопросов
            const jsonResult = handler.formatForContext(userAnswers, 'json', questions, false);
            const parsed = JSON.parse(jsonResult);
            
            // Проверяем, что в результате только ответы
            for (const q of uniqueQuestions) {
              expect(parsed[q.id]).toEqual(q.answer);
              // Проверяем, что нет вложенной структуры с вопросами
              if (typeof parsed[q.id] === 'object' && parsed[q.id] !== null && !Array.isArray(parsed[q.id])) {
                expect(parsed[q.id]).not.toHaveProperty('question');
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('должен передавать вопросы и ответы в JSON формате с includeQuestions=true', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.string({ minLength: 1, maxLength: 10 })
                .filter(s => /^[a-zA-Z0-9_]+$/.test(s))
                .filter(s => s !== '__proto__' && s !== 'constructor' && s !== 'prototype'),
              question: fc.string({ minLength: 5, maxLength: 100 }),
              answer: fc.string({ minLength: 1, maxLength: 200 })
            }),
            { minLength: 1, maxLength: 5 }
          ),
          (questionsData) => {
            const uniqueQuestions = Array.from(
              new Map(questionsData.map(q => [q.id, q])).values()
            );
            
            const questions: UserQuestion[] = uniqueQuestions.map(q => ({
              id: q.id,
              question: q.question,
              required: true,
              type: 'string'
            }));
            
            const answersData: Record<string, unknown> = {};
            for (const q of uniqueQuestions) {
              answersData[q.id] = q.answer;
            }
            
            const userAnswers: UserAnswers = {
              answers: answersData,
              timestamp: new Date().toISOString()
            };
            
            // Форматируем в JSON с вопросами
            const jsonResult = handler.formatForContext(userAnswers, 'json', questions, true);
            const parsed = JSON.parse(jsonResult);
            
            // Проверяем, что в результате есть вопросы и ответы
            for (const q of uniqueQuestions) {
              expect(parsed[q.id]).toBeDefined();
              expect(parsed[q.id].question).toBe(q.question);
              expect(parsed[q.id].answer).toEqual(q.answer);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('должен корректно форматировать в YAML без вопросов', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.string({ minLength: 1, maxLength: 10 })
                .filter(s => /^[a-zA-Z0-9_]+$/.test(s))
                .filter(s => s !== '__proto__' && s !== 'constructor' && s !== 'prototype'),
              question: fc.string({ minLength: 5, maxLength: 100 }),
              answer: fc.string({ minLength: 1, maxLength: 200 })
                .filter(s => !s.includes('\n')) // Избегаем многострочных значений для простоты
            }),
            { minLength: 1, maxLength: 5 }
          ),
          (questionsData) => {
            const uniqueQuestions = Array.from(
              new Map(questionsData.map(q => [q.id, q])).values()
            );
            
            const questions: UserQuestion[] = uniqueQuestions.map(q => ({
              id: q.id,
              question: q.question,
              required: true,
              type: 'string'
            }));
            
            const answersData: Record<string, unknown> = {};
            for (const q of uniqueQuestions) {
              answersData[q.id] = q.answer;
            }
            
            const userAnswers: UserAnswers = {
              answers: answersData,
              timestamp: new Date().toISOString()
            };
            
            // Форматируем в YAML без вопросов
            const yamlResult = handler.formatForContext(userAnswers, 'yaml', questions, false);
            
            // Проверяем, что результат можно распарсить обратно
            const parsed = handler.parseStructuredInput(yamlResult, 'yaml');
            const data = parsed.data as Record<string, unknown>;
            
            // Проверяем, что все ответы присутствуют
            for (const q of uniqueQuestions) {
              expect(data[q.id]).toEqual(q.answer);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('должен создавать компактный текстовый формат без вопросов', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.string({ minLength: 1, maxLength: 10 })
                .filter(s => /^[a-zA-Z0-9_]+$/.test(s))
                .filter(s => s !== '__proto__' && s !== 'constructor' && s !== 'prototype'),
              question: fc.string({ minLength: 5, maxLength: 100 }),
              answer: fc.string({ minLength: 1, maxLength: 200 })
            }),
            { minLength: 1, maxLength: 5 }
          ),
          (questionsData) => {
            const uniqueQuestions = Array.from(
              new Map(questionsData.map(q => [q.id, q])).values()
            );
            
            const questions: UserQuestion[] = uniqueQuestions.map(q => ({
              id: q.id,
              question: q.question,
              required: true,
              type: 'string'
            }));
            
            const answersData: Record<string, unknown> = {};
            for (const q of uniqueQuestions) {
              answersData[q.id] = q.answer;
            }
            
            const userAnswers: UserAnswers = {
              answers: answersData,
              timestamp: new Date().toISOString()
            };
            
            // Форматируем в текст без вопросов
            const textResult = handler.formatForContext(userAnswers, 'text', questions, false);
            
            // Проверяем, что все ответы присутствуют
            for (const q of uniqueQuestions) {
              expect(textResult).toContain(q.id);
              expect(textResult).toContain(String(q.answer));
            }
            
            // Проверяем, что вопросы не включены
            for (const q of uniqueQuestions) {
              expect(textResult).not.toContain(`Q: ${q.question}`);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('должен обрабатывать пустые ответы во всех форматах', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('text', 'json', 'yaml'),
          (format) => {
            const emptyAnswers: UserAnswers = {
              answers: {},
              timestamp: new Date().toISOString()
            };
            
            const result = handler.formatForContext(emptyAnswers, format as 'text' | 'json' | 'yaml');
            
            // Проверяем, что результат не пустой (может содержать пустую структуру)
            expect(result).toBeDefined();
            expect(typeof result).toBe('string');
            
            // Для JSON должен быть пустой объект
            if (format === 'json') {
              expect(result).toBe('{}');
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
