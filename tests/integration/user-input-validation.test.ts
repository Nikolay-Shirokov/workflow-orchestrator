/**
 * Интеграционные тесты для валидации пользовательского ввода
 * 
 * Проверяет валидацию текстового, числового, булевого ввода и выбора из списка
 * 
 * Requirements: 4.2, 4.3
 */

import { UserInputHandler } from '../../src/core/user-input-handler.js';
import { ValidationRule } from '../../src/core/types.js';

describe('User Input Validation', () => {
  let handler: UserInputHandler;
  
  beforeEach(() => {
    handler = new UserInputHandler();
  });
  
  describe('Валидация текстового ввода', () => {
    it('должен принимать валидный текстовый ввод', () => {
      const data = {
        username: 'john_doe',
        email: 'john@example.com'
      };
      
      const rules: ValidationRule[] = [
        { field: 'username', required: true, type: 'string' },
        { field: 'email', required: true, type: 'string' }
      ];
      
      const result = handler.validateInput(data, rules);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
    
    it('должен отклонять пустой текстовый ввод для обязательных полей', () => {
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
      expect(result.errors[0].field).toBe('username');
    });
    
    it('должен валидировать текст по паттерну', () => {
      const data = {
        email: 'invalid-email'
      };
      
      const rules: ValidationRule[] = [
        {
          field: 'email',
          required: true,
          type: 'string',
          pattern: '^[a-zA-Z0-9]+@[a-zA-Z0-9]+\\.[a-zA-Z]+$',
          message: 'Неверный формат email'
        }
      ];
      
      const result = handler.validateInput(data, rules);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('PATTERN_MISMATCH');
      expect(result.errors[0].message).toContain('формат');
    });
    
    it('должен принимать текст, соответствующий паттерну', () => {
      const data = {
        email: 'user@example.com'
      };
      
      const rules: ValidationRule[] = [
        {
          field: 'email',
          required: true,
          type: 'string',
          pattern: '^[a-zA-Z0-9]+@[a-zA-Z0-9]+\\.[a-zA-Z]+$'
        }
      ];
      
      const result = handler.validateInput(data, rules);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
    
    it('должен валидировать длинные текстовые строки', () => {
      const data = {
        description: 'Это очень длинное описание проекта, которое содержит много информации о том, что делает проект и какие технологии используются.'
      };
      
      const rules: ValidationRule[] = [
        { field: 'description', required: true, type: 'string' }
      ];
      
      const result = handler.validateInput(data, rules);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
    
    it('должен обрабатывать текст с специальными символами', () => {
      const data = {
        password: 'P@ssw0rd!123'
      };
      
      const rules: ValidationRule[] = [
        { field: 'password', required: true, type: 'string' }
      ];
      
      const result = handler.validateInput(data, rules);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
  
  describe('Валидация числового ввода', () => {
    it('должен принимать валидный числовой ввод', () => {
      const data = {
        age: 25,
        port: 3000
      };
      
      const rules: ValidationRule[] = [
        { field: 'age', required: true, type: 'number' },
        { field: 'port', required: true, type: 'number' }
      ];
      
      const result = handler.validateInput(data, rules);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
    
    it('должен отклонять строку вместо числа', () => {
      const data = {
        age: '25'
      };
      
      const rules: ValidationRule[] = [
        { field: 'age', required: true, type: 'number' }
      ];
      
      const result = handler.validateInput(data, rules);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('INVALID_TYPE');
      expect(result.errors[0].field).toBe('age');
    });
    
    it('должен принимать отрицательные числа', () => {
      const data = {
        temperature: -10
      };
      
      const rules: ValidationRule[] = [
        { field: 'temperature', required: true, type: 'number' }
      ];
      
      const result = handler.validateInput(data, rules);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
    
    it('должен принимать дробные числа', () => {
      const data = {
        price: 19.99
      };
      
      const rules: ValidationRule[] = [
        { field: 'price', required: true, type: 'number' }
      ];
      
      const result = handler.validateInput(data, rules);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
    
    it('должен принимать ноль', () => {
      const data = {
        count: 0
      };
      
      const rules: ValidationRule[] = [
        { field: 'count', required: true, type: 'number' }
      ];
      
      const result = handler.validateInput(data, rules);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
  
  describe('Валидация булевых значений', () => {
    it('должен принимать true', () => {
      const data = {
        active: true
      };
      
      const rules: ValidationRule[] = [
        { field: 'active', required: true, type: 'boolean' }
      ];
      
      const result = handler.validateInput(data, rules);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
    
    it('должен принимать false', () => {
      const data = {
        active: false
      };
      
      const rules: ValidationRule[] = [
        { field: 'active', required: true, type: 'boolean' }
      ];
      
      const result = handler.validateInput(data, rules);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
    
    it('должен отклонять строку вместо булева значения', () => {
      const data = {
        active: 'true'
      };
      
      const rules: ValidationRule[] = [
        { field: 'active', required: true, type: 'boolean' }
      ];
      
      const result = handler.validateInput(data, rules);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('INVALID_TYPE');
    });
    
    it('должен отклонять число вместо булева значения', () => {
      const data = {
        active: 1
      };
      
      const rules: ValidationRule[] = [
        { field: 'active', required: true, type: 'boolean' }
      ];
      
      const result = handler.validateInput(data, rules);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('INVALID_TYPE');
    });
  });
  
  describe('Валидация выбора из списка (массивов)', () => {
    it('должен принимать массив строк', () => {
      const data = {
        tags: ['javascript', 'typescript', 'nodejs']
      };
      
      const rules: ValidationRule[] = [
        { field: 'tags', required: true, type: 'array' }
      ];
      
      const result = handler.validateInput(data, rules);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
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
    
    it('должен отклонять строку вместо массива', () => {
      const data = {
        tags: 'javascript'
      };
      
      const rules: ValidationRule[] = [
        { field: 'tags', required: true, type: 'array' }
      ];
      
      const result = handler.validateInput(data, rules);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('INVALID_TYPE');
    });
    
    it('должен принимать массив чисел', () => {
      const data = {
        scores: [85, 90, 95]
      };
      
      const rules: ValidationRule[] = [
        { field: 'scores', required: true, type: 'array' }
      ];
      
      const result = handler.validateInput(data, rules);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
    
    it('должен принимать массив смешанных типов', () => {
      const data = {
        mixed: ['text', 123, true]
      };
      
      const rules: ValidationRule[] = [
        { field: 'mixed', required: true, type: 'array' }
      ];
      
      const result = handler.validateInput(data, rules);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
  
  describe('Комплексная валидация', () => {
    it('должен валидировать несколько полей одновременно', () => {
      const data = {
        username: 'john_doe',
        age: 25,
        active: true,
        tags: ['developer', 'nodejs']
      };
      
      const rules: ValidationRule[] = [
        { field: 'username', required: true, type: 'string' },
        { field: 'age', required: true, type: 'number' },
        { field: 'active', required: true, type: 'boolean' },
        { field: 'tags', required: true, type: 'array' }
      ];
      
      const result = handler.validateInput(data, rules);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
    
    it('должен собирать все ошибки валидации', () => {
      const data = {
        username: '',
        age: 'not a number',
        active: 'not a boolean'
      };
      
      const rules: ValidationRule[] = [
        { field: 'username', required: true, type: 'string' },
        { field: 'age', required: true, type: 'number' },
        { field: 'active', required: true, type: 'boolean' }
      ];
      
      const result = handler.validateInput(data, rules);
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2); // username пустой, age и active неверного типа
    });
    
    it('должен пропускать валидацию для необязательных отсутствующих полей', () => {
      const data = {
        username: 'john_doe'
      };
      
      const rules: ValidationRule[] = [
        { field: 'username', required: true, type: 'string' },
        { field: 'email', required: false, type: 'string' },
        { field: 'age', required: false, type: 'number' }
      ];
      
      const result = handler.validateInput(data, rules);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
    
    it('должен валидировать необязательные поля, если они присутствуют', () => {
      const data = {
        username: 'john_doe',
        email: 'invalid-email'
      };
      
      const rules: ValidationRule[] = [
        { field: 'username', required: true, type: 'string' },
        {
          field: 'email',
          required: false,
          type: 'string',
          pattern: '^[a-zA-Z0-9]+@[a-zA-Z0-9]+\\.[a-zA-Z]+$'
        }
      ];
      
      const result = handler.validateInput(data, rules);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('PATTERN_MISMATCH');
    });
  });
  
  describe('Сообщения об ошибках валидации', () => {
    it('должен возвращать понятное сообщение для обязательного поля', () => {
      const data = {};
      
      const rules: ValidationRule[] = [
        { field: 'username', required: true }
      ];
      
      const result = handler.validateInput(data, rules);
      
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('обязательно');
      expect(result.errors[0].message).toContain('username');
    });
    
    it('должен возвращать кастомное сообщение об ошибке', () => {
      const data = {
        email: 'invalid'
      };
      
      const rules: ValidationRule[] = [
        {
          field: 'email',
          required: true,
          type: 'string',
          pattern: '^[a-zA-Z0-9]+@[a-zA-Z0-9]+\\.[a-zA-Z]+$',
          message: 'Пожалуйста, введите корректный email адрес'
        }
      ];
      
      const result = handler.validateInput(data, rules);
      
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toBe('Пожалуйста, введите корректный email адрес');
    });
    
    it('должен возвращать сообщение о неверном типе', () => {
      const data = {
        age: 'twenty five'
      };
      
      const rules: ValidationRule[] = [
        { field: 'age', required: true, type: 'number' }
      ];
      
      const result = handler.validateInput(data, rules);
      
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('number');
      expect(result.errors[0].message).toContain('string');
    });
  });
  
  describe('Граничные случаи', () => {
    it('должен обрабатывать null значения', () => {
      const data = {
        value: null
      };
      
      const rules: ValidationRule[] = [
        { field: 'value', required: true, type: 'string' }
      ];
      
      const result = handler.validateInput(data, rules);
      
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('REQUIRED_FIELD');
    });
    
    it('должен обрабатывать undefined значения', () => {
      const data = {
        value: undefined
      };
      
      const rules: ValidationRule[] = [
        { field: 'value', required: true, type: 'string' }
      ];
      
      const result = handler.validateInput(data, rules);
      
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('REQUIRED_FIELD');
    });
    
    it('должен обрабатывать пустые строки как отсутствующие значения', () => {
      const data = {
        value: ''
      };
      
      const rules: ValidationRule[] = [
        { field: 'value', required: true, type: 'string' }
      ];
      
      const result = handler.validateInput(data, rules);
      
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('REQUIRED_FIELD');
    });
    
    it('должен принимать пробелы в строке как валидное значение', () => {
      const data = {
        value: '   text   '
      };
      
      const rules: ValidationRule[] = [
        { field: 'value', required: true, type: 'string' }
      ];
      
      const result = handler.validateInput(data, rules);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
