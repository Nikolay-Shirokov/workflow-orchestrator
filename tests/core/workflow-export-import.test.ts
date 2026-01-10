/**
 * Тесты для модуля экспорта/импорта конфигураций рабочих процессов
 * 
 * Проверяет:
 * - Экспорт конфигурации с метаданными
 * - Включение внешних файлов в экспорт
 * - Импорт с валидацией совместимости
 * - Разрешение конфликтов
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { WorkflowExportImportManager } from '../../src/core/workflow-export-import.js';
import { WorkflowConfig } from '../../src/core/types.js';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('WorkflowExportImportManager', () => {
  let manager: WorkflowExportImportManager;
  let testDir: string;
  
  beforeEach(async () => {
    manager = new WorkflowExportImportManager('1.0.0');
    
    // Создаём временную директорию для тестов
    testDir = join(tmpdir(), `workflow-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });
  
  afterEach(async () => {
    // Очищаем временную директорию
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Игнорируем ошибки очистки
    }
  });
  
  // ============================================================================
  // Тесты экспорта
  // ============================================================================
  
  describe('Экспорт конфигурации', () => {
    test('Экспорт базовой конфигурации в YAML', async () => {
      const config: WorkflowConfig = {
        name: 'test-workflow',
        version: '1.0.0',
        description: 'Тестовый процесс',
        settings: {
          artifacts_dir: 'artifacts'
        },
        steps: [
          {
            id: 'step1',
            name: 'Первый шаг',
            type: 'model',
            role: 'architect'
          }
        ]
      };
      
      const result = await manager.export(config, {
        format: 'yaml',
        metadata: {
          exportedBy: 'test-user',
          description: 'Тестовый экспорт'
        }
      });
      
      // Проверяем метаданные
      expect(result.metadata.exportVersion).toBe('1.0');
      expect(result.metadata.orchestratorVersion).toBe('1.0.0');
      expect(result.metadata.exportedBy).toBe('test-user');
      expect(result.metadata.description).toBe('Тестовый экспорт');
      expect(result.metadata.exportedAt).toBeDefined();
      
      // Проверяем конфигурацию
      expect(result.config.name).toBe('test-workflow');
      expect(result.config.version).toBe('1.0.0');
      expect(result.config.steps.length).toBe(1);
      
      // Проверяем сериализацию
      expect(result.serialized).toContain('test-workflow');
      expect(result.serialized).toContain('metadata:');
      expect(result.serialized).toContain('workflow:');
    });
    
    test('Экспорт конфигурации в JSON', async () => {
      const config: WorkflowConfig = {
        name: 'test-workflow',
        version: '1.0.0',
        settings: {
          artifacts_dir: 'artifacts'
        },
        steps: [
          {
            id: 'step1',
            name: 'Первый шаг',
            type: 'script',
            script: 'echo "test"'
          }
        ]
      };
      
      const result = await manager.export(config, {
        format: 'json',
        pretty: true
      });
      
      // Проверяем, что это валидный JSON
      const parsed = JSON.parse(result.serialized);
      expect(parsed.metadata).toBeDefined();
      expect(parsed.workflow).toBeDefined();
      expect(parsed.workflow.name).toBe('test-workflow');
    });
    
    test('Экспорт с включением внешних файлов', async () => {
      // Создаём тестовый файл шаблона
      const templatePath = join(testDir, 'prompt.txt');
      const templateContent = 'Это тестовый шаблон промпта';
      await writeFile(templatePath, templateContent, 'utf-8');
      
      const config: WorkflowConfig = {
        name: 'test-workflow',
        version: '1.0.0',
        settings: {
          artifacts_dir: 'artifacts'
        },
        steps: [
          {
            id: 'step1',
            name: 'Первый шаг',
            type: 'model',
            prompt_template: 'prompt.txt'
          }
        ]
      };
      
      const result = await manager.export(config, {
        includeExternalFiles: true,
        baseDir: testDir
      });
      
      // Проверяем, что файл был встроен
      expect(result.embeddedFiles).toBeDefined();
      expect(result.embeddedFiles!['prompt.txt']).toBe(templateContent);
    });
    
    test('Сохранение экспорта в файл', async () => {
      const config: WorkflowConfig = {
        name: 'test-workflow',
        version: '1.0.0',
        settings: {
          artifacts_dir: 'artifacts'
        },
        steps: [
          {
            id: 'step1',
            name: 'Первый шаг',
            type: 'model'
          }
        ]
      };
      
      const result = await manager.export(config);
      const exportPath = join(testDir, 'export.yaml');
      
      await manager.saveExport(result, exportPath);
      
      // Проверяем, что файл создан
      const { readFile } = await import('fs/promises');
      const content = await readFile(exportPath, 'utf-8');
      expect(content).toContain('test-workflow');
      expect(content).toContain('metadata:');
    });
  });
  
  // ============================================================================
  // Тесты импорта
  // ============================================================================
  
  describe('Импорт конфигурации', () => {
    test('Импорт базовой конфигурации', async () => {
      // Создаём экспорт
      const config: WorkflowConfig = {
        name: 'test-workflow',
        version: '1.0.0',
        description: 'Тестовый процесс',
        settings: {
          artifacts_dir: 'artifacts'
        },
        steps: [
          {
            id: 'step1',
            name: 'Первый шаг',
            type: 'model'
          }
        ]
      };
      
      const exportResult = await manager.export(config, {
        metadata: {
          exportedBy: 'test-user'
        }
      });
      
      // Импортируем
      const importResult = await manager.import(exportResult.serialized, {
        baseDir: testDir
      });
      
      // Проверяем импортированную конфигурацию
      expect(importResult.config.name).toBe('test-workflow');
      expect(importResult.config.version).toBe('1.0.0');
      expect(importResult.config.steps.length).toBe(1);
      
      // Проверяем метаданные
      expect(importResult.metadata.exportedBy).toBe('test-user');
      expect(importResult.metadata.orchestratorVersion).toBe('1.0.0');
    });
    
    test('Импорт с извлечением встроенных файлов', async () => {
      // Создаём тестовый файл шаблона
      const templatePath = join(testDir, 'source', 'prompt.txt');
      await mkdir(join(testDir, 'source'), { recursive: true });
      const templateContent = 'Это тестовый шаблон промпта';
      await writeFile(templatePath, templateContent, 'utf-8');
      
      const config: WorkflowConfig = {
        name: 'test-workflow',
        version: '1.0.0',
        settings: {
          artifacts_dir: 'artifacts'
        },
        steps: [
          {
            id: 'step1',
            name: 'Первый шаг',
            type: 'model',
            prompt_template: 'prompt.txt'
          }
        ]
      };
      
      // Экспортируем с включением файлов
      const exportResult = await manager.export(config, {
        includeExternalFiles: true,
        baseDir: join(testDir, 'source')
      });
      
      // Импортируем в другую директорию
      const targetDir = join(testDir, 'target');
      await mkdir(targetDir, { recursive: true });
      
      const importResult = await manager.import(exportResult.serialized, {
        baseDir: targetDir,
        overwriteFiles: true
      });
      
      // Проверяем, что файл был извлечен
      expect(importResult.extractedFiles).toBeDefined();
      expect(importResult.extractedFiles!['prompt.txt']).toBeDefined();
      
      // Проверяем содержимое извлеченного файла
      const { readFile } = await import('fs/promises');
      const extractedContent = await readFile(
        importResult.extractedFiles!['prompt.txt'],
        'utf-8'
      );
      expect(extractedContent).toBe(templateContent);
    });
    
    test('Валидация совместимости версий', async () => {
      const config: WorkflowConfig = {
        name: 'test-workflow',
        version: '1.0.0',
        settings: {
          artifacts_dir: 'artifacts'
        },
        steps: [
          {
            id: 'step1',
            name: 'Первый шаг',
            type: 'model'
          }
        ]
      };
      
      // Экспортируем с требованием более новой версии
      const exportResult = await manager.export(config, {
        metadata: {
          minOrchestratorVersion: '2.0.0'
        }
      });
      
      // Импортируем с валидацией
      const importResult = await manager.import(exportResult.serialized, {
        baseDir: testDir,
        validateCompatibility: true
      });
      
      // Проверяем, что есть предупреждение о совместимости
      expect(importResult.compatibilityWarnings.length).toBeGreaterThan(0);
      expect(importResult.compatibilityWarnings[0]).toContain('2.0.0');
    });
    
    test('Обнаружение конфликтов файлов', async () => {
      // Создаём существующий файл
      const existingFile = join(testDir, 'prompt.txt');
      await writeFile(existingFile, 'Существующее содержимое', 'utf-8');
      
      // Создаём экспорт с тем же файлом
      const sourceDir = join(testDir, 'source');
      await mkdir(sourceDir, { recursive: true });
      const sourceFile = join(sourceDir, 'prompt.txt');
      await writeFile(sourceFile, 'Новое содержимое', 'utf-8');
      
      const config: WorkflowConfig = {
        name: 'test-workflow',
        version: '1.0.0',
        settings: {
          artifacts_dir: 'artifacts'
        },
        steps: [
          {
            id: 'step1',
            name: 'Первый шаг',
            type: 'model',
            prompt_template: 'prompt.txt'
          }
        ]
      };
      
      const exportResult = await manager.export(config, {
        includeExternalFiles: true,
        baseDir: sourceDir
      });
      
      // Пытаемся импортировать с конфликтом (fail стратегия)
      await expect(
        manager.import(exportResult.serialized, {
          baseDir: testDir,
          conflictResolution: 'fail',
          overwriteFiles: false
        })
      ).rejects.toThrow('конфликты');
    });
    
    test('Разрешение конфликтов через overwrite', async () => {
      // Создаём существующий файл
      const existingFile = join(testDir, 'prompt.txt');
      await writeFile(existingFile, 'Существующее содержимое', 'utf-8');
      
      // Создаём экспорт с тем же файлом
      const sourceDir = join(testDir, 'source');
      await mkdir(sourceDir, { recursive: true });
      const sourceFile = join(sourceDir, 'prompt.txt');
      const newContent = 'Новое содержимое';
      await writeFile(sourceFile, newContent, 'utf-8');
      
      const config: WorkflowConfig = {
        name: 'test-workflow',
        version: '1.0.0',
        settings: {
          artifacts_dir: 'artifacts'
        },
        steps: [
          {
            id: 'step1',
            name: 'Первый шаг',
            type: 'model',
            prompt_template: 'prompt.txt'
          }
        ]
      };
      
      const exportResult = await manager.export(config, {
        includeExternalFiles: true,
        baseDir: sourceDir
      });
      
      // Импортируем с перезаписью
      const importResult = await manager.import(exportResult.serialized, {
        baseDir: testDir,
        conflictResolution: 'overwrite',
        overwriteFiles: true
      });
      
      // Проверяем, что файл был перезаписан
      const { readFile } = await import('fs/promises');
      const content = await readFile(existingFile, 'utf-8');
      expect(content).toBe(newContent);
      
      // Проверяем, что конфликт был разрешен
      expect(importResult.resolvedConflicts.length).toBeGreaterThan(0);
    });
    
    test('Загрузка экспорта из файла', async () => {
      const config: WorkflowConfig = {
        name: 'test-workflow',
        version: '1.0.0',
        settings: {
          artifacts_dir: 'artifacts'
        },
        steps: [
          {
            id: 'step1',
            name: 'Первый шаг',
            type: 'model'
          }
        ]
      };
      
      // Создаём и сохраняем экспорт
      const exportResult = await manager.export(config);
      const exportPath = join(testDir, 'export.yaml');
      await manager.saveExport(exportResult, exportPath);
      
      // Загружаем из файла
      const importResult = await manager.loadExport(exportPath, {
        baseDir: testDir
      });
      
      // Проверяем импортированную конфигурацию
      expect(importResult.config.name).toBe('test-workflow');
      expect(importResult.config.version).toBe('1.0.0');
    });
  });
  
  // ============================================================================
  // Интеграционные тесты
  // ============================================================================
  
  describe('Интеграционные тесты экспорта/импорта', () => {
    test('Полный цикл экспорта и импорта с файлами', async () => {
      // Создаём исходную структуру
      const sourceDir = join(testDir, 'source');
      await mkdir(join(sourceDir, 'prompts'), { recursive: true });
      
      const promptPath = join(sourceDir, 'prompts', 'architect.txt');
      const promptContent = 'Вы - архитектор системы. Проанализируйте требования.';
      await writeFile(promptPath, promptContent, 'utf-8');
      
      const config: WorkflowConfig = {
        name: 'dual-design',
        version: '1.0.0',
        description: 'Процесс совместной разработки',
        author: 'Test Author',
        settings: {
          artifacts_dir: 'artifacts/session_{timestamp}',
          default_adapter: 'claude-cli',
          parallel_execution: true
        },
        roles: {
          architect: {
            adapter: 'claude-cli',
            model: 'claude-sonnet-3.5'
          }
        },
        steps: [
          {
            id: 'step1',
            name: 'Инициализация',
            type: 'script',
            script: 'mkdir -p artifacts'
          },
          {
            id: 'step2',
            name: 'Вопросы архитектора',
            type: 'model',
            role: 'architect',
            prompt_template: 'prompts/architect.txt',
            depends_on: ['step1']
          }
        ]
      };
      
      // Экспортируем
      const exportResult = await manager.export(config, {
        includeExternalFiles: true,
        baseDir: sourceDir,
        format: 'yaml',
        metadata: {
          exportedBy: 'test-user',
          description: 'Тестовый экспорт процесса dual-design',
          tags: ['test', 'dual-design']
        }
      });
      
      // Сохраняем экспорт
      const exportPath = join(testDir, 'dual-design-export.yaml');
      await manager.saveExport(exportResult, exportPath);
      
      // Импортируем в новую директорию
      const targetDir = join(testDir, 'target');
      await mkdir(targetDir, { recursive: true });
      
      const importResult = await manager.loadExport(exportPath, {
        baseDir: targetDir,
        overwriteFiles: true
      });
      
      // Проверяем результат
      expect(importResult.config.name).toBe('dual-design');
      expect(importResult.config.version).toBe('1.0.0');
      expect(importResult.config.steps.length).toBe(2);
      expect(importResult.config.roles).toBeDefined();
      expect(importResult.config.roles!['architect']).toBeDefined();
      
      // Проверяем метаданные
      expect(importResult.metadata.exportedBy).toBe('test-user');
      expect(importResult.metadata.tags).toContain('dual-design');
      
      // Проверяем извлеченные файлы
      expect(importResult.extractedFiles).toBeDefined();
      expect(importResult.extractedFiles!['prompts/architect.txt']).toBeDefined();
      
      // Проверяем содержимое извлеченного файла
      const { readFile } = await import('fs/promises');
      const extractedPrompt = await readFile(
        importResult.extractedFiles!['prompts/architect.txt'],
        'utf-8'
      );
      expect(extractedPrompt).toBe(promptContent);
      
      // Проверяем, что ссылка в конфигурации обновлена
      const step2 = importResult.config.steps.find(s => s.id === 'step2');
      expect(step2?.prompt_template).toBe('prompts/architect.txt');
    });
  });
});
