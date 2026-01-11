import * as fc from 'fast-check';
import { DefaultTemplateEngine, createTemplateContext } from '../../src/core/template-engine.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('TemplateEngine Unit Tests', () => {
  let engine: DefaultTemplateEngine;
  let tempDir: string;
  
  beforeEach(() => {
    engine = new DefaultTemplateEngine();
    // Создаем временную директорию для тестовых артефактов
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'template-engine-test-'));
  });
  
  afterEach(() => {
    // Очищаем временную директорию
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
  
  describe('evaluateArtifact с вложенными переменными', () => {
    it('должен разрешать ${artifact:${variable}}', () => {
      // Создаем тестовый файл
      const testFilePath = path.join(tempDir, 'test-artifact.txt');
      const testContent = 'Содержимое тестового артефакта';
      fs.writeFileSync(testFilePath, testContent, 'utf-8');
      
      // Создаем шаблон с вложенной переменной
      const template = '${artifact:${file_path}}';
      const context = createTemplateContext(
        { file_path: testFilePath },
        (filePath: string) => fs.readFileSync(filePath, 'utf-8')
      );
      
      const result = engine.render(template, context);
      expect(result).toBe(testContent);
    });
    
    it('должен выбрасывать ошибку при несуществующей переменной', () => {
      const template = '${artifact:${nonexistent_var}}';
      const context = createTemplateContext(
        { some_other_var: 'value' },
        () => ''
      );
      
      expect(() => engine.render(template, context)).toThrow();
      
      try {
        engine.render(template, context);
      } catch (error: any) {
        expect(error.code).toBe('UNDEFINED_VARIABLE');
        expect(error.message).toContain('nonexistent_var');
        expect(error.context.availableVariables).toContain('some_other_var');
      }
    });
    
    it('должен выбрасывать ошибку при несуществующем файле', () => {
      const nonexistentPath = path.join(tempDir, 'nonexistent-file.txt');
      const template = '${artifact:${file_path}}';
      const context = createTemplateContext(
        { file_path: nonexistentPath },
        (filePath: string) => {
          if (!fs.existsSync(filePath)) {
            throw new Error(`Файл не найден: ${filePath}`);
          }
          return fs.readFileSync(filePath, 'utf-8');
        }
      );
      
      expect(() => engine.render(template, context)).toThrow();
      
      try {
        engine.render(template, context);
      } catch (error: any) {
        expect(error.message).toContain('Файл не найден');
        expect(error.message).toContain(nonexistentPath);
      }
    });
  });
  
  describe('wrapInTags', () => {
    it('должен обрамлять содержимое в простые теги', () => {
      // Создаем тестовый файл
      const testFilePath = path.join(tempDir, 'test-content.txt');
      const testContent = 'Тестовое содержимое';
      fs.writeFileSync(testFilePath, testContent, 'utf-8');
      
      // Используем синтаксис с тегом
      const template = '${artifact:${file_path}:my_tag}';
      const context = createTemplateContext(
        { file_path: testFilePath },
        (filePath: string) => fs.readFileSync(filePath, 'utf-8')
      );
      
      const result = engine.render(template, context);
      expect(result).toBe(`<my_tag>\n${testContent}\n</my_tag>`);
    });
    
    it('должен экранировать специальные символы в именах тегов', () => {
      const testFilePath = path.join(tempDir, 'test-special.txt');
      const testContent = 'Содержимое';
      fs.writeFileSync(testFilePath, testContent, 'utf-8');
      
      // Используем имя тега со специальными символами
      const template = '${artifact:${file_path}:my-tag@123!}';
      const context = createTemplateContext(
        { file_path: testFilePath },
        (filePath: string) => fs.readFileSync(filePath, 'utf-8')
      );
      
      const result = engine.render(template, context);
      // Специальные символы должны быть заменены на _
      expect(result).toMatch(/<my-tag_123_>/);
      expect(result).toMatch(/<\/my-tag_123_>/);
      expect(result).toContain(testContent);
    });
    
    it('должен создавать парные теги с пустым содержимым', () => {
      const testFilePath = path.join(tempDir, 'empty-file.txt');
      fs.writeFileSync(testFilePath, '', 'utf-8');
      
      const template = '${artifact:${file_path}:empty_tag}';
      const context = createTemplateContext(
        { file_path: testFilePath },
        (filePath: string) => fs.readFileSync(filePath, 'utf-8')
      );
      
      const result = engine.render(template, context);
      expect(result).toBe('<empty_tag>\n\n</empty_tag>');
    });
  });
});

