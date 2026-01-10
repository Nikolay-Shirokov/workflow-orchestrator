/**
 * Модуль экспорта и импорта конфигураций рабочих процессов
 * 
 * Отвечает за:
 * - Экспорт конфигурации процесса с метаданными
 * - Включение внешних файлов в экспорт
 * - Импорт процесса с валидацией совместимости
 * - Разрешение конфликтов при импорте
 */

import { readFile, writeFile, stat } from 'fs/promises';
import { dirname, resolve } from 'path';
import { stringify as stringifyYAML } from 'yaml';
import { WorkflowConfig } from './types.js';
import { WorkflowConfigParser } from './workflow-config-parser.js';

/**
 * Метаданные экспорта
 */
export interface ExportMetadata {
  /** Версия формата экспорта */
  exportVersion: string;
  
  /** Дата и время экспорта */
  exportedAt: string;
  
  /** Автор экспорта */
  exportedBy?: string;
  
  /** Описание экспорта */
  description?: string;
  
  /** Теги для категоризации */
  tags?: string[];
  
  /** Версия оркестратора */
  orchestratorVersion: string;
  
  /** Минимальная совместимая версия оркестратора */
  minOrchestratorVersion?: string;
  
  /** Дополнительные метаданные */
  custom?: Record<string, unknown>;
}

/**
 * Опции экспорта
 */
export interface ExportOptions {
  /** Включить содержимое внешних файлов (шаблоны промптов и т.д.) */
  includeExternalFiles?: boolean;
  
  /** Базовая директория для разрешения относительных путей */
  baseDir?: string;
  
  /** Формат экспорта */
  format?: 'yaml' | 'json';
  
  /** Красивое форматирование */
  pretty?: boolean;
  
  /** Метаданные экспорта */
  metadata?: Partial<ExportMetadata>;
}

/**
 * Результат экспорта
 */
export interface ExportResult {
  /** Экспортированная конфигурация */
  config: WorkflowConfig;
  
  /** Метаданные экспорта */
  metadata: ExportMetadata;
  
  /** Встроенные файлы (путь -> содержимое) */
  embeddedFiles?: Record<string, string>;
  
  /** Сериализованное содержимое */
  serialized: string;
}

/**
 * Опции импорта
 */
export interface ImportOptions {
  /** Базовая директория для сохранения извлеченных файлов */
  baseDir?: string;
  
  /** Валидировать совместимость версий */
  validateCompatibility?: boolean;
  
  /** Стратегия разрешения конфликтов */
  conflictResolution?: ConflictResolution;
  
  /** Перезаписать существующие файлы */
  overwriteFiles?: boolean;
}

/**
 * Стратегия разрешения конфликтов
 */
export type ConflictResolution = 
  | 'fail'        // Завершиться с ошибкой при конфликте
  | 'skip'        // Пропустить конфликтующие элементы
  | 'overwrite'   // Перезаписать существующие элементы
  | 'rename';     // Переименовать импортируемые элементы

/**
 * Результат импорта
 */
export interface ImportResult {
  /** Импортированная конфигурация */
  config: WorkflowConfig;
  
  /** Метаданные экспорта */
  metadata: ExportMetadata;
  
  /** Извлеченные файлы (путь -> новый путь) */
  extractedFiles?: Record<string, string>;
  
  /** Предупреждения о совместимости */
  compatibilityWarnings: string[];
  
  /** Разрешенные конфликты */
  resolvedConflicts: ConflictResolution[];
}

/**
 * Информация о конфликте
 */
export interface ConflictInfo {
  /** Тип конфликта */
  type: 'workflow_name' | 'file_exists' | 'version_mismatch';
  
  /** Описание конфликта */
  message: string;
  
  /** Существующее значение */
  existing?: unknown;
  
  /** Новое значение */
  incoming?: unknown;
}

/**
 * Менеджер экспорта/импорта рабочих процессов
 */
export class WorkflowExportImportManager {
  private parser: WorkflowConfigParser;
  private orchestratorVersion: string;
  
