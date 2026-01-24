/**
 * Интеграционные тесты для множественного выбора в пользовательском вводе
 * 
 * Проверяет обработку списка ответов и валидацию множественного выбора
 * 
 * Requirements: 4.5
 */

import { UserInputHandler, UserQuestion } from '../../src/core/user-input-handler.js';
import { ValidationRule } from '../../src/core/types.js';

describe('User Input Multiple Choice', () => {
  let handler: UserInputHandler;
  
  beforeEach(() => {
    handler = new UserInputHandler();
  });
  
  describe('Обработка списка ответов', () => {
    it('должен обрабатывать массив строк как множественный выбор', () => {
      const questions: UserQuestion[] = [
        {
          id: 'languages',
          question: 'Выберите языки программирования',
          required: true,
          type: 'array'
        }
      ];
      
      const jsonInput = JSON.stringify({
        languages: ['JavaScript', 'TypeScript', 'Python']
      });
      
      const answers = handler.createAnswers(questions, jsonInput, 'json');
      
      expect(answers.answers['languages']).toBeDefined();
      expect(Array.isArray(answers.answers['languages'])).toBe(true);
      expect(answers.answers['languages']).toHaveLength(3);
      expect(answers.answers['languages']).toContain('JavaScript');
      expect(answers.answers['languages']).toContain('TypeScript');
      expect(answers.answers['languages']).toContain('Python');
    });
    
    it('должен обрабатывать массив чисел', () => {
      const questions: UserQuestion[] = [
        {
          id: 'ports',
          question: 'Выберите порты',
          required: true,
          type: 'array'
        }
      ];
      
      const jsonInput = JSON.stringify({
        ports: [3000, 8080, 9000]
      });
      
      const answers = handler.createAnswers(questions, jsonInput, 'json');
      
      expect(Array.isArray(answers.answers['ports'])).toBe(true);
      expect(answers.answers['ports']).toHaveLength(3);
      expect(answers.answers['ports']).toContain(3000);
      expect(answers.answers['ports']).toContain(8080);
      expect(answers.answers['ports']).toContain(9000);
    });
    
    it('должен обрабатывать пустой массив', () => {
      const questions: UserQuestion[] = [
        {
          id: 'options',
          question: 'Выберите опции',
          required: false,
          type: 'array'
        }
      ];
      
      const jsonInput = JSON.stringify({
        options: []
      });
      
      const answers = handler.createAnswers(questions, jsonInput, 'json');
      
      expect(Array.isArray(answers.answers['options'])).toBe(true);
      expect(answers.answers['options']).toHaveLength(0);
    });
    
    it('должен обрабатывать массив с одним элементом', () => {
      const questions: UserQuestion[] = [
        {
          id: 'choice',
          question: 'Выберите вариант',
          required: true,
          type: 'array'
        }
      ];
      
      const jsonInput = JSON.stringify({
        choice: ['Option A']
      });
      
      const answers = handler.createAnswers(questions, jsonInput, 'json');
      
      expect(Array.isArray(answers.answers['choice'])).toBe(true);
      expect(answers.answers['choice']).toHaveLength(1);
      expect((answers.answers['choice'] as string[])[0]).toBe('Option A');
    });
    
    it('должен обрабатывать массив смешанных типов', () => {
      const questions: UserQuestion[] = [
        {
          id: 'mixed',
          question: 'Смешанные данные',
          required: true,
          type: 'array'
        }
      ];
      
      const jsonInput = JSON.stringify({
        mixed: ['text', 123, true, null]
      });
      
      const answers = handler.createAnswers(questions, jsonInput, 'json');
      
      expect(Array.isArray(answers.answers['mixed'])).toBe(true);
      expect(answers.answers['mixed']).toHaveLength(4);
      expect(answers.answers['mixed']).toContain('text');
      expect(answers.answers['mixed']).toContain(123);
      expect(answers.answers['mixed']).toContain(true);
      expect(answers.answers['mixed']).toContain(null);
    });
  });
  
  describe('Валидация множественного выбора', () => {
    it('должен валидировать массив как тип array', () => {
      const data = {
        tags: ['tag1', 'tag2', 'tag3']
      };
      
      const rules: ValidationRule[] = [
        { field: 'tags', required: true, type: 'array' }
      ];
      
      const result = handler.validateInput(data, rules);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
    
    it('должен отклонять не-массив для типа array', () => {
      const data = {
        tags: 'not an array'
      };
      
      const rules: ValidationRule[] = [
        { field: 'tags', required: true, type: 'array' }
      ];
      
      const result = handler.validateInput(data, rules);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('INVALID_TYPE');
      expect(result.errors[0].field).toBe('tags');
    });
    
    it('должен принимать пустой массив для необязательного поля', () => {
      const data = {
        tags: []
      };
      
      const rules: ValidationRule[] = [
        { field: 'tags', required: false, type: 'array' }
      ];
      
      const result = handler.validateInput(data, rules);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
    
    it('должен отклонять отсутствующий массив для обязательного поля', () => {
      const data = {};
      
      const rules: ValidationRule[] = [
        { field: 'tags', required: true, type: 'array' }
      ];
      
      const result = handler.validateInput(data, rules);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('REQUIRED_FIELD');
    });
    
    it('должен валидировать несколько массивов одновременно', () => {
      const data = {
        languages: ['JavaScript', 'Python'],
        frameworks: ['React', 'Express'],
        tools: ['Git', 'Docker']
      };
      
      const rules: ValidationRule[] = [
        { field: 'languages', required: true, type: 'array' },
        { field: 'frameworks', required: true, type: 'array' },
        { field: 'tools', required: true, type: 'array' }
      ];
      
      const result = handler.validateInput(data, rules);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
  
  describe('Форматирование множественного выбора', () => {
    it('должен форматировать массив в читаемый вид', () => {
      const userAnswers = {
        answers: {
          languages: ['JavaScript', 'TypeScript', 'Python']
        },
        timestamp: '2024-01-01T12:00:00.000Z'
      };
      
      const formatted = handler.formatAnswers(userAnswers);
      
      expect(formatted).toContain('languages');
      expect(formatted).toContain('JavaScript');
      expect(formatted).toContain('TypeScript');
      expect(formatted).toContain('Python');
    });
    
    it('должен форматировать массив с использованием шаблона', () => {
      const userAnswers = {
        answers: {
          items: ['item1', 'item2', 'item3']
        },
        timestamp: '2024-01-01T12:00:00.000Z'
      };
      
      const template = 'Выбранные элементы: \${items}';
      const formatted = handler.formatAnswers(userAnswers, template);
      
      expect(formatted).toContain('Выбранные элементы:');
      expect(formatted).toContain('item1');
      expect(formatted).toContain('item2');
      expect(formatted).toContain('item3');
    });
    
    it('должен форматировать пустой массив', () => {
      const userAnswers = {
        answers: {
          options: []
        },
        timestamp: '2024-01-01T12:00:00.000Z'
      };
      
      const formatted = handler.formatAnswers(userAnswers);
      
      expect(formatted).toContain('options');
      // Пустой массив должен быть представлен как пустая строка или []
      expect(formatted).toBeTruthy();
    });
    
    it('должен форматировать массив с одним элементом', () => {
      const userAnswers = {
        answers: {
          choice: ['Single Option']
        },
        timestamp: '2024-01-01T12:00:00.000Z'
      };
      
      const formatted = handler.formatAnswers(userAnswers);
      
      expect(formatted).toContain('choice');
      expect(formatted).toContain('Single Option');
    });
  });
  
  describe('Множественный выбор из YAML', () => {
    it('должен парсить массив из YAML', () => {
      const yamlInput = `languages:
  - JavaScript
  - TypeScript
  - Python`;
      
      const parsed = handler.parseStructuredInput(yamlInput, 'yaml');
      const data = parsed.data as { languages: string[] };
      
      expect(Array.isArray(data.languages)).toBe(true);
      expect(data.languages).toHaveLength(3);
      expect(data.languages).toContain('JavaScript');
      expect(data.languages).toContain('TypeScript');
      expect(data.languages).toContain('Python');
    });
    
    it('должен создавать ответы из YAML с массивами', () => {
      const questions: UserQuestion[] = [
        {
          id: 'frameworks',
          question: 'Выберите фреймворки',
          required: true,
          type: 'array'
        }
      ];
      
      const yamlInput = `frameworks:
  - React
  - Vue
  - Angular`;
      
      const answers = handler.createAnswers(questions, yamlInput, 'yaml');
      
      expect(Array.isArray(answers.answers['frameworks'])).toBe(true);
      expect(answers.answers['frameworks']).toHaveLength(3);
      expect(answers.answers['frameworks']).toContain('React');
      expect(answers.answers['frameworks']).toContain('Vue');
      expect(answers.answers['frameworks']).toContain('Angular');
    });
  });
  
  describe('Сложные сценарии множественного выбора', () => {
    it('должен обрабатывать вложенные массивы', () => {
      const questions: UserQuestion[] = [
        {
          id: 'matrix',
          question: 'Матрица данных',
          required: true,
          type: 'array'
        }
      ];
      
      const jsonInput = JSON.stringify({
        matrix: [
          [1, 2, 3],
          [4, 5, 6],
          [7, 8, 9]
        ]
      });
      
      const answers = handler.createAnswers(questions, jsonInput, 'json');
      
      expect(Array.isArray(answers.answers['matrix'])).toBe(true);
      expect(answers.answers['matrix']).toHaveLength(3);
      expect(Array.isArray((answers.answers['matrix'] as unknown[])[0])).toBe(true);
    });
    
    it('должен обрабатывать массив объектов', () => {
      const questions: UserQuestion[] = [
        {
          id: 'users',
          question: 'Список пользователей',
          required: true,
          type: 'array'
        }
      ];
      
      const jsonInput = JSON.stringify({
        users: [
          { name: 'John', age: 30 },
          { name: 'Jane', age: 25 }
        ]
      });
      
      const answers = handler.createAnswers(questions, jsonInput, 'json');
      
      expect(Array.isArray(answers.answers['users'])).toBe(true);
      expect(answers.answers['users']).toHaveLength(2);
      expect((answers.answers['users'] as Array<{ name: string; age: number }>)[0]).toHaveProperty('name', 'John');
      expect((answers.answers['users'] as Array<{ name: string; age: number }>)[1]).toHaveProperty('name', 'Jane');
    });
    
    it('должен обрабатывать множественные массивы в одном ответе', () => {
      const questions: UserQuestion[] = [
        {
          id: 'languages',
          question: 'Языки',
          required: true,
          type: 'array'
        },
        {
          id: 'frameworks',
          question: 'Фреймворки',
          required: true,
          type: 'array'
        },
        {
          id: 'tools',
          question: 'Инструменты',
          required: true,
          type: 'array'
        }
      ];
      
      const jsonInput = JSON.stringify({
        languages: ['JavaScript', 'Python'],
        frameworks: ['React', 'Django'],
        tools: ['Git', 'Docker']
      });
      
      const answers = handler.createAnswers(questions, jsonInput, 'json');
      
      expect(Array.isArray(answers.answers['languages'])).toBe(true);
      expect(Array.isArray(answers.answers['frameworks'])).toBe(true);
      expect(Array.isArray(answers.answers['tools'])).toBe(true);
      expect(answers.answers['languages']).toHaveLength(2);
      expect(answers.answers['frameworks']).toHaveLength(2);
      expect(answers.answers['tools']).toHaveLength(2);
    });
  });
  
  describe('Граничные случаи множественного выбора', () => {
    it('должен обрабатывать очень большой массив', () => {
      const largeArray = Array.from({ length: 1000 }, (_, i) => `item${i}`);
      
      const questions: UserQuestion[] = [
        {
          id: 'items',
          question: 'Большой список',
          required: true,
          type: 'array'
        }
      ];
      
      const jsonInput = JSON.stringify({
        items: largeArray
      });
      
      const answers = handler.createAnswers(questions, jsonInput, 'json');
      
      expect(Array.isArray(answers.answers['items'])).toBe(true);
      expect(answers.answers['items']).toHaveLength(1000);
    });
    
    it('должен обрабатывать массив с дублирующимися элементами', () => {
      const questions: UserQuestion[] = [
        {
          id: 'tags',
          question: 'Теги',
          required: true,
          type: 'array'
        }
      ];
      
      const jsonInput = JSON.stringify({
        tags: ['tag1', 'tag2', 'tag1', 'tag3', 'tag2']
      });
      
      const answers = handler.createAnswers(questions, jsonInput, 'json');
      
      expect(Array.isArray(answers.answers['tags'])).toBe(true);
      expect(answers.answers['tags']).toHaveLength(5);
      // Дубликаты должны сохраняться
      expect((answers.answers['tags'] as string[]).filter((t: string) => t === 'tag1')).toHaveLength(2);
      expect((answers.answers['tags'] as string[]).filter((t: string) => t === 'tag2')).toHaveLength(2);
    });
    
    it('должен обрабатывать массив с null и undefined', () => {
      const questions: UserQuestion[] = [
        {
          id: 'values',
          question: 'Значения',
          required: true,
          type: 'array'
        }
      ];
      
      const jsonInput = JSON.stringify({
        values: ['value1', null, 'value2', null]
      });
      
      const answers = handler.createAnswers(questions, jsonInput, 'json');
      
      expect(Array.isArray(answers.answers['values'])).toBe(true);
      expect(answers.answers['values']).toHaveLength(4);
      expect(answers.answers['values']).toContain(null);
    });
  });
});
