/**
 * Интеграционные тесты для сохранения ответов пользователя
 * 
 * Проверяет сохранение ответов в артефакт и доступность в контексте
 * 
 * Requirements: 4.4
 */

import { UserInputHandler, UserQuestion, UserAnswers } from '../../src/core/user-input-handler.js';

describe('User Input Answers Storage', () => {
  let handler: UserInputHandler;
  
  beforeEach(() => {
    handler = new UserInputHandler();
  });
  
  describe('Создание ответов из пользовательского ввода', () => {
    it('должен создавать ответы из JSON ввода', () => {
      const questions: UserQuestion[] = [
        { id: 'name', question: 'Ваше имя?', required: true, type: 'string' },
        { id: 'age', question: 'Ваш возраст?', required: true, type: 'number' }
      ];
      
      const jsonInput = JSON.stringify({
        name: 'Иван',
        age: 30
      });
      
      const answers = handler.createAnswers(questions, jsonInput, 'json');
      
      expect(answers.answers).toBeDefined();
      expect(answers.answers['name']).toBe('Иван');
      expect(answers.answers['age']).toBe(30);
      expect(answers.timestamp).toBeDefined();
    });
    
    it('должен создавать ответы из YAML ввода', () => {
      const questions: UserQuestion[] = [
        { id: 'project', question: 'Название проекта?', required: true, type: 'string' },
        { id: 'version', question: 'Версия?', required: true, type: 'string' }
      ];
      
      const yamlInput = `project: MyApp
version: 1.0.0`;
      
      const answers = handler.createAnswers(questions, yamlInput, 'yaml');
      
      expect(answers.answers).toBeDefined();
      expect(answers.answers['project']).toBe('MyApp');
      expect(answers.answers['version']).toBe('1.0.0');
    });
    
    it('должен создавать ответы из Markdown ввода', () => {
      const questions: UserQuestion[] = [
        { id: 'Имя', question: 'Имя', required: true, type: 'string' },
        { id: 'Email', question: 'Email', required: true, type: 'string' }
      ];
      
      const markdownInput = `## Имя
Иван Петров

## Email
ivan@example.com`;
      
      const answers = handler.createAnswers(questions, markdownInput, 'markdown');
      
      expect(answers.answers).toBeDefined();
      expect(answers.answers['Имя']).toBe('Иван Петров');
      expect(answers.answers['Email']).toBe('ivan@example.com');
    });
    
    it('должен создавать ответы из формата questions', () => {
      const questions: UserQuestion[] = [
        { id: 'question_1', question: 'Вопрос 1', required: true, type: 'string' },
        { id: 'question_2', question: 'Вопрос 2', required: true, type: 'string' }
      ];
      
      const questionsInput = `1. Вопрос 1
   Ответ: Ответ на первый вопрос

2. Вопрос 2
   Ответ: Ответ на второй вопрос`;
      
      const answers = handler.createAnswers(questions, questionsInput, 'questions');
      
      expect(answers.answers).toBeDefined();
      expect(answers.answers['question_1']).toBe('Ответ на первый вопрос');
      expect(answers.answers['question_2']).toBe('Ответ на второй вопрос');
    });
    
    it('должен использовать значения по умолчанию для отсутствующих ответов', () => {
      const questions: UserQuestion[] = [
        { id: 'name', question: 'Имя?', required: true, type: 'string' },
        { id: 'port', question: 'Порт?', required: false, type: 'number', default: 3000 }
      ];
      
      const jsonInput = JSON.stringify({
        name: 'Иван'
      });
      
      const answers = handler.createAnswers(questions, jsonInput, 'json');
      
      expect(answers.answers['name']).toBe('Иван');
      expect(answers.answers['port']).toBe(3000);
    });
  });
  
  describe('Сохранение ответов с timestamp', () => {
    it('должен добавлять timestamp при создании ответов', () => {
      const questions: UserQuestion[] = [
        { id: 'test', question: 'Тест?', required: true, type: 'string' }
      ];
      
      const jsonInput = JSON.stringify({ test: 'значение' });
      const beforeTime = new Date().toISOString();
      
      const answers = handler.createAnswers(questions, jsonInput, 'json');
      
      const afterTime = new Date().toISOString();
      
      expect(answers.timestamp).toBeDefined();
      expect(answers.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(answers.timestamp >= beforeTime).toBe(true);
      expect(answers.timestamp <= afterTime).toBe(true);
    });
    
    it('должен создавать валидный ISO timestamp', () => {
      const questions: UserQuestion[] = [
        { id: 'test', question: 'Тест?', required: true, type: 'string' }
      ];
      
      const jsonInput = JSON.stringify({ test: 'значение' });
      const answers = handler.createAnswers(questions, jsonInput, 'json');
      
      const timestamp = new Date(answers.timestamp);
      expect(timestamp.getTime()).not.toBeNaN();
      expect(timestamp.toISOString()).toBe(answers.timestamp);
    });
  });
  
  describe('Форматирование ответов для артефакта', () => {
    it('должен форматировать ответы в Markdown по умолчанию', () => {
      const userAnswers: UserAnswers = {
        answers: {
          name: 'Иван',
          age: 30,
          email: 'ivan@example.com'
        },
        timestamp: '2024-01-01T12:00:00.000Z'
      };
      
      const formatted = handler.formatAnswers(userAnswers);
      
      expect(formatted).toContain('# Ответы пользователя');
      expect(formatted).toContain('Время: 2024-01-01T12:00:00.000Z');
      expect(formatted).toContain('## name');
      expect(formatted).toContain('Иван');
      expect(formatted).toContain('## age');
      expect(formatted).toContain('30');
      expect(formatted).toContain('## email');
      expect(formatted).toContain('ivan@example.com');
    });
    
    it('должен форматировать ответы с использованием шаблона', () => {
      const userAnswers: UserAnswers = {
        answers: {
          name: 'Иван',
          age: 30
        },
        timestamp: '2024-01-01T12:00:00.000Z'
      };
      
      const template = 'Пользователь ${name}, возраст ${age} лет';
      const formatted = handler.formatAnswers(userAnswers, template);
      
      expect(formatted).toBe('Пользователь Иван, возраст 30 лет');
    });
    
    it('должен форматировать ответы с множественными подстановками', () => {
      const userAnswers: UserAnswers = {
        answers: {
          project: 'MyApp',
          version: '1.0.0',
          author: 'Иван'
        },
        timestamp: '2024-01-01T12:00:00.000Z'
      };
      
      const template = `Проект: \${project}
Версия: \${version}
Автор: \${author}`;
      
      const formatted = handler.formatAnswers(userAnswers, template);
      
      expect(formatted).toContain('Проект: MyApp');
      expect(formatted).toContain('Версия: 1.0.0');
      expect(formatted).toContain('Автор: Иван');
    });
    
    it('должен обрабатывать специальные символы в ответах', () => {
      const userAnswers: UserAnswers = {
        answers: {
          description: 'Проект с символами: @#$%^&*()'
        },
        timestamp: '2024-01-01T12:00:00.000Z'
      };
      
      const formatted = handler.formatAnswers(userAnswers);
      
      expect(formatted).toContain('Проект с символами: @#$%^&*()');
    });
    
    it('должен форматировать многострочные ответы', () => {
      const userAnswers: UserAnswers = {
        answers: {
          description: 'Первая строка\nВторая строка\nТретья строка'
        },
        timestamp: '2024-01-01T12:00:00.000Z'
      };
      
      const formatted = handler.formatAnswers(userAnswers);
      
      expect(formatted).toContain('Первая строка');
      expect(formatted).toContain('Вторая строка');
      expect(formatted).toContain('Третья строка');
    });
  });
  
  describe('Доступность ответов в контексте', () => {
    it('должен создавать структуру ответов, доступную для подстановки', () => {
      const questions: UserQuestion[] = [
        { id: 'username', question: 'Username?', required: true, type: 'string' },
        { id: 'email', question: 'Email?', required: true, type: 'string' }
      ];
      
      const jsonInput = JSON.stringify({
        username: 'john_doe',
        email: 'john@example.com'
      });
      
      const answers = handler.createAnswers(questions, jsonInput, 'json');
      
      // Проверяем, что ответы доступны как объект
      expect(typeof answers.answers).toBe('object');
      expect(answers.answers['username']).toBe('john_doe');
      expect(answers.answers['email']).toBe('john@example.com');
    });
    
    it('должен сохранять типы данных в ответах', () => {
      const questions: UserQuestion[] = [
        { id: 'name', question: 'Name?', required: true, type: 'string' },
        { id: 'age', question: 'Age?', required: true, type: 'number' },
        { id: 'active', question: 'Active?', required: true, type: 'boolean' },
        { id: 'tags', question: 'Tags?', required: true, type: 'array' }
      ];
      
      const jsonInput = JSON.stringify({
        name: 'John',
        age: 30,
        active: true,
        tags: ['developer', 'nodejs']
      });
      
      const answers = handler.createAnswers(questions, jsonInput, 'json');
      
      expect(typeof answers.answers['name']).toBe('string');
      expect(typeof answers.answers['age']).toBe('number');
      expect(typeof answers.answers['active']).toBe('boolean');
      expect(Array.isArray(answers.answers['tags'])).toBe(true);
    });
    
    it('должен обрабатывать вложенные объекты в ответах', () => {
      const questions: UserQuestion[] = [
        { id: 'config', question: 'Config?', required: true, type: 'string' }
      ];
      
      const jsonInput = JSON.stringify({
        config: {
          host: 'localhost',
          port: 3000
        }
      });
      
      const answers = handler.createAnswers(questions, jsonInput, 'json');
      
      expect(answers.answers['config']).toBeDefined();
      expect(typeof answers.answers['config']).toBe('object');
    });
  });
  
  describe('Обработка пустых и частичных ответов', () => {
    it('должен обрабатывать пустой объект ответов', () => {
      const questions: UserQuestion[] = [
        { id: 'optional', question: 'Optional?', required: false, type: 'string', default: 'default' }
      ];
      
      const jsonInput = JSON.stringify({});
      const answers = handler.createAnswers(questions, jsonInput, 'json');
      
      expect(answers.answers).toBeDefined();
      expect(answers.answers['optional']).toBe('default');
    });
    
    it('должен обрабатывать частичные ответы', () => {
      const questions: UserQuestion[] = [
        { id: 'required', question: 'Required?', required: true, type: 'string' },
        { id: 'optional', question: 'Optional?', required: false, type: 'string' }
      ];
      
      const jsonInput = JSON.stringify({
        required: 'value'
      });
      
      const answers = handler.createAnswers(questions, jsonInput, 'json');
      
      expect(answers.answers['required']).toBe('value');
      expect(answers.answers['optional']).toBeUndefined();
    });
    
    it('должен обрабатывать ответы с дополнительными полями', () => {
      const questions: UserQuestion[] = [
        { id: 'name', question: 'Name?', required: true, type: 'string' }
      ];
      
      const jsonInput = JSON.stringify({
        name: 'John',
        extra: 'extra value'
      });
      
      const answers = handler.createAnswers(questions, jsonInput, 'json');
      
      expect(answers.answers['name']).toBe('John');
      // Дополнительные поля не должны попасть в ответы
      expect(answers.answers['extra']).toBeUndefined();
    });
  });
  
  describe('Интеграция с форматированием', () => {
    it('должен создавать и форматировать ответы в одном потоке', () => {
      const questions: UserQuestion[] = [
        { id: 'name', question: 'Name?', required: true, type: 'string' },
        { id: 'email', question: 'Email?', required: true, type: 'string' }
      ];
      
      const jsonInput = JSON.stringify({
        name: 'John Doe',
        email: 'john@example.com'
      });
      
      const answers = handler.createAnswers(questions, jsonInput, 'json');
      const formatted = handler.formatAnswers(answers);
      
      expect(formatted).toContain('John Doe');
      expect(formatted).toContain('john@example.com');
      expect(formatted).toContain(answers.timestamp);
    });
    
    it('должен создавать ответы, готовые для сохранения в артефакт', () => {
      const questions: UserQuestion[] = [
        { id: 'project', question: 'Project?', required: true, type: 'string' },
        { id: 'version', question: 'Version?', required: true, type: 'string' }
      ];
      
      const jsonInput = JSON.stringify({
        project: 'MyApp',
        version: '1.0.0'
      });
      
      const answers = handler.createAnswers(questions, jsonInput, 'json');
      const formatted = handler.formatAnswers(answers);
      
      // Проверяем, что форматированный текст можно сохранить как артефакт
      expect(formatted).toBeTruthy();
      expect(formatted.length).toBeGreaterThan(0);
      expect(formatted).toContain('# Ответы пользователя');
    });
  });
});