  constructor(orchestratorVersion: string = '1.0.0') {
    this.parser = new WorkflowConfigParser();
    this.orchestratorVersion = orchestratorVersion;
  }
  
  /**
   * Экспорт конфигурации рабочего процесса
   * @param config - Конфигурация для экспорта
   * @param options - Опции экспорта
   * @returns Promise<ExportResult>
   */
  async export(config: WorkflowConfig, options: ExportOptions = {}): Promise<ExportResult> {
    const {
      includeExternalFiles = false,
      baseDir = process.cwd(),
      format = 'yaml',
      pretty = true,
      metadata = {}
    } = options;
    
    // Создаем метаданные экспорта
    const exportMetadata: ExportMetadata = {
      exportVersion: '1.0',
      exportedAt: new Date().toISOString(),
      exportedBy: metadata.exportedBy,
      description: metadata.description || config.description,
      tags: metadata.tags,
      orchestratorVersion: this.orchestratorVersion,
      minOrchestratorVersion: metadata.minOrchestratorVersion || '1.0.0',
      custom: metadata.custom
    };
    
    // Клонируем конфигурацию для модификации
    const exportConfig = JSON.parse(JSON.stringify(config)) as WorkflowConfig;
    
    // Встраиваем внешние файлы если требуется
    let embeddedFiles: Record<string, string> | undefined;
    if (includeExternalFiles) {
      embeddedFiles = await this.embedExternalFiles(exportConfig, baseDir);
    }
    
    // Создаем объект экспорта
    const exportData = {
      metadata: exportMetadata,
      workflow: exportConfig,
      embeddedFiles
    };
    
    // Сериализуем в выбранный формат
    let serialized: string;
    if (format === 'yaml') {
      serialized = stringifyYAML(exportData, { indent: pretty ? 2 : 0 });
    } else {
      serialized = JSON.stringify(exportData, null, pretty ? 2 : 0);
    }
    
    return {
      config: exportConfig,
      metadata: exportMetadata,
      embeddedFiles,
      serialized
    };
  }
  
  /**
   * Встраивание содержимого внешних файлов в конфигурацию
   * @param config - Конфигурация
   * @param baseDir - Базовая директория
   * @returns Promise<Record<string, string>> - Карта путь -> содержимое
   */
  private async embedExternalFiles(
    config: WorkflowConfig,
    baseDir: string
  ): Promise<Record<string, string>> {
    const embeddedFiles: Record<string, string> = {};
    
    // Обрабатываем шаги
    for (const step of config.steps) {
      await this.embedStepFiles(step, baseDir, embeddedFiles);
    }
    
    return embeddedFiles;
  }
  
  /**
   * Встраивание файлов для шага
   * @param step - Шаг рабочего процесса
   * @param baseDir - Базовая директория
   * @param embeddedFiles - Карта встроенных файлов
   */
  private async embedStepFiles(
    step: any,
    baseDir: string,
    embeddedFiles: Record<string, string>
  ): Promise<void> {
    // Встраиваем шаблон промпта если это файл
    if (step.prompt_template && typeof step.prompt_template === 'string') {
      const templatePath = step.prompt_template;
      
      // Проверяем, является ли это путем к файлу (содержит расширение или путь)
      if (templatePath.includes('.') || templatePath.includes('/') || templatePath.includes('\\')) {
        try {
          const fullPath = resolve(baseDir, templatePath);
          const content = await readFile(fullPath, 'utf-8');
          embeddedFiles[templatePath] = content;
          
          // Помечаем, что это встроенный файл
          step._embedded_prompt_template = templatePath;
        } catch (error) {
          // Файл не найден, оставляем как есть
          console.warn(`Предупреждение: не удалось встроить файл ${templatePath}: ${(error as Error).message}`);
        }
      }
    }
    
    // Рекурсивно обрабатываем вложенные шаги
    if (step.steps && Array.isArray(step.steps)) {
      for (const subStep of step.steps) {
        await this.embedStepFiles(subStep, baseDir, embeddedFiles);
      }
    }
    
    // Обрабатываем условные шаги
    if (step.thenStep) {
      await this.embedStepFiles(step.thenStep, baseDir, embeddedFiles);
    }
    if (step.elseStep) {
      await this.embedStepFiles(step.elseStep, baseDir, embeddedFiles);
    }
    
    // Обрабатываем тело цикла
    if (step.loop_body) {
      await this.embedStepFiles(step.loop_body, baseDir, embeddedFiles);
    }
  }
  
