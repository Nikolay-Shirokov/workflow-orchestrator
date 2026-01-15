/**
 * Интеграционный тест для EditorManager и TemplateGenerator
 * 
 * Проверяет, что компоненты корректно работают вместе:
 * - TemplateGenerator создает валидные шаблоны
 * - EditorManager может определить системный редактор
 */

import { EditorManager } from '../../src/core/editor-manager.js';
import { TemplateGenerator } from '../../src/core/template-generator.js';
import { Logger, LogLevel } from '../../src/core/logger.js';
import { WorkflowStep } from '../../src/core/types.js';
import { FileFormat } from '../../src/core/file-input-types.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe.skip('EditorManager и TemplateGenerator - Интеграция', () => {
  let editorManager: EditorManager;
  let templateGenerator: TemplateGenerator;
  let logger: Logger;
  let tempDir: string;
  
  beforeEach(() => {
    logger = new Logger({
      level: LogLevel.ERROR,
      enableConsole: false,
      enableFile: false
    });
    editorManager = new EditorManager(logger);
    templateGenerator = new TemplateGenerator();
    
    // Создаем временную директорию для тестов
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-template-test-'));
  });
  
  afterEach(() => {
    // Очищаем временную директорию
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
  
  describe('Полный цикл: генерация шаблона → сохранение → проверка редактора', () => {
    const formats: FileFormat[] = ['markdown', 'yaml', 'json', 'text'];
    
    formats.forEach((format) => {
      it(`должен корректно работать с форматом ${format}`, async () => {
        // Arrange
        const step: WorkflowStep = {
          id: 'test-step-1',
          name: 'test-step',
          type: 'user_input',
          description: 'Тестовый шаг для интеграции',
          prompt_message: `
1. Какой ваш любимый язык программирования?
   a) TypeScript
   b) Python
   c) Rust

2. Опишите ваш опыт работы с ним
          `.trim()
        };
        
        // Act - Генерируем шаблон
        const template = templateGenerator.generate(format, step, null as any);
        
        // Assert - Проверяем, что шаблон не пустой
        expect(template).toBeTruthy();
        expect(template.length).toBeGreaterThan(0);
        
        // Act - Сохраняем шаблон в файл
        const extension = format === 'markdown' ? 'md' : format === 'text' ? 'txt' : format;
        const filePath = path.join(tempDir, `template.${extension}`);
        fs.writeFileSync(filePath, template, 'utf-8');
        
        // Assert - Проверяем, что файл создан
        expect(fs.existsSync(filePath)).toBe(true);
        
        // Act - Проверяем, что файл можно прочитать
        const savedContent = fs.readFileSync(filePath, 'utf-8');
        expect(savedContent).toBe(template);
        
        // Note: Мы не запускаем реальный редактор в тестах,
        // но проверяем, что EditorManager может определить системный редактор
        const systemEditor = await editorManager.detectSystemEditor();
        expect(systemEditor).toBeTruthy();
        expect(typeof systemEditor).toBe('string');
      });
    });
  });
  
  describe('Извлечение вопросов и создание структурированных шаблонов', () => {
    it('должен извлекать вопросы и создавать корректные шаблоны для всех форматов', () => {
      // Arrange
      const step: WorkflowStep = {
        id: 'survey-1',
        name: 'survey',
        type: 'user_input',
        prompt_message: `
1. Как вас зовут?
2. Сколько вам лет?
3. Какой ваш любимый цвет?
   - Красный
   - Синий
   - Зеленый
        `.trim()
      };
      
      // Act - Извлекаем вопросы
      const questions = templateGenerator.extractQuestions(step.prompt_message || '');
      
      // Assert - Проверяем извлеченные вопросы
      expect(questions).toHaveLength(3);
      expect(questions[0].number).toBe(1);
      expect(questions[0].text).toContain('зовут');
      expect(questions[2].options).toHaveLength(3);
      
      // Act - Генерируем шаблоны для всех форматов
      const formats: FileFormat[] = ['markdown', 'yaml', 'json', 'text'];
      
      formats.forEach((format) => {
        const template = templateGenerator.generate(format, step, null as any);
        
        // Assert - Проверяем, что шаблон содержит вопросы
        expect(template).toContain('зовут');
        expect(template).toContain('лет');
        expect(template).toContain('цвет');
        
        // Для форматов с вариантами ответов проверяем их наличие
        if (format === 'markdown' || format === 'text') {
          expect(template).toContain('Красный');
          expect(template).toContain('Синий');
          expect(template).toContain('Зеленый');
        }
      });
    });
  });
  
  describe('Обработка специальных символов', () => {
    it('должен корректно обрабатывать специальные символы в шаблонах', () => {
      // Arrange
      const step: WorkflowStep = {
        id: 'special-chars-1',
        name: 'special-chars',
        type: 'user_input',
        prompt_message: 'Опишите использование символов: <, >, &, ", \', \\n, \\t'
      };
      
      // Act & Assert - Проверяем каждый формат
      const markdownTemplate = templateGenerator.generate('markdown', step, null as any);
      expect(markdownTemplate).toContain('<');
      expect(markdownTemplate).toContain('>');
      
      const jsonTemplate = templateGenerator.generate('json', step, null as any);
      const parsed = JSON.parse(jsonTemplate);
      expect(parsed._task).toContain('<');
      expect(parsed._task).toContain('>');
      
      const yamlTemplate = templateGenerator.generate('yaml', step, null as any);
      expect(yamlTemplate).toContain('<');
      
      const textTemplate = templateGenerator.generate('text', step, null as any);
      expect(textTemplate).toContain('<');
    });
  });
  
  describe('Совместимость EditorConfig с TemplateGenerator', () => {
    it('должен создавать файлы, которые EditorManager может открыть', async () => {
      // Arrange
      const step: WorkflowStep = {
        id: 'compatibility-test-1',
        name: 'compatibility-test',
        type: 'user_input',
        prompt_message: 'Тестовое сообщение'
      };
      
      // Act - Создаем шаблон и сохраняем
      const template = templateGenerator.generate('markdown', step, null as any);
      const filePath = path.join(tempDir, 'test.md');
      fs.writeFileSync(filePath, template, 'utf-8');
      
      // Assert - Проверяем, что EditorManager может определить редактор
      const systemEditor = await editorManager.detectSystemEditor();
      expect(systemEditor).toBeTruthy();
      
      // Проверяем, что файл существует и доступен для чтения
      expect(fs.existsSync(filePath)).toBe(true);
      const stats = fs.statSync(filePath);
      expect(stats.isFile()).toBe(true);
      expect(stats.size).toBeGreaterThan(0);
    });
  });
});
