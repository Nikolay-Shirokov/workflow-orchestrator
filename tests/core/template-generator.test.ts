/**
 * Unit тесты для TemplateGenerator
 * 
 * Проверяет функциональность генератора шаблонов для файлового ввода
 */

import { TemplateGenerator } from '../../src/core/template-generator.js';
import { WorkflowStep, ExecutionContext, WorkflowState, WorkflowStatus } from '../../src/core/types.js';
import { FileFormat } from '../../src/core/file-input-types.js';
import { Logger, LogLevel } from '../../src/core/logger.js';

describe.skip('TemplateGenerator Unit Tests', () => {
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
  
  describe('generate', () => {
    it('должен генерировать Markdown шаблон', () => {
      const step: WorkflowStep = {
        id: 'step1',
        name: 'Тестовый шаг',
        type: 'user_input',
        description: 'Описание шага',
        prompt_message: 'Пожалуйста, ответьте на вопросы'
      };
      
      const template = generator.generate('markdown', step, mockContext);
      
      expect(template).toContain('# Тестовый шаг');
      expect(template).toContain('Описание шага');
      expect(template).toContain('## Инструкции');
      expect(template).toContain('продолжить');
    });
    
    it('должен генерировать YAML шаблон', () => {
      const step: WorkflowStep = {
        id: 'step1',
        name: 'Тестовый шаг',
        type: 'user_input',
        prompt_message: 'Введите данные'
      };
      
      const template = generator.generate('yaml', step, mockContext);
      
      expect(template).toContain('# Тестовый шаг');
      expect(template).toContain('# Инструкции:');
      expect(template).toContain('response:');
    });
    
    it('должен генерировать JSON шаблон', () => {
      const step: WorkflowStep = {
        id: 'step1',
        name: 'Тестовый шаг',
        type: 'user_input',
        prompt_message: 'Введите данные'
      };
      
      const template = generator.generate('json', step, mockContext);
      
      expect(template).toContain('"_comment"');
      expect(template).toContain('Тестовый шаг');
      expect(template).toContain('"_instructions"');
      expect(template).toContain('"response"');
      
      // Проверяем, что это валидный JSON
      expect(() => JSON.parse(template)).not.toThrow();
    });
    
    it('должен генерировать Text шаблон', () => {
      const step: WorkflowStep = {
        id: 'step1',
        name: 'Тестовый шаг',
        type: 'user_input',
        prompt_message: 'Введите данные'
      };
      
      const template = generator.generate('text', step, mockContext);
      
      expect(template).toContain('ТЕСТОВЫЙ ШАГ');
      expect(template).toContain('ИНСТРУКЦИИ:');
      expect(template).toContain('ВАШ ОТВЕТ:');
      expect(template).toContain('='.repeat(70));
    });
    
    it('должен выбросить ошибку для неподдерживаемого формата', () => {
      const step: WorkflowStep = {
        id: 'step1',
        name: 'Тестовый шаг',
        type: 'user_input'
      };
      
      expect(() => {
        generator.generate('invalid' as FileFormat, step, mockContext);
      }).toThrow('Неподдерживаемый формат');
    });
  });
  
  describe('extractQuestions', () => {
    it('должен извлекать вопросы в формате "1. Вопрос"', () => {
      const promptMessage = `
1. Как вас зовут?
2. Сколько вам лет?
3. Где вы живете?
      `.trim();
      
      const questions = generator.extractQuestions(promptMessage);
      
      expect(questions).toHaveLength(3);
      expect(questions[0].number).toBe(1);
      expect(questions[0].text).toBe('Как вас зовут?');
      expect(questions[1].number).toBe(2);
      expect(questions[1].text).toBe('Сколько вам лет?');
      expect(questions[2].number).toBe(3);
      expect(questions[2].text).toBe('Где вы живете?');
    });
    
    it('должен извлекать вопросы в формате "Вопрос 1:"', () => {
      const promptMessage = `
Вопрос 1: Как вас зовут?
Вопрос 2: Сколько вам лет?
      `.trim();
      
      const questions = generator.extractQuestions(promptMessage);
      
      expect(questions).toHaveLength(2);
      expect(questions[0].number).toBe(1);
      expect(questions[0].text).toBe('Как вас зовут?');
      expect(questions[1].number).toBe(2);
      expect(questions[1].text).toBe('Сколько вам лет?');
    });
    
    it('должен извлекать вопросы в формате "Q1:"', () => {
      const promptMessage = `
Q1: What is your name?
Q2: How old are you?
      `.trim();
      
      const questions = generator.extractQuestions(promptMessage);
      
      expect(questions).toHaveLength(2);
      expect(questions[0].number).toBe(1);
      expect(questions[0].text).toBe('What is your name?');
      expect(questions[1].number).toBe(2);
      expect(questions[1].text).toBe('How old are you?');
    });
    
    it('должен извлекать варианты ответов', () => {
      const promptMessage = `
1. Выберите цвет:
a) Красный
b) Синий
c) Зеленый

2. Выберите размер:
- Маленький
- Средний
- Большой
      `.trim();
      
      const questions = generator.extractQuestions(promptMessage);
      
      expect(questions).toHaveLength(2);
      expect(questions[0].options).toHaveLength(3);
      expect(questions[0].options).toContain('Красный');
      expect(questions[0].options).toContain('Синий');
      expect(questions[0].options).toContain('Зеленый');
      
      expect(questions[1].options).toHaveLength(3);
      expect(questions[1].options).toContain('Маленький');
      expect(questions[1].options).toContain('Средний');
      expect(questions[1].options).toContain('Большой');
    });
    
    it('должен вернуть пустой массив для текста без вопросов', () => {
      const promptMessage = 'Просто текст без вопросов';
      
      const questions = generator.extractQuestions(promptMessage);
      
      expect(questions).toHaveLength(0);
    });
    
    it('должен вернуть пустой массив для пустой строки', () => {
      const questions = generator.extractQuestions('');
      
      expect(questions).toHaveLength(0);
    });
    
    it('должен обрабатывать многострочные вопросы', () => {
      const promptMessage = `
1. Расскажите о себе
   подробно, включая образование
   и опыт работы
2. Каковы ваши цели?
      `.trim();
      
      const questions = generator.extractQuestions(promptMessage);
      
      expect(questions).toHaveLength(2);
      expect(questions[0].text).toContain('Расскажите о себе');
      expect(questions[0].text).toContain('подробно');
      expect(questions[0].text).toContain('опыт работы');
    });
  });
  
  describe('generateMarkdownTemplate', () => {
    it('должен включать все секции', () => {
      const step: WorkflowStep = {
        id: 'step1',
        name: 'Тестовый шаг',
        type: 'user_input',
        description: 'Описание',
        prompt_message: '1. Вопрос 1\n2. Вопрос 2'
      };
      
      const template = generator.generate('markdown', step, mockContext);
      
      expect(template).toContain('# Тестовый шаг');
      expect(template).toContain('> Описание');
      expect(template).toContain('## Инструкции');
      expect(template).toContain('## Задание');
      expect(template).toContain('## Вопросы');
      expect(template).toContain('### 1. Вопрос 1');
      expect(template).toContain('### 2. Вопрос 2');
      expect(template).toContain('**Ваш ответ:**');
    });
    
    it('должен работать без описания', () => {
      const step: WorkflowStep = {
        id: 'step1',
        name: 'Тестовый шаг',
        type: 'user_input',
        prompt_message: 'Введите данные'
      };
      
      const template = generator.generate('markdown', step, mockContext);
      
      expect(template).toContain('# Тестовый шаг');
      expect(template).not.toContain('> Описание');
      expect(template).toContain('## Инструкции');
    });
    
    it('должен работать без вопросов', () => {
      const step: WorkflowStep = {
        id: 'step1',
        name: 'Тестовый шаг',
        type: 'user_input',
        prompt_message: 'Просто введите текст'
      };
      
      const template = generator.generate('markdown', step, mockContext);
      
      expect(template).toContain('## Ваш ответ');
      expect(template).not.toContain('## Вопросы');
    });
  });
  
  describe('generateYAMLTemplate', () => {
    it('должен включать комментарии с инструкциями', () => {
      const step: WorkflowStep = {
        id: 'step1',
        name: 'Тестовый шаг',
        type: 'user_input',
        description: 'Описание',
        prompt_message: '1. Вопрос 1'
      };
      
      const template = generator.generate('yaml', step, mockContext);
      
      expect(template).toContain('# Тестовый шаг');
      expect(template).toContain('# Описание');
      expect(template).toContain('# Инструкции:');
      expect(template).toContain('# 1. Заполните поля ниже');
    });
    
    it('должен генерировать структуру для вопросов', () => {
      const step: WorkflowStep = {
        id: 'step1',
        name: 'Тестовый шаг',
        type: 'user_input',
        prompt_message: '1. Вопрос 1\n2. Вопрос 2'
      };
      
      const template = generator.generate('yaml', step, mockContext);
      
      expect(template).toContain('answers:');
      expect(template).toContain('question_1: ""');
      expect(template).toContain('question_2: ""');
    });
    
    it('должен генерировать простое поле для текста без вопросов', () => {
      const step: WorkflowStep = {
        id: 'step1',
        name: 'Тестовый шаг',
        type: 'user_input',
        prompt_message: 'Введите текст'
      };
      
      const template = generator.generate('yaml', step, mockContext);
      
      expect(template).toContain('response: ""');
      expect(template).not.toContain('answers:');
    });
  });
  
  describe('generateJSONTemplate', () => {
    it('должен генерировать валидный JSON', () => {
      const step: WorkflowStep = {
        id: 'step1',
        name: 'Тестовый шаг',
        type: 'user_input',
        prompt_message: 'Введите данные'
      };
      
      const template = generator.generate('json', step, mockContext);
      
      expect(() => JSON.parse(template)).not.toThrow();
    });
    
    it('должен включать метаданные', () => {
      const step: WorkflowStep = {
        id: 'step1',
        name: 'Тестовый шаг',
        type: 'user_input',
        description: 'Описание',
        prompt_message: 'Задание'
      };
      
      const template = generator.generate('json', step, mockContext);
      const parsed = JSON.parse(template);
      
      expect(parsed._comment).toContain('Тестовый шаг');
      expect(parsed._description).toBe('Описание');
      expect(parsed._instructions).toBeInstanceOf(Array);
      expect(parsed._task).toBe('Задание');
    });
    
    it('должен генерировать структуру для вопросов', () => {
      const step: WorkflowStep = {
        id: 'step1',
        name: 'Тестовый шаг',
        type: 'user_input',
        prompt_message: '1. Вопрос 1\n2. Вопрос 2'
      };
      
      const template = generator.generate('json', step, mockContext);
      const parsed = JSON.parse(template);
      
      expect(parsed.answers).toBeDefined();
      expect(parsed.answers.question_1).toBe('');
      expect(parsed.answers.question_2).toBe('');
    });
    
    it('должен экранировать специальные символы', () => {
      const step: WorkflowStep = {
        id: 'step1',
        name: 'Тестовый шаг',
        type: 'user_input',
        prompt_message: 'Текст с "кавычками" и \n переносами'
      };
      
      const template = generator.generate('json', step, mockContext);
      
      expect(() => JSON.parse(template)).not.toThrow();
      const parsed = JSON.parse(template);
      expect(parsed._task).toContain('кавычками');
    });
  });
  
  describe('generateTextTemplate', () => {
    it('должен включать разделители', () => {
      const step: WorkflowStep = {
        id: 'step1',
        name: 'Тестовый шаг',
        type: 'user_input',
        prompt_message: 'Введите данные'
      };
      
      const template = generator.generate('text', step, mockContext);
      
      expect(template).toContain('='.repeat(70));
      expect(template).toContain('-'.repeat(70));
    });
    
    it('должен включать все секции', () => {
      const step: WorkflowStep = {
        id: 'step1',
        name: 'Тестовый шаг',
        type: 'user_input',
        description: 'Описание',
        prompt_message: '1. Вопрос 1'
      };
      
      const template = generator.generate('text', step, mockContext);
      
      expect(template).toContain('ТЕСТОВЫЙ ШАГ');
      expect(template).toContain('Описание');
      expect(template).toContain('ИНСТРУКЦИИ:');
      expect(template).toContain('ЗАДАНИЕ:');
      expect(template).toContain('ВОПРОСЫ:');
    });
    
    it('должен форматировать вопросы с номерами', () => {
      const step: WorkflowStep = {
        id: 'step1',
        name: 'Тестовый шаг',
        type: 'user_input',
        prompt_message: '1. Вопрос 1\n2. Вопрос 2'
      };
      
      const template = generator.generate('text', step, mockContext);
      
      expect(template).toContain('1. Вопрос 1');
      expect(template).toContain('2. Вопрос 2');
      expect(template).toContain('Ответ:');
    });
  });
  
  describe('Обработка краевых случаев', () => {
    it('должен работать с пустым prompt_message', () => {
      const step: WorkflowStep = {
        id: 'step1',
        name: 'Тестовый шаг',
        type: 'user_input',
        prompt_message: ''
      };
      
      expect(() => {
        generator.generate('markdown', step, mockContext);
      }).not.toThrow();
    });
    
    it('должен работать без prompt_message', () => {
      const step: WorkflowStep = {
        id: 'step1',
        name: 'Тестовый шаг',
        type: 'user_input'
      };
      
      expect(() => {
        generator.generate('markdown', step, mockContext);
      }).not.toThrow();
    });
    
    it('должен работать с очень длинным текстом', () => {
      const longText = 'Очень длинный текст '.repeat(100);
      const step: WorkflowStep = {
        id: 'step1',
        name: 'Тестовый шаг',
        type: 'user_input',
        prompt_message: longText
      };
      
      const template = generator.generate('markdown', step, mockContext);
      
      expect(template).toContain(longText);
    });
    
    it('должен работать со специальными символами', () => {
      const step: WorkflowStep = {
        id: 'step1',
        name: 'Тестовый шаг',
        type: 'user_input',
        prompt_message: 'Текст с <тегами> и & символами'
      };
      
      expect(() => {
        generator.generate('markdown', step, mockContext);
        generator.generate('yaml', step, mockContext);
        generator.generate('json', step, mockContext);
        generator.generate('text', step, mockContext);
      }).not.toThrow();
    });
  });
});