  /**
   * Импорт конфигурации рабочего процесса
   * @param source - Путь к файлу или сериализованное содержимое
   * @param options - Опции импорта
   * @returns Promise<ImportResult>
   */
  async import(source: string, options: ImportOptions = {}): Promise<ImportResult> {
    const {
      baseDir = process.cwd(),
      validateCompatibility = true,
      conflictResolution = 'fail',
      overwriteFiles = false
    } = options;
    
    // Загружаем и парсим данные экспорта
    let exportData: any;
    
    // Проверяем, является ли source путем к файлу или содержимым
    try {
      const stats = await stat(source);
      if (stats.isFile()) {
        const content = await readFile(source, 'utf-8');
        exportData = this.parseExportData(content);
      } else {
        throw new Error('Source должен быть файлом или сериализованным содержимым');
      }
    } catch (error) {
      // Предполагаем, что это сериализованное содержимое
      exportData = this.parseExportData(source);
    }
    
    // Извлекаем компоненты
    const metadata: ExportMetadata = exportData.metadata;
    const config: WorkflowConfig = exportData.workflow;
    const embeddedFiles: Record<string, string> | undefined = exportData.embeddedFiles;
    
    // Валидируем совместимость
    const compatibilityWarnings: string[] = [];
    if (validateCompatibility) {
      const warnings = this.validateCompatibility(metadata);
      compatibilityWarnings.push(...warnings);
    }
    
    // Валидируем конфигурацию
    const validationResult = this.parser.validate(config);
    if (!validationResult.valid) {
      throw new Error(
        `Импортированная конфигурация невалидна:\n${validationResult.errors.map(e => `- ${e.message}`).join('\n')}`
      );
    }
    
    // Обнаруживаем конфликты
    const conflicts = await this.detectConflicts(config, baseDir);
    const resolvedConflicts: ConflictResolution[] = [];
    
    // Разрешаем конфликты
    if (conflicts.length > 0) {
      await this.resolveConflicts(conflicts, conflictResolution, resolvedConflicts);
    }
    
    // Извлекаем встроенные файлы
    let extractedFiles: Record<string, string> | undefined;
    if (embeddedFiles) {
      extractedFiles = await this.extractEmbeddedFiles(
        config,
        embeddedFiles,
        baseDir,
        overwriteFiles
      );
    }
    
    return {
      config,
      metadata,
      extractedFiles,
      compatibilityWarnings,
      resolvedConflicts
    };
  }
  
  /**
   * Парсинг данных экспорта
   * @param content - Содержимое экспорта
   * @returns any - Распарсенные данные
   */
  private parseExportData(content: string): any {
    // Пробуем JSON
    try {
      return JSON.parse(content);
    } catch {
      // Пробуем YAML
      try {
        const { parse } = require('yaml');
        return parse(content);
      } catch (error) {
        throw new Error(`Не удалось распарсить данные экспорта: ${(error as Error).message}`);
      }
    }
  }
  