describe('TemplateEngine Property-Based Tests', () => {
  let engine: DefaultTemplateEngine;
  
  beforeEach(() => {
    engine = new DefaultTemplateEngine();
  });
  
  it('Property 11: Variable Recognition', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.string({ minLength: 1, maxLength: 20 })
            .filter(s => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)),
          { minLength: 1, maxLength: 10 }
        ),
        fc.array(
          fc.string().filter(s => !s.includes('${') && !s.includes('}')),
          { minLength: 0, maxLength: 11 }
        ),
        (variableNames, textParts) => {
          let template = textParts[0] || '';
          for (let i = 0; i < variableNames.length; i++) {
            template += `\${${variableNames[i]}}`;
            if (i + 1 < textParts.length) {
              template += textParts[i + 1];
            }
          }
          
          const extractedVariables = engine.extractVariables(template);
          expect(extractedVariables.length).toBe(variableNames.length);
          
          for (const varName of variableNames) {
            const expectedVar = `\${${varName}}`;
            expect(extractedVariables).toContain(expectedVar);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
  
  it('Property 12: Variable Substitution', () => {
    fc.assert(
      fc.property(
        fc.dictionary(
          fc.string({ minLength: 1, maxLength: 10 })
            .filter(s => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)),
          fc.oneof(
            fc.string().filter(s => !s.includes('${') && !s.includes('}')),
            fc.integer(),
            fc.boolean(),
            fc.constant(null)
          ),
          { minKeys: 1, maxKeys: 10 }
        ),
        (variables) => {
          const validVariables: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(variables)) {
            if (value !== null) {
              validVariables[key] = value;
            }
          }
          
          if (Object.keys(validVariables).length === 0) {
            return;
          }
          
          const template = Object.keys(validVariables)
            .map(key => `\${${key}}`)
            .join(' ');
          
          const context = createTemplateContext(validVariables, () => '');
          const result = engine.render(template, context);
          
          for (const [, value] of Object.entries(validVariables)) {
            expect(result).toContain(String(value));
          }
          
          expect(result).not.toMatch(/\$\{[^}]+\}/);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 13: Artifact Loading', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            path: fc.string({ minLength: 1, maxLength: 30 })
              .filter(s => !s.includes('}') && !s.includes('$') && s.trim().length > 0),
            content: fc.string({ minLength: 0, maxLength: 100 })
          }),
          { minLength: 1, maxLength: 5 }
        ),
        (artifacts) => {
          // Очищаем кэш артефактов перед каждой итерацией
          engine.clearArtifactCache();
          
          // Удаляем дубликаты путей, оставляя последний
          const uniqueArtifacts = new Map<string, string>();
          for (const artifact of artifacts) {
            uniqueArtifacts.set(artifact.path.trim(), artifact.content);
          }
          
          // Создаем шаблон только с уникальными путями
          const template = Array.from(uniqueArtifacts.keys())
            .map(path => `\${artifact:${path}}`)
            .join(' ');
          
          const context = createTemplateContext(
            {},
            (path: string) => {
              const content = uniqueArtifacts.get(path);
              if (content === undefined) {
                throw new Error(`Artifact not found: ${path}`);
              }
              return content;
            }
          );
          
          const result = engine.render(template, context);
          
          // Проверяем, что все уникальные содержимые присутствуют
          for (const content of uniqueArtifacts.values()) {
            expect(result).toContain(content);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: workflow-orchestrator, Property 14: Условные блоки шаблона
   * 
   * Свойство: Для любого шаблона с условными блоками, рендеринг с разными
   * значениями условий должен включать или исключать условный текст соответственно.
   * 
   * Проверяет: Требование 3.4
   */
  it('Property 14: Conditional Blocks', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 10 })
          .filter(s => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)),
        fc.string({ minLength: 1, maxLength: 20 })
          .filter(s => !s.includes('}') && !s.includes('$') && !s.includes(':') && /\S/.test(s)),
        fc.string({ minLength: 1, maxLength: 20 })
          .filter(s => !s.includes('}') && !s.includes('$') && !s.includes(':') && /\S/.test(s)),
        fc.boolean(),
        (conditionVar, thenText, elseText, conditionValue) => {
          // Убеждаемся что then и else разные
          if (thenText === elseText) {
            return;
          }
          
          const template = `\${if:${conditionVar}:${thenText}:${elseText}}`;
          const context = createTemplateContext(
            { [conditionVar]: conditionValue },
            () => ''
          );
          
          const result = engine.render(template, context);
          
          if (conditionValue) {
            expect(result).toBe(thenText);
          } else {
            expect(result).toBe(elseText);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: workflow-orchestrator, Property 15: Ошибка неопределенной переменной
   * 
   * Свойство: Для любого шаблона, содержащего неопределенную переменную,
   * рендеринг должен завершаться с ошибкой, указывающей имя отсутствующей переменной.
   * 
   * Проверяет: Требование 3.5
   */
  it('Property 15: Undefined Variable Error', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 })
          .filter(s => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)),
        fc.dictionary(
          fc.string({ minLength: 1, maxLength: 10 })
            .filter(s => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)),
          fc.string(),
          { minKeys: 0, maxKeys: 5 }
        ),
        (undefinedVar, definedVars) => {
          // Убеждаемся что undefinedVar действительно не определена
          if (undefinedVar in definedVars) {
            return;
          }
          
          const template = `\${${undefinedVar}}`;
          const context = createTemplateContext(definedVars, () => '');
          
          // Ожидаем ошибку с кодом UNDEFINED_VARIABLE
          expect(() => engine.render(template, context)).toThrow();
          
          try {
            engine.render(template, context);
          } catch (error: any) {
            expect(error.code).toBe('UNDEFINED_VARIABLE');
            expect(error.message).toContain(undefinedVar);
            expect(error.context.variable).toBe(undefinedVar);
            expect(error.context.availableVariables).toEqual(Object.keys(definedVars));
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: fix-context-passing, Property 1: Вложенные переменные разрешаются корректно
   * 
   * Свойство: Для любого шаблона с выражением ${artifact:${variable}}, где variable 
   * определена в контексте как путь к существующему файлу, рендеринг шаблона должен 
   * вернуть содержимое этого файла.
   * 
   * Validates: Requirements 1.1, 1.2
   */
  it('Property 1: Вложенные переменные разрешаются корректно', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            varName: fc.string({ minLength: 1, maxLength: 10 })
              .filter(s => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s))
              .filter(s => !['__proto__', 'constructor', 'prototype'].includes(s)),
            filePath: fc.string({ minLength: 1, maxLength: 20 })
              .filter(s => !s.includes('${') && !s.includes('}') && s.trim().length > 0),
            content: fc.string({ minLength: 0, maxLength: 50 })
          }),
          { minLength: 1, maxLength: 5 }
        ),
        (artifacts) => {
          // Очищаем кэш артефактов перед каждой итерацией
          engine.clearArtifactCache();
          
          // Создаем уникальные переменные
          const uniqueArtifacts = new Map<string, { filePath: string; content: string }>();
          for (const artifact of artifacts) {
            if (!uniqueArtifacts.has(artifact.varName)) {
              uniqueArtifacts.set(artifact.varName, {
                filePath: artifact.filePath,
                content: artifact.content
              });
            }
          }
          
          // Создаем шаблон с вложенными переменными
          const template = Array.from(uniqueArtifacts.keys())
            .map(varName => `\${artifact:\${${varName}}}`)
            .join(' ');
          
          // Создаем контекст с переменными, содержащими пути к файлам
          const variables: Record<string, string> = {};
          for (const [varName, { filePath }] of uniqueArtifacts) {
            variables[varName] = filePath;
          }
          
          // Создаем функцию загрузки артефактов
          const artifactLoader = (path: string) => {
            for (const { filePath, content } of uniqueArtifacts.values()) {
              if (filePath === path) {
                return content;
              }
            }
            throw new Error(`Artifact not found: ${path}`);
          };
          
          const context = createTemplateContext(variables, artifactLoader);
          const result = engine.render(template, context);
          
          // Проверяем, что все содержимые присутствуют в результате
          for (const { content } of uniqueArtifacts.values()) {
            expect(result).toContain(content);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
