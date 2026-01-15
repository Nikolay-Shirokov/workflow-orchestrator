import * as fc from 'fast-check';
import { DefaultTemplateEngine, createTemplateContext } from '../../src/core/template-engine.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe.skip('TemplateEngine Unit Tests', () => {
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
        // Проверяем, что это ошибка загрузки артефакта
        expect(error.code).toBe('ARTIFACT_LOAD_ERROR');
        expect(error.message).toContain('Не удалось загрузить артефакт');
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
  
  describe('Кэширование артефактов', () => {
    it('должен кэшировать артефакт при повторной загрузке', () => {
      // Создаем тестовый файл
      const testFilePath = path.join(tempDir, 'cached-artifact.txt');
      const testContent = 'Содержимое для кэширования';
      fs.writeFileSync(testFilePath, testContent, 'utf-8');
      
      let loadCount = 0;
      const artifactLoader = (filePath: string) => {
        loadCount++;
        return fs.readFileSync(filePath, 'utf-8');
      };
      
      // Очищаем счетчики и кэш
      engine.resetReadCounters();
      engine.clearArtifactCache();
      
      const template = '${artifact:${file_path}} ${artifact:${file_path}}';
      const context = createTemplateContext(
        { file_path: testFilePath },
        artifactLoader
      );
      
      const result = engine.render(template, context);
      
      // Проверяем, что содержимое загружено дважды в результат
      expect(result).toBe(`${testContent} ${testContent}`);
      
      // Проверяем, что файл был прочитан только один раз (второй раз из кэша)
      expect(loadCount).toBe(1);
      
      // Проверяем счетчики
      const counters = engine.getReadCounters();
      expect(counters.fileReads).toBe(1); // Один раз из файла
      expect(counters.cacheHits).toBe(1); // Один раз из кэша
      expect(counters.cacheMisses).toBe(1); // Один промах (первая загрузка)
    });
    
    it('должен истекать кэш после TTL', async () => {
      // Создаем тестовый файл
      const testFilePath = path.join(tempDir, 'expiring-artifact.txt');
      fs.writeFileSync(testFilePath, 'Исходное содержимое', 'utf-8');
      
      let loadCount = 0;
      const artifactLoader = (filePath: string) => {
        loadCount++;
        return fs.readFileSync(filePath, 'utf-8');
      };
      
      // Очищаем счетчики и кэш
      engine.resetReadCounters();
      engine.clearArtifactCache();
      
      const template = '${artifact:${file_path}}';
      const context = createTemplateContext(
        { file_path: testFilePath },
        artifactLoader
      );
      
      // Первая загрузка
      const result1 = engine.render(template, context);
      expect(result1).toBe('Исходное содержимое');
      expect(loadCount).toBe(1);
      
      // Вторая загрузка сразу (должна быть из кэша)
      const result2 = engine.render(template, context);
      expect(result2).toBe('Исходное содержимое');
      expect(loadCount).toBe(1); // Не увеличилось
      
      // Проверяем счетчики после кэширования
      let counters = engine.getReadCounters();
      expect(counters.cacheHits).toBe(1);
      expect(counters.cacheMisses).toBe(1);
      expect(counters.fileReads).toBe(1);
      
      // Изменяем файл
      fs.writeFileSync(testFilePath, 'Обновленное содержимое', 'utf-8');
      
      // Третья загрузка сразу (все еще из кэша, файл не перечитывается)
      const result3 = engine.render(template, context);
      expect(result3).toBe('Исходное содержимое'); // Старое содержимое из кэша
      expect(loadCount).toBe(1);
      
      // Очищаем кэш вручную (имитируем истечение TTL)
      engine.clearArtifactCache();
      
      // Четвертая загрузка после очистки кэша
      const result4 = engine.render(template, context);
      expect(result4).toBe('Обновленное содержимое'); // Новое содержимое
      expect(loadCount).toBe(2); // Увеличилось
      
      // Проверяем финальные счетчики
      counters = engine.getReadCounters();
      expect(counters.fileReads).toBe(2); // Два чтения из файла
      expect(counters.cacheHits).toBe(2); // Два попадания в кэш
      expect(counters.cacheMisses).toBe(2); // Два промаха
    });
    
    it('должен корректно отслеживать счетчики операций чтения', () => {
      // Создаем несколько тестовых файлов
      const file1 = path.join(tempDir, 'file1.txt');
      const file2 = path.join(tempDir, 'file2.txt');
      const file3 = path.join(tempDir, 'file3.txt');
      
      fs.writeFileSync(file1, 'Содержимое 1', 'utf-8');
      fs.writeFileSync(file2, 'Содержимое 2', 'utf-8');
      fs.writeFileSync(file3, 'Содержимое 3', 'utf-8');
      
      const artifactLoader = (filePath: string) => {
        return fs.readFileSync(filePath, 'utf-8');
      };
      
      // Очищаем счетчики и кэш
      engine.resetReadCounters();
      engine.clearArtifactCache();
      
      // Загружаем file1 дважды, file2 трижды, file3 один раз
      const template = '${artifact:${f1}} ${artifact:${f1}} ${artifact:${f2}} ${artifact:${f2}} ${artifact:${f2}} ${artifact:${f3}}';
      const context = createTemplateContext(
        { f1: file1, f2: file2, f3: file3 },
        artifactLoader
      );
      
      engine.render(template, context);
      
      const counters = engine.getReadCounters();
      
      // Должно быть 3 чтения из файлов (по одному для каждого уникального файла)
      expect(counters.fileReads).toBe(3);
      
      // Должно быть 3 промаха кэша (первая загрузка каждого файла)
      expect(counters.cacheMisses).toBe(3);
      
      // Должно быть 3 попадания в кэш (file1: 1, file2: 2, file3: 0)
      expect(counters.cacheHits).toBe(3);
      
      // Сбрасываем счетчики
      engine.resetReadCounters();
      const resetCounters = engine.getReadCounters();
      expect(resetCounters.fileReads).toBe(0);
      expect(resetCounters.cacheHits).toBe(0);
      expect(resetCounters.cacheMisses).toBe(0);
    });
  });
  
  describe('Обработка ошибок', () => {
    it('должен выбрасывать ошибку UNDEFINED_VARIABLE с контекстом', () => {
      const template = '${undefined_variable}';
      const context = createTemplateContext(
        { 
          available_var1: 'value1',
          available_var2: 'value2',
          available_var3: 'value3'
        },
        () => ''
      );
      
      expect(() => engine.render(template, context)).toThrow();
      
      try {
        engine.render(template, context);
        fail('Должна была быть выброшена ошибка');
      } catch (error: any) {
        // Проверяем код ошибки
        expect(error.code).toBe('UNDEFINED_VARIABLE');
        
        // Проверяем сообщение об ошибке
        expect(error.message).toContain('Переменная не определена');
        expect(error.message).toContain('undefined_variable');
        
        // Проверяем контекст ошибки
        expect(error.context).toBeDefined();
        expect(error.context.variable).toBe('undefined_variable');
        expect(error.context.availableVariables).toEqual(['available_var1', 'available_var2', 'available_var3']);
        
        // Проверяем категорию и серьезность
        expect(error.category).toBe('execution');
        expect(error.severity).toBe('error');
        
        // Проверяем наличие предложений
        expect(error.suggestions).toBeDefined();
        expect(error.suggestions.length).toBeGreaterThan(0);
        expect(error.suggestions.some((s: string) => s.includes('undefined_variable'))).toBe(true);
        expect(error.suggestions.some((s: string) => s.includes('available_var1'))).toBe(true);
      }
    });
    
    it('должен выбрасывать ошибку ARTIFACT_NOT_FOUND с контекстом', () => {
      const nonexistentPath = path.join(tempDir, 'nonexistent-artifact.txt');
      const template = '${artifact:${file_path}}';
      const context = createTemplateContext(
        { file_path: nonexistentPath },
        (filePath: string) => {
          const error: any = new Error(`ENOENT: no such file or directory, open '${filePath}'`);
          error.code = 'ENOENT';
          throw error;
        }
      );
      
      expect(() => engine.render(template, context)).toThrow();
      
      try {
        engine.render(template, context);
        fail('Должна была быть выброшена ошибка');
      } catch (error: any) {
        // Проверяем код ошибки
        expect(error.code).toBe('ARTIFACT_LOAD_ERROR');
        
        // Проверяем сообщение об ошибке
        expect(error.message).toContain('Не удалось загрузить артефакт');
        expect(error.message).toContain(nonexistentPath);
        
        // Проверяем контекст ошибки
        expect(error.context).toBeDefined();
        expect(error.context.path).toBe(nonexistentPath);
        
        // Проверяем категорию и серьезность
        expect(error.category).toBe('execution');
        expect(error.severity).toBe('error');
        
        // Проверяем наличие предложений
        expect(error.suggestions).toBeDefined();
        expect(error.suggestions.length).toBeGreaterThan(0);
        expect(error.suggestions.some((s: string) => s.includes('артефакт существует'))).toBe(true);
      }
    });
    
    it('должен выбрасывать ошибку ARTIFACT_READ_ERROR при ошибке чтения', () => {
      const testFilePath = path.join(tempDir, 'unreadable-file.txt');
      const template = '${artifact:${file_path}}';
      const context = createTemplateContext(
        { file_path: testFilePath },
        (filePath: string) => {
          const error: any = new Error(`EACCES: permission denied, open '${filePath}'`);
          error.code = 'EACCES';
          throw error;
        }
      );
      
      expect(() => engine.render(template, context)).toThrow();
      
      try {
        engine.render(template, context);
        fail('Должна была быть выброшена ошибка');
      } catch (error: any) {
        // Проверяем код ошибки
        expect(error.code).toBe('ARTIFACT_LOAD_ERROR');
        
        // Проверяем сообщение об ошибке
        expect(error.message).toContain('Не удалось загрузить артефакт');
        expect(error.message).toContain(testFilePath);
        
        // Проверяем контекст ошибки
        expect(error.context).toBeDefined();
        expect(error.context.path).toBe(testFilePath);
        expect(error.context.error).toBeDefined();
        
        // Проверяем категорию и серьезность
        expect(error.category).toBe('execution');
        expect(error.severity).toBe('error');
        
        // Проверяем наличие предложений
        expect(error.suggestions).toBeDefined();
        expect(error.suggestions.length).toBeGreaterThan(0);
      }
    });
    
    it('должен выбрасывать ошибку MAX_ITERATIONS_EXCEEDED при циклических зависимостях', () => {
      // Создаем шаблон с циклической зависимостью
      // var1 -> var2 -> var3 -> var1 (цикл)
      const template = '${var1}';
      const context = createTemplateContext(
        {
          var1: '${var2}',
          var2: '${var3}',
          var3: '${var1}'
        },
        () => ''
      );
      
      expect(() => engine.render(template, context)).toThrow();
      
      try {
        engine.render(template, context);
        fail('Должна была быть выброшена ошибка');
      } catch (error: any) {
        // Проверяем код ошибки
        expect(error.code).toBe('MAX_TEMPLATE_ITERATIONS');
        
        // Проверяем сообщение об ошибке
        expect(error.message).toContain('Превышено максимальное количество итераций');
        expect(error.message).toContain('циклическая зависимость');
        
        // Проверяем контекст ошибки
        expect(error.context).toBeDefined();
        expect(error.context.maxIterations).toBe(10);
        expect(error.context.unresolvedVariables).toBeDefined();
        expect(error.context.unresolvedVariables.length).toBeGreaterThan(0);
        
        // Проверяем категорию и серьезность
        expect(error.category).toBe('execution');
        expect(error.severity).toBe('error');
        
        // Проверяем наличие предложений
        expect(error.suggestions).toBeDefined();
        expect(error.suggestions.length).toBeGreaterThan(0);
        expect(error.suggestions.some((s: string) => s.includes('циклические зависимости'))).toBe(true);
      }
    });
    
    it('должен предоставлять полезные предложения для UNDEFINED_VARIABLE', () => {
      const template = '${user_nme}'; // Опечатка в имени переменной
      const context = createTemplateContext(
        { 
          user_name: 'John',
          user_email: 'john@example.com',
          user_id: '123'
        },
        () => ''
      );
      
      try {
        engine.render(template, context);
        fail('Должна была быть выброшена ошибка');
      } catch (error: any) {
        expect(error.code).toBe('UNDEFINED_VARIABLE');
        
        // Проверяем, что предложения содержат список доступных переменных
        const suggestionsText = error.suggestions.join(' ');
        expect(suggestionsText).toContain('user_name');
        expect(suggestionsText).toContain('user_email');
        expect(suggestionsText).toContain('user_id');
        
        // Проверяем, что есть предложение проверить опечатки
        expect(error.suggestions.some((s: string) => 
          s.toLowerCase().includes('опечатк') || s.toLowerCase().includes('имени переменной')
        )).toBe(true);
        
        // Проверяем, что есть предложение похожей переменной (user_name похожа на user_nme)
        expect(error.suggestions.some((s: string) => 
          s.includes('user_name') && s.toLowerCase().includes('имели в виду')
        )).toBe(true);
      }
    });
    
    it('должен предоставлять полезные предложения для ARTIFACT_LOAD_ERROR', () => {
      const missingPath = path.join(tempDir, 'missing-artifact.txt');
      const template = '${artifact:${file_path}}';
      const context = createTemplateContext(
        { file_path: missingPath },
        (filePath: string) => {
          const error: any = new Error(`File not found: ${filePath}`);
          error.code = 'ENOENT';
          throw error;
        }
      );
      
      try {
        engine.render(template, context);
        fail('Должна была быть выброшена ошибка');
      } catch (error: any) {
        expect(error.code).toBe('ARTIFACT_LOAD_ERROR');
        
        // Проверяем, что предложения содержат полезные советы
        const suggestionsText = error.suggestions.join(' ').toLowerCase();
        expect(suggestionsText).toContain('артефакт');
        expect(
          suggestionsText.includes('существует') || suggestionsText.includes('путь')
        ).toBe(true);
        
        // Проверяем, что есть предложение проверить предыдущий шаг
        expect(error.suggestions.some((s: string) => 
          s.toLowerCase().includes('предыдущий шаг') || s.toLowerCase().includes('создал')
        )).toBe(true);
      }
    });
    
    it('должен корректно обрабатывать вложенные ошибки', () => {
      // Создаем шаблон с вложенной переменной, которая не определена
      const template = '${artifact:${undefined_path_var}}';
      const context = createTemplateContext(
        { some_other_var: 'value' },
        () => ''
      );
      
      try {
        engine.render(template, context);
        fail('Должна была быть выброшена ошибка');
      } catch (error: any) {
        // Должна быть ошибка UNDEFINED_VARIABLE для внутренней переменной
        expect(error.code).toBe('UNDEFINED_VARIABLE');
        expect(error.context.variable).toBe('undefined_path_var');
        expect(error.context.availableVariables).toContain('some_other_var');
      }
    });
    
    it('должен предоставлять recoverable флаг для разных типов ошибок', () => {
      // UNDEFINED_VARIABLE - не восстанавливаемая
      try {
        const template = '${undefined_var}';
        const context = createTemplateContext({}, () => '');
        engine.render(template, context);
        fail('Должна была быть выброшена ошибка');
      } catch (error: any) {
        expect(error.recoverable).toBe(false);
      }
      
      // ARTIFACT_LOAD_ERROR - не восстанавливаемая
      try {
        const template = '${artifact:missing.txt}';
        const context = createTemplateContext(
          {},
          () => {
            const error: any = new Error('File not found');
            error.code = 'ENOENT';
            throw error;
          }
        );
        engine.render(template, context);
        fail('Должна была быть выброшена ошибка');
      } catch (error: any) {
        expect(error.recoverable).toBe(false);
      }
      
      // MAX_TEMPLATE_ITERATIONS - не восстанавливаемая
      try {
        const template = '${var1}';
        const context = createTemplateContext(
          { var1: '${var2}', var2: '${var1}' },
          () => ''
        );
        engine.render(template, context);
        fail('Должна была быть выброшена ошибка');
      } catch (error: any) {
        expect(error.recoverable).toBe(false);
      }
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
              .filter(s => !s.includes('{') && !s.includes('}') && !s.includes('$') && !s.includes(':') && s.trim().length > 0),
            content: fc.string({ minLength: 0, maxLength: 100 })
              .filter(s => !s.includes('{') && !s.includes('}') && !s.includes('$'))
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
          .filter(s => !s.includes('{') && !s.includes('}') && !s.includes('$') && !s.includes(':') && /\S/.test(s)),
        fc.string({ minLength: 1, maxLength: 20 })
          .filter(s => !s.includes('{') && !s.includes('}') && !s.includes('$') && !s.includes(':') && /\S/.test(s)),
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

  /**
   * Feature: fix-context-passing, Property 3: Кэширование артефактов
   * 
   * Свойство: Для любого артефакта, загруженного из файла, повторная загрузка 
   * в течение времени жизни кэша должна вернуть закэшированное содержимое без 
   * повторного чтения файла.
   * 
   * Validates: Requirements 3.2, 3.3
   */
  it('Property 3: Кэширование артефактов', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            path: fc.string({ minLength: 1, maxLength: 20 })
              .filter(s => !s.includes('${') && !s.includes('}') && !s.includes('{') && !s.includes(':') && s.trim().length > 0),
            content: fc.string({ minLength: 0, maxLength: 50 }),
            repeatCount: fc.integer({ min: 1, max: 5 })
          }),
          { minLength: 1, maxLength: 5 }
        ),
        (artifacts) => {
          // Очищаем кэш и счетчики перед каждой итерацией
          engine.clearArtifactCache();
          engine.resetReadCounters();
          
          // Создаем уникальные артефакты
          const uniqueArtifacts = new Map<string, { content: string; repeatCount: number }>();
          for (const artifact of artifacts) {
            const trimmedPath = artifact.path.trim();
            if (!uniqueArtifacts.has(trimmedPath)) {
              uniqueArtifacts.set(trimmedPath, {
                content: artifact.content,
                repeatCount: artifact.repeatCount
              });
            }
          }
          
          // Счетчик вызовов загрузчика для каждого пути
          const loadCounts = new Map<string, number>();
          
          // Создаем функцию загрузки артефактов
          const artifactLoader = (path: string) => {
            loadCounts.set(path, (loadCounts.get(path) || 0) + 1);
            const artifact = uniqueArtifacts.get(path);
            if (!artifact) {
              throw new Error(`Artifact not found: ${path}`);
            }
            return artifact.content;
          };
          
          const context = createTemplateContext({}, artifactLoader);
          
          // Загружаем каждый артефакт несколько раз
          for (const [path, { content, repeatCount }] of uniqueArtifacts) {
            for (let i = 0; i < repeatCount; i++) {
              const template = `\${artifact:${path}}`;
              const result = engine.render(template, context);
              
              // Проверяем, что содержимое корректно
              expect(result).toBe(content);
            }
            
            // Проверяем, что файл был загружен только один раз (остальные из кэша)
            expect(loadCounts.get(path)).toBe(1);
          }
          
          // Проверяем счетчики
          const counters = engine.getReadCounters();
          
          // Количество чтений из файла должно равняться количеству уникальных артефактов
          expect(counters.fileReads).toBe(uniqueArtifacts.size);
          
          // Количество промахов кэша должно равняться количеству уникальных артефактов
          expect(counters.cacheMisses).toBe(uniqueArtifacts.size);
          
          // Количество попаданий в кэш = общее количество загрузок - количество промахов
          const totalLoads = Array.from(uniqueArtifacts.values())
            .reduce((sum, { repeatCount }) => sum + repeatCount, 0);
          expect(counters.cacheHits).toBe(totalLoads - uniqueArtifacts.size);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: fix-context-passing, Property 5: Обратная совместимость
   * 
   * Свойство: Для любого существующего шаблона, использующего синтаксис ${variable}, 
   * ${artifact:path}, или ${if:condition:then:else}, рендеринг должен работать 
   * без изменений после обновления системы.
   * 
   * Validates: Requirements 6.1, 6.2, 6.3, 6.4
   */
  it('Property 5: Обратная совместимость', () => {
    fc.assert(
      fc.property(
        // Генератор для простых переменных ${variable}
        fc.record({
          simpleVars: fc.dictionary(
            fc.string({ minLength: 1, maxLength: 10 })
              .filter(s => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s))
              .filter(s => !['__proto__', 'constructor', 'prototype'].includes(s)),
            fc.string({ minLength: 0, maxLength: 30 })
              .filter(s => !s.includes('${') && !s.includes('}')),
            { minKeys: 1, maxKeys: 5 }
          ),
          // Генератор для артефактов ${artifact:path}
          artifacts: fc.array(
            fc.record({
              path: fc.string({ minLength: 1, maxLength: 20 })
                .filter(s => !s.includes('${') && !s.includes('}') && !s.includes('{') && !s.includes('$') && !s.includes(':') && s.trim().length > 0),
              content: fc.string({ minLength: 0, maxLength: 30 })
                .filter(s => !s.includes('${') && !s.includes('}') && !s.includes('{') && !s.includes('$'))
            }),
            { minLength: 0, maxLength: 3 }
          ),
          // Генератор для условных блоков ${if:condition:then:else}
          conditionals: fc.array(
            fc.record({
              conditionVar: fc.string({ minLength: 1, maxLength: 10 })
                .filter(s => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s))
                .filter(s => !['__proto__', 'constructor', 'prototype'].includes(s)),
              conditionValue: fc.boolean(),
              thenText: fc.string({ minLength: 1, maxLength: 15 })
                .filter(s => !s.includes(':') && !s.includes('}') && !s.includes('{') && !s.includes('$') && s.trim().length > 0),
              elseText: fc.string({ minLength: 1, maxLength: 15 })
                .filter(s => !s.includes(':') && !s.includes('}') && !s.includes('{') && !s.includes('$') && s.trim().length > 0)
            }),
            { minLength: 0, maxLength: 3 }
          )
        }),
        (testData) => {
          // Очищаем кэш перед каждой итерацией
          engine.clearArtifactCache();
          
          const { simpleVars, artifacts, conditionals } = testData;
          
          // Пропускаем если нет данных для тестирования
          if (Object.keys(simpleVars).length === 0 && artifacts.length === 0 && conditionals.length === 0) {
            return;
          }
          
          // Создаем уникальные артефакты
          const uniqueArtifacts = new Map<string, string>();
          for (const artifact of artifacts) {
            const trimmedPath = artifact.path.trim();
            if (!uniqueArtifacts.has(trimmedPath)) {
              uniqueArtifacts.set(trimmedPath, artifact.content);
            }
          }
          
          // Создаем уникальные условные блоки
          const uniqueConditionals = new Map<string, { value: boolean; thenText: string; elseText: string; template: string }>();
          for (const cond of conditionals) {
            // Пропускаем если then и else одинаковые
            if (cond.thenText === cond.elseText) {
              continue;
            }
            
            // Пропускаем если переменная уже используется
            if (uniqueConditionals.has(cond.conditionVar)) {
              continue;
            }
            
            // Создаем уникальный шаблон для этого условного блока
            const template = `\${if:${cond.conditionVar}:${cond.thenText}:${cond.elseText}}`;
            
            uniqueConditionals.set(cond.conditionVar, {
              value: cond.conditionValue,
              thenText: cond.thenText,
              elseText: cond.elseText,
              template
            });
          }
          
          // Строим шаблон со старым синтаксисом
          const templateParts: string[] = [];
          const expectedResults: string[] = [];
          
          // Получаем список переменных, используемых в условных блоках
          const conditionalVars = new Set(uniqueConditionals.keys());
          
          // 1. Простые переменные: ${variable} (исключаем переменные из условных блоков)
          for (const [varName, value] of Object.entries(simpleVars)) {
            if (!conditionalVars.has(varName)) {
              templateParts.push(`\${${varName}}`);
              expectedResults.push(String(value));
            }
          }
          
          // 2. Прямые пути к артефактам: ${artifact:path}
          for (const [path, content] of uniqueArtifacts) {
            templateParts.push(`\${artifact:${path}}`);
            expectedResults.push(content);
          }
          
          // 3. Условные блоки: ${if:condition:then:else}
          for (const [, { value, thenText, elseText, template }] of uniqueConditionals) {
            templateParts.push(template);
            expectedResults.push(value ? thenText : elseText);
          }
          
          const template = templateParts.join(' ');
          const expectedResult = expectedResults.join(' ');
          
          // Создаем контекст с переменными
          const variables: Record<string, unknown> = { ...simpleVars };
          for (const [condVar, { value }] of uniqueConditionals) {
            variables[condVar] = value;
          }
          
          // Создаем функцию загрузки артефактов
          const artifactLoader = (path: string) => {
            const content = uniqueArtifacts.get(path);
            if (content === undefined) {
              throw new Error(`Artifact not found: ${path}`);
            }
            return content;
          };
          
          const context = createTemplateContext(variables, artifactLoader);
          
          // Рендерим шаблон
          const result = engine.render(template, context);
          
          // Проверяем, что результат совпадает с ожидаемым
          expect(result).toBe(expectedResult);
          
          // Проверяем, что в результате нет неразрешенных переменных
          expect(result).not.toMatch(/\$\{[^}]+\}/);
        }
      ),
      { numRuns: 100 }
    );
  });
});