  /**
   * Валидация совместимости версий
   * @param metadata - Метаданные экспорта
   * @returns string[] - Предупреждения о совместимости
   */
  private validateCompatibility(metadata: ExportMetadata): string[] {
    const warnings: string[] = [];
    
    // Проверяем версию формата экспорта
    if (metadata.exportVersion !== '1.0') {
      warnings.push(
        `Версия формата экспорта ${metadata.exportVersion} может быть несовместима с текущей версией (1.0)`
      );
    }
    
    // Проверяем минимальную требуемую версию оркестратора
    if (metadata.minOrchestratorVersion) {
      const minVersion = this.parseVersion(metadata.minOrchestratorVersion);
      const currentVersion = this.parseVersion(this.orchestratorVersion);
      
      if (this.compareVersions(currentVersion, minVersion) < 0) {
        warnings.push(
          `Импортируемый процесс требует минимальную версию оркестратора ${metadata.minOrchestratorVersion}, ` +
          `текущая версия: ${this.orchestratorVersion}`
        );
      }
    }
    
    return warnings;
  }
  
  /**
   * Парсинг версии в числовой формат
   * @param version - Строка версии (например, "1.2.3")
   * @returns number[] - Массив чисел [major, minor, patch]
   */
  private parseVersion(version: string): number[] {
    return version.split('.').map(v => parseInt(v, 10) || 0);
  }
  
  /**
   * Сравнение версий
   * @param v1 - Первая версия
   * @param v2 - Вторая версия
   * @returns number - -1 если v1 < v2, 0 если равны, 1 если v1 > v2
   */
  private compareVersions(v1: number[], v2: number[]): number {
    for (let i = 0; i < Math.max(v1.length, v2.length); i++) {
      const n1 = v1[i] || 0;
      const n2 = v2[i] || 0;
      
      if (n1 < n2) return -1;
      if (n1 > n2) return 1;
    }
    
    return 0;
  }
  
  /**
   * Обнаружение конфликтов при импорте
   * @param config - Импортируемая конфигурация
   * @param baseDir - Базовая директория
   * @returns Promise<ConflictInfo[]>
   */
  private async detectConflicts(
    config: WorkflowConfig,
    baseDir: string
  ): Promise<ConflictInfo[]> {
    const conflicts: ConflictInfo[] = [];
    
    // Проверяем существование файлов, которые будут извлечены
    for (const step of config.steps) {
      await this.detectStepFileConflicts(step, baseDir, conflicts);
    }
    
    return conflicts;
  }
  
  /**
   * Обнаружение конфликтов файлов для шага
   * @param step - Шаг
   * @param baseDir - Базовая директория
   * @param conflicts - Массив конфликтов
   */
  private async detectStepFileConflicts(
    step: any,
    baseDir: string,
    conflicts: ConflictInfo[]
  ): Promise<void> {
    // Проверяем встроенный шаблон промпта
    if (step._embedded_prompt_template) {
      const templatePath = resolve(baseDir, step._embedded_prompt_template);
      
      try {
        await stat(templatePath);
        conflicts.push({
          type: 'file_exists',
          message: `Файл уже существует: ${step._embedded_prompt_template}`,
          existing: templatePath
        });
      } catch {
        // Файл не существует, конфликта нет
      }
    }
    
    // Рекурсивно проверяем вложенные шаги
    if (step.steps && Array.isArray(step.steps)) {
      for (const subStep of step.steps) {
        await this.detectStepFileConflicts(subStep, baseDir, conflicts);
      }
    }
    
    if (step.thenStep) {
      await this.detectStepFileConflicts(step.thenStep, baseDir, conflicts);
    }
    if (step.elseStep) {
      await this.detectStepFileConflicts(step.elseStep, baseDir, conflicts);
    }
    if (step.loop_body) {
      await this.detectStepFileConflicts(step.loop_body, baseDir, conflicts);
    }
  }
  
  /**
   * Разрешение конфликтов
   * @param conflicts - Массив конфликтов
   * @param strategy - Стратегия разрешения
   * @param resolved - Массив разрешенных конфликтов
   */
  private async resolveConflicts(
    conflicts: ConflictInfo[],
    strategy: ConflictResolution,
    resolved: ConflictResolution[]
  ): Promise<void> {
    if (strategy === 'fail') {
      throw new Error(
        `Обнаружены конфликты при импорте:\n${conflicts.map(c => `- ${c.message}`).join('\n')}`
      );
    }
    
    // Для других стратегий просто записываем разрешение
    for (let i = 0; i < conflicts.length; i++) {
      resolved.push(strategy);
    }
  }
  
