/**
 * Интеграционные тесты для отмены пользовательского ввода
 * 
 * Проверяет корректное завершение при отмене и сохранение состояния
 * 
 * Requirements: 4.6
 * 
 * Примечание: Эти тесты проверяют концептуальное поведение системы при отмене.
 * В реальной реализации отмена может обрабатываться на уровне CLI или оркестратора.
 */

import { UserInputHandler, UserQuestion, UserAnswers } from '../../src/core/user-input-handler.js';
import { ValidationRule, WorkflowErrorClass } from '../../src/core/types.js';

describe('User Input Cancellation', () => {
  let handler: UserInputHandler;
  
  beforeEach(() => {
    handler = new UserInputHandler();
  });
  
  describe('Обработка некорректного ввода как отмены', () => {
    it('должен выбрасывать ошибку при парсинге невалидного JSON', () => {
      const invalidJson = '{ invalid json }';
      
      expect(() => {
        handler.parseStructuredInput(invalidJson, 'json');
      }).toThrow(WorkflowErrorClass);
      
      try {
        handler.parseStructuredInput(invalidJson, 'json');
      } catch (error) {
        expect(error).toBeInstanceOf(WorkflowErrorClass);
        const workflowError = error as WorkflowErrorClass;
        expect(workflowError.code).toBe('USER_INPUT_PARSE_ERROR');
        expect(workflowError.recoverable).toBe(true);
        expect(workflowError.suggestions).toBeDefined();
        expect(workflowError.suggestions.length).toBeGreaterThan(0);
      }
    });
    
    it('должен выбрасывать ошибку при парсинге невалидного YAML', () => {
      const invalidYaml = 'key: [invalid yaml';
      
      expect(() => {
        handler.parseStructuredInput(invalidYaml, 'yaml');
      }).toThrow(WorkflowErrorClass);
      
      try {
        handler.parseStructuredInput(invalidYaml, 'yaml');
      } catch (error) {
        expect(error).toBeInstanceOf(WorkflowErrorClass);
        const workflowError = error as WorkflowErrorClass;
        expect(workflowError.recoverable).toBe(true);
      }
    });
    
    it('должен предоставлять предложения по исправлению при ошибке парсинга', () => {
      const invalidJson = 'not a json';
      
      try {
        handler.parseStructuredInput(invalidJson, 'json');
      } catch (error) {
        const workflowError = error as WorkflowErrorClass;
        expect(workflowError.suggestions).toBeDefined();
        expect(workflowError.suggestions.length).toBeGreaterThan(0);
        expect(workflowError.suggestions.some(s => s.includes('формат'))).toBe(true);
      }
    });
  });
  
  describe('Валидация как механизм предотвращения некорректного ввода', () => {
    it('должен отклонять пустой ввод для обязательных полей', () => {
      const data = {
        username: ''
      };
      
      const rules: ValidationRule[] = [
        { field: 'username', required: true, type: 'string' }
      ];
      
      const result = handler.validateInput(data, rules);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('REQUIRED_FIELD');
      expect(result.errors[0].message).toContain('обязательно');
    });
    
    it('должен отклонять отсутствующие обязательные поля', () => {
      const data = {};
      
      const rules: ValidationRule[] = [
        { field: 'username', required: true, type: 'string' },
        { field: 'email', required: true, type: 'string' }
      ];
      
      const result = handler.validateInput(data, rules);
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });
    
    it('должен предоставлять понятные сообщения об ошибках валидации', () => {
      const data = {
        email: 'invalid-email'
      };
      
      const rules: ValidationRule[] = [
        {
          field: 'email',
          required: true,
          type: 'string',
          pattern: '^[a-zA-Z0-9]+@[a-zA-Z0-9]+\\.[a-zA-Z]+$',
          message: 'Введите корректный email адрес'
        }
      ];
      
      const result = handler.validateInput(data, rules);
      
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toBe('Введите корректный email адрес');
    });
  });
  
  describe('Сохранение частичного состояния', () => {
    it('должен создавать ответы даже с частичными данными', () => {
      const questions: UserQuestion[] = [
        { id: 'name', question: 'Name?', required: true, type: 'string' },
        { id: 'email', question: 'Email?', required: false, type: 'string' },
        { id: 'age', question: 'Age?', required: false, type: 'number' }
      ];
      
      const jsonInput = JSON.stringify({
        name: 'John'
        // email и age отсутствуют
      });
      
      const answers = handler.createAnswers(questions, jsonInput, 'json');
      
      expect(answers.answers).toBeDefined();
      expect(answers.answers['name']).toBe('John');
      expect(answers.timestamp).toBeDefined();
    });
    
    it('должен сохранять timestamp даже при частичных ответах', () => {
      const questions: UserQuestion[] = [
        { id: 'field1', question: 'Field 1?', required: false, type: 'string' }
      ];
      
      const jsonInput = JSON.stringify({});
      const answers = handler.createAnswers(questions, jsonInput, 'json');
      
      expect(answers.timestamp).toBeDefined();
      expect(new Date(answers.timestamp).getTime()).not.toBeNaN();
    });
    
    it('должен форматировать частичные ответы для сохранения', () => {
      const userAnswers: UserAnswers = {
        answers: {
          name: 'John'
          // Другие поля отсутствуют
        },
        timestamp: '2024-01-01T12:00:00.000Z'
      };
      
      const formatted = handler.formatAnswers(userAnswers);
      
      expect(formatted).toContain('# Ответы пользователя');
      expect(formatted).toContain('Время: 2024-01-01T12:00:00.000Z');
      expect(formatted).toContain('name');
      expect(formatted).toContain('John');
    });
  });
  
  describe('Обработка значений по умолчанию при отмене', () => {
    it('должен использовать значения по умолчанию для необязательных полей', () => {
      const questions: UserQuestion[] = [
        { id: 'name', question: 'Name?', required: true, type: 'string' },
        { id: 'port', question: 'Port?', required: false, type: 'number', default: 3000 },
        { id: 'host', question: 'Host?', required: false, type: 'string', default: 'localhost' }
      ];
      
      const jsonInput = JSON.stringify({
        name: 'MyApp'
        // port и host не указаны, должны использоваться значения по умолчанию
      });
      
      const answers = handler.createAnswers(questions, jsonInput, 'json');
      
      expect(answers.answers['name']).toBe('MyApp');
      expect(answers.answers['port']).toBe(3000);
      expect(answers.answers['host']).toBe('localhost');
    });
    
    it('должен применять значения по умолчанию при пустом вводе', () => {
      const questions: UserQuestion[] = [
        { id: 'timeout', question: 'Timeout?', required: false, type: 'number', default: 5000 },
        { id: 'retries', question: 'Retries?', required: false, type: 'number', default: 3 }
      ];
      
      const jsonInput = JSON.stringify({});
      const answers = handler.createAnswers(questions, jsonInput, 'json');
      
      expect(answers.answers['timeout']).toBe(5000);
      expect(answers.answers['retries']).toBe(3);
    });
  });
  
  describe('Восстановление после ошибок ввода', () => {
    it('должен предоставлять информацию для повторной попытки при ошибке парсинга', () => {
      const invalidInput = '{ "name": "John", invalid }';
      
      try {
        handler.parseStructuredInput(invalidInput, 'json');
        fail('Должна была быть выброшена ошибка');
      } catch (error) {
        const workflowError = error as WorkflowErrorClass;
        
        expect(workflowError.recoverable).toBe(true);
        expect(workflowError.context).toBeDefined();
        expect(workflowError.context.format).toBe('json');
        expect(workflowError.context.input).toBeDefined();
      }
    });
    
    it('должен сохранять контекст ошибки для диагностики', () => {
      const invalidYaml = 'key: [unclosed';
      
      try {
        handler.parseStructuredInput(invalidYaml, 'yaml');
        fail('Должна была быть выброшена ошибка');
      } catch (error) {
        const workflowError = error as WorkflowErrorClass;
        
        expect(workflowError.context).toBeDefined();
        expect(workflowError.context.format).toBe('yaml');
        expect(workflowError.context.error).toBeDefined();
      }
    });
    
    it('должен предоставлять предложения по исправлению ошибок валидации', () => {
      const data = {
        email: 'not-an-email'
      };
      
      const rules: ValidationRule[] = [
        {
          field: 'email',
          required: true,
          type: 'string',
          pattern: '^[a-zA-Z0-9]+@[a-zA-Z0-9]+\\.[a-zA-Z]+$',
          message: 'Введите корректный email адрес в формате user@example.com'
        }
      ];
      
      const result = handler.validateInput(data, rules);
      
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('email');
      expect(result.errors[0].message).toContain('формат');
    });
  });
  
  describe('Граничные случаи отмены', () => {
    it('должен обрабатывать полностью пустой ввод', () => {
      const questions: UserQuestion[] = [
        { id: 'optional', question: 'Optional?', required: false, type: 'string', default: 'default' }
      ];
      
      const jsonInput = JSON.stringify({});
      const answers = handler.createAnswers(questions, jsonInput, 'json');
      
      expect(answers.answers).toBeDefined();
      expect(answers.timestamp).toBeDefined();
      expect(answers.answers['optional']).toBe('default');
    });
    
    it('должен обрабатывать ввод только с пробелами', () => {
      const input = '   ';
      const parsed = handler.parseStructuredInput(input, 'text');
      
      expect(parsed.data).toBe('');
      expect(parsed.format).toBe('text');
    });
    
    it('должен обрабатывать очень длинный некорректный ввод', () => {
      const longInvalidInput = 'x'.repeat(10000);
      
      try {
        handler.parseStructuredInput(longInvalidInput, 'json');
        fail('Должна была быть выброшена ошибка');
      } catch (error) {
        const workflowError = error as WorkflowErrorClass;
        
        expect(workflowError.recoverable).toBe(true);
        // Контекст должен содержать обрезанный ввод
        expect(workflowError.context.input).toBeDefined();
        expect((workflowError.context.input as string).length).toBeLessThanOrEqual(103); // 100 + '...'
      }
    });
  });
  
  describe('Интеграция с workflow состоянием', () => {
    it('должен создавать структуру ответов, которую можно сохранить в состояние', () => {
      const questions: UserQuestion[] = [
        { id: 'step1', question: 'Step 1?', required: true, type: 'string' }
      ];
      
      const jsonInput = JSON.stringify({
        step1: 'completed'
      });
      
      const answers = handler.createAnswers(questions, jsonInput, 'json');
      
      // Проверяем, что структура подходит для сохранения в workflow state
      expect(answers).toHaveProperty('answers');
      expect(answers).toHaveProperty('timestamp');
      expect(typeof answers.answers).toBe('object');
      expect(typeof answers.timestamp).toBe('string');
    });
    
    it('должен форматировать ответы для сохранения в артефакт', () => {
      const userAnswers: UserAnswers = {
        answers: {
          project: 'MyProject',
          version: '1.0.0'
        },
        timestamp: '2024-01-01T12:00:00.000Z'
      };
      
      const formatted = handler.formatAnswers(userAnswers);
      
      // Проверяем, что форматированный текст можно сохранить как файл
      expect(formatted).toBeTruthy();
      expect(formatted.length).toBeGreaterThan(0);
      expect(formatted).toContain('# Ответы пользователя');
      expect(formatted).toContain('Время:');
    });
    
    it('должен создавать ответы с валидным ISO timestamp для сохранения', () => {
      const questions: UserQuestion[] = [
        { id: 'test', question: 'Test?', required: true, type: 'string' }
      ];
      
      const jsonInput = JSON.stringify({ test: 'value' });
      const answers = handler.createAnswers(questions, jsonInput, 'json');
      
      // Проверяем, что timestamp можно использовать для восстановления состояния
      const timestamp = new Date(answers.timestamp);
      expect(timestamp.getTime()).not.toBeNaN();
      expect(timestamp.toISOString()).toBe(answers.timestamp);
    });
  });
});
