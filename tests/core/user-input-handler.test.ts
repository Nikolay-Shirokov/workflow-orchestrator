/**
 * Unit тесты для UserInputHandler
 * 
 * Проверяет функциональность новых методов extractAnswersOnly и formatForContext
 */

import { UserInputHandler, UserQuestion, UserAnswers } from '../../src/core/user-input-handler.js';

describe('UserInputHandler Unit Tests', () => {
  let handler: UserInputHandler;
  
  beforeEach(() => {
    handler = new UserInputHandler();
  });
  
  describe('extractAnswersOnly', () => {
    const sampleQuestions: UserQuestion[] = [
      {
        id: 'question_1',
        question: 'Как вас зовут?',
        required: true,
        type: 'string'
      },
      {
        id: 'question_2',
        question: 'Сколько вам лет?',
        required: true,
        type: 'number'
      },
      {
        id: 'question_3',
        question: 'Ваш город?',
        required: false,
        type: 'string'
      }
    ];
    
    const sampleAnswers: UserAnswers = {
      answers: {
        question_1: 'Иван',
        question_2: 25,
        question_3: 'Москва'
      },
      timestamp: '2024-01-01T12:00:00.000Z'
    };
    
    it('должен извлекать только ответы без вопросов (по умолчанию)', () => {
      const result = handler.extractAnswersOnly(sampleAnswers);
      
      expect(result).toEqual({
        question_1: 'Иван',
        question_2: 25,
        question_3: 'Москва'
      });
      
      // Проверяем, что вопросы не включены
      expect(result.question_1).not.toHaveProperty('question');
      expect(result.question_1).not.toHaveProperty('answer');
    });
    
    it('должен извлекать только ответы когда includeQuestions = false', () => {
      const result = handler.extractAnswersOnly(sampleAnswers, sampleQuestions, false);
      
      expect(result).toEqual({
        question_1: 'Иван',
        question_2: 25,
        question_3: 'Москва'
      });
    });
    
    it('должен включать вопросы когда includeQuestions = true', () => {
      const result = handler.extractAnswersOnly(sampleAnswers, sampleQuestions, true);
      
      expect(result).toEqual({
        question_1: {
          question: 'Как вас зовут?',
          answer: 'Иван'
        },
        question_2: {
          question: 'Сколько вам лет?',
          answer: 25
        },
        question_3: {
          question: 'Ваш город?',
          answer: 'Москва'
        }
      });
    });
    
    it('должен обрабатывать случай когда вопросы не предоставлены', () => {
      const result = handler.extractAnswersOnly(sampleAnswers, undefined, true);
      
      // Без вопросов должны вернуться только ответы
      expect(result).toEqual({
        question_1: 'Иван',
        question_2: 25,
        question_3: 'Москва'
      });
    });
    
    it('должен обрабатывать пустые ответы', () => {
      const emptyAnswers: UserAnswers = {
        answers: {},
        timestamp: '2024-01-01T12:00:00.000Z'
      };
      
      const result = handler.extractAnswersOnly(emptyAnswers);
      
      expect(result).toEqual({});
    });
    
    it('должен обрабатывать ответы с отсутствующими вопросами', () => {
      const answersWithExtra: UserAnswers = {
        answers: {
          question_1: 'Иван',
          question_2: 25,
          question_4: 'Дополнительный ответ' // Вопрос не существует
        },
        timestamp: '2024-01-01T12:00:00.000Z'
      };
      
      const result = handler.extractAnswersOnly(answersWithExtra, sampleQuestions, true);
      
      expect(result.question_1).toEqual({
        question: 'Как вас зовут?',
        answer: 'Иван'
      });
      expect(result.question_2).toEqual({
        question: 'Сколько вам лет?',
        answer: 25
      });
      // Для вопроса без метаданных возвращаем просто ответ
      expect(result.question_4).toBe('Дополнительный ответ');
    });
  });
  
  describe('formatForContext', () => {
    const sampleQuestions: UserQuestion[] = [
      {
        id: 'question_1',
        question: 'Как вас зовут?',
        required: true,
        type: 'string'
      },
      {
        id: 'question_2',
        question: 'Сколько вам лет?',
        required: true,
        type: 'number'
      }
    ];
    
    const sampleAnswers: UserAnswers = {
      answers: {
        question_1: 'Иван',
        question_2: 25
      },
      timestamp: '2024-01-01T12:00:00.000Z'
    };
    
    describe('text формат', () => {
      it('должен форматировать в текстовый формат без вопросов', () => {
        const result = handler.formatForContext(sampleAnswers, 'text');
        
        expect(result).toContain('question_1: Иван');
        expect(result).toContain('question_2: 25');
        expect(result).not.toContain('Как вас зовут?');
      });
      
      it('должен форматировать в текстовый формат с вопросами', () => {
        const result = handler.formatForContext(sampleAnswers, 'text', sampleQuestions, true);
        
        expect(result).toContain('question_1:');
        expect(result).toContain('Q: Как вас зовут?');
        expect(result).toContain('A: Иван');
        expect(result).toContain('question_2:');
        expect(result).toContain('Q: Сколько вам лет?');
        expect(result).toContain('A: 25');
      });
      
      it('должен обрабатывать сложные типы данных', () => {
        const complexAnswers: UserAnswers = {
          answers: {
            question_1: { nested: 'value' },
            question_2: [1, 2, 3]
          },
          timestamp: '2024-01-01T12:00:00.000Z'
        };
        
        const result = handler.formatForContext(complexAnswers, 'text');
        
        expect(result).toContain('question_1: {"nested":"value"}');
        expect(result).toContain('question_2: [1,2,3]');
      });
    });
    
    describe('json формат', () => {
      it('должен форматировать в JSON без вопросов', () => {
        const result = handler.formatForContext(sampleAnswers, 'json');
        
        const parsed = JSON.parse(result);
        expect(parsed).toEqual({
          question_1: 'Иван',
          question_2: 25
        });
      });
      
      it('должен форматировать в JSON с вопросами', () => {
        const result = handler.formatForContext(sampleAnswers, 'json', sampleQuestions, true);
        
        const parsed = JSON.parse(result);
        expect(parsed).toEqual({
          question_1: {
            question: 'Как вас зовут?',
            answer: 'Иван'
          },
          question_2: {
            question: 'Сколько вам лет?',
            answer: 25
          }
        });
      });
      
      it('должен создавать компактный JSON (без отступов)', () => {
        const result = handler.formatForContext(sampleAnswers, 'json');
        
        // Проверяем, что нет лишних пробелов и переносов строк
        expect(result).not.toContain('\n');
        expect(result).not.toMatch(/\s{2,}/);
      });
    });
    
    describe('yaml формат', () => {
      it('должен форматировать в YAML без вопросов', () => {
        const result = handler.formatForContext(sampleAnswers, 'yaml');
        
        expect(result).toContain('question_1: Иван');
        expect(result).toContain('question_2: 25');
      });
      
      it('должен форматировать в YAML с вопросами', () => {
        const result = handler.formatForContext(sampleAnswers, 'yaml', sampleQuestions, true);
        
        expect(result).toContain('question_1:');
        expect(result).toContain('question: Как вас зовут?');
        expect(result).toContain('answer: Иван');
        expect(result).toContain('question_2:');
        expect(result).toContain('question: Сколько вам лет?');
        expect(result).toContain('answer: 25');
      });
      
      it('должен создавать валидный YAML', () => {
        const result = handler.formatForContext(sampleAnswers, 'yaml');
        
        // Проверяем, что результат можно распарсить обратно
        const parsed = handler.parseStructuredInput(result, 'yaml');
        expect(parsed.data).toEqual({
          question_1: 'Иван',
          question_2: 25
        });
      });
    });
    
    describe('оптимизация размера', () => {
      it('должен создавать меньший размер без вопросов', () => {
        const withoutQuestions = handler.formatForContext(sampleAnswers, 'text', sampleQuestions, false);
        const withQuestions = handler.formatForContext(sampleAnswers, 'text', sampleQuestions, true);
        
        expect(withoutQuestions.length).toBeLessThan(withQuestions.length);
      });
      
      it('должен создавать компактный формат в JSON', () => {
        const jsonResult = handler.formatForContext(sampleAnswers, 'json');
        
        // JSON должен быть компактным (без лишних пробелов)
        expect(jsonResult).not.toContain('\n');
        expect(jsonResult).not.toMatch(/\s{2,}/);
        
        // Проверяем, что это валидный JSON
        const parsed = JSON.parse(jsonResult);
        expect(parsed).toEqual(sampleAnswers.answers);
      });
    });
    
    describe('граничные случаи', () => {
      it('должен обрабатывать пустые ответы', () => {
        const emptyAnswers: UserAnswers = {
          answers: {},
          timestamp: '2024-01-01T12:00:00.000Z'
        };
        
        const result = handler.formatForContext(emptyAnswers, 'json');
        expect(result).toBe('{}');
      });
      
      it('должен обрабатывать специальные символы в ответах', () => {
        const specialAnswers: UserAnswers = {
          answers: {
            question_1: 'Ответ с "кавычками"',
            question_2: 'Ответ с\nпереносом строки',
            question_3: 'Ответ с \\ обратным слешем'
          },
          timestamp: '2024-01-01T12:00:00.000Z'
        };
        
        const jsonResult = handler.formatForContext(specialAnswers, 'json');
        const parsed = JSON.parse(jsonResult);
        
        expect(parsed.question_1).toBe('Ответ с "кавычками"');
        expect(parsed.question_2).toBe('Ответ с\nпереносом строки');
        expect(parsed.question_3).toBe('Ответ с \\ обратным слешем');
      });
      
      it('должен обрабатывать Unicode символы', () => {
        const unicodeAnswers: UserAnswers = {
          answers: {
            question_1: 'Привет 👋',
            question_2: '日本語',
            question_3: '🚀 Emoji'
          },
          timestamp: '2024-01-01T12:00:00.000Z'
        };
        
        const result = handler.formatForContext(unicodeAnswers, 'json');
        const parsed = JSON.parse(result);
        
        expect(parsed.question_1).toBe('Привет 👋');
        expect(parsed.question_2).toBe('日本語');
        expect(parsed.question_3).toBe('🚀 Emoji');
      });
    });
  });
});