  /**
   * Извлечение встроенных файлов
   * @param config - Конфигурация
   * @param embeddedFiles - Встроенные файлы
   * @param baseDir - Базовая директория
   * @param overwrite - Перезаписывать существующие файлы
   * @returns Promise<Record<string, string>> - Карта старый путь -> новый путь
   */
  private async extractEmbeddedFiles(
    config: WorkflowConfig,
    embeddedFiles: Record<string, string>,
    baseDir: string,
    overwrite: boolean
  ): Promise<Record<string, string>> {
    const extractedFiles: Record<string, string> = {};
    
    // Извлекаем каждый файл
    for (const [relativePath, content] of Object.entries(embeddedFiles)) {
      const fullPath = resolve(baseDir, relativePath);
      
      // Проверяем существование
      let exists = false;
      try {
        await stat(fullPath);
        exists = true;
      } catch {
        // Файл не существует
      }
      
      // Пропускаем если файл существует и не разрешена перезапись
      if (exists && !overwrite) {
        console.warn(`Пропуск существующего файла: ${relativePath}`);
        extractedFiles[relativePath] = fullPath;
        continue;
      }
      
      // Создаем директорию если нужно
      const dir = dirname(fullPath);
      const { mkdir } = await import('fs/promises');
      await mkdir(dir, { recursive: true });
      
      // Записываем файл
      await writeFile(fullPath, content, 'utf-8');
      extractedFiles[relativePath] = fullPath;
      
      console.log(`Извлечен файл: ${relativePath} -> ${fullPath}`);
    }
    
    // Обновляем ссылки в конфигурации
    await this.updateFileReferences(config, extractedFiles);
    
    return extractedFiles;
  }
  
  /**
   * Обновление ссылок на файлы в конфигурации
   * @param config - Конфигурация
   * @param extractedFiles - Извлеченные файлы
   */
  private async updateFileReferences(
    config: WorkflowConfig,
    extractedFiles: Record<string, string>
  ): Promise<void> {
    for (const step of config.steps) {
      await this.updateStepFileReferences(step, extractedFiles);
    }
  }
  
  /**
   * Обновление ссылок на файлы для шага
   * @param step - Шаг
   * @param extractedFiles - Извлеченные файлы
   */
  private async updateStepFileReferences(
    step: any,
    extractedFiles: Record<string, string>
  ): Promise<void> {
    // Восстанавливаем ссылку на шаблон промпта
    if (step._embedded_prompt_template) {
      step.prompt_template = step._embedded_prompt_template;
      delete step._embedded_prompt_template;
    }
    
    // Рекурсивно обрабатываем вложенные шаги
    if (step.steps && Array.isArray(step.steps)) {
      for (const subStep of step.steps) {
        await this.updateStepFileReferences(subStep, extractedFiles);
      }
    }
    
    if (step.thenStep) {
      await this.updateStepFileReferences(step.thenStep, extractedFiles);
    }
    if (step.elseStep) {
      await this.updateStepFileReferences(step.elseStep, extractedFiles);
    }
    if (step.loop_body) {
      await this.updateStepFileReferences(step.loop_body, extractedFiles);
    }
  }
  
  /**
   * Сохранение экспорта в файл
   * @param exportResult - Результат экспорта
   * @param filePath - Путь к файлу
   */
  async saveExport(exportResult: ExportResult, filePath: string): Promise<void> {
    await writeFile(filePath, exportResult.serialized, 'utf-8');
  }
  
  /**
   * Загрузка экспорта из файла
   * @param filePath - Путь к файлу
   * @param options - Опции импорта
   * @returns Promise<ImportResult>
   */
  async loadExport(filePath: string, options: ImportOptions = {}): Promise<ImportResult> {
    return this.import(filePath, options);
  }
}

