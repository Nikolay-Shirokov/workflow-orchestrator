/**
 * Менеджер артефактов рабочего процесса
 * 
 * Отвечает за:
 * - Сохранение результатов шагов в файлы артефактов
 * - Организацию структуры директорий по сессиям
 * - Добавление метаданных к артефактам
 * - Валидацию существования артефактов
 * - Поддержку множественных артефактов на шаг
 * - Потоковую передачу больших артефактов
 */

import * as fs from 'fs/promises';
import { createReadStream, createWriteStream } from 'fs';
import * as path from 'path';
import { pipeline } from 'stream/promises';
import { ArtifactInfo, ArtifactManager, Logger, WorkflowErrorClass } from './types.js';

/**
 * Метаданные артефакта
 */
export interface ArtifactMetadata {
  /** Имя артефакта */
  name: string;
  
  /** ID шага, создавшего артефакт */
  stepId: string;
  
  /** Имя шага */
  stepName?: string;
  
  /** Время создания (ISO 8601) */
  createdAt: string;
  
  /** Размер в байтах */
  size: number;
  
  /** Версия рабочего процесса */
  workflowVersion?: string;
  
  /** Дополнительные метаданные */
  custom?: Record<string, unknown>;
}

/**
 * Конфигурация менеджера артефактов
 */
export interface ArtifactManagerConfig {
  /** Базовая директория для артефактов */
  baseDir: string;
  
  /** Шаблон для директории сессии (поддерживает {sessionId}, {timestamp}) */
  sessionDirTemplate?: string;
  
  /** Включить сохранение метаданных */
  saveMetadata?: boolean;
  
  /** Порог размера для потоковой передачи (в байтах, по умолчанию 1MB) */
  streamingThreshold?: number;
  
  /** Логгер */
  logger?: Logger;
}

/**
 * Реализация менеджера артефактов по умолчанию
 */
export class DefaultArtifactManager implements ArtifactManager {
  private config: Required<ArtifactManagerConfig>;
  private sessionDirs: Map<string, string> = new Map();

  constructor(config: ArtifactManagerConfig) {
    this.config = {
      baseDir: config.baseDir,
      sessionDirTemplate: config.sessionDirTemplate || 'session_{sessionId}',
      saveMetadata: config.saveMetadata ?? true,
      streamingThreshold: config.streamingThreshold || 1024 * 1024, // 1MB
      logger: config.logger || console as unknown as Logger,
    };
  }

  /**
   * Сохранение артефакта
   * @param sessionId - ID сессии
   * @param stepId - ID шага
   * @param name - Имя артефакта
   * @param content - Содержимое
   * @returns Promise<string> - Путь к сохраненному файлу
   */
  async save(sessionId: string, stepId: string, name: string, content: string): Promise<string> {
    // Получение или создание директории сессии
    const sessionDir = await this.getOrCreateSessionDir(sessionId);
    
    // Формирование пути к файлу артефакта
    const artifactPath = path.join(sessionDir, name);
    
    // Создание поддиректорий, если необходимо
    const artifactDir = path.dirname(artifactPath);
    await fs.mkdir(artifactDir, { recursive: true });
    
    // Определяем, использовать ли потоковую передачу
    const contentSize = Buffer.byteLength(content, 'utf-8');
    
    if (contentSize > this.config.streamingThreshold) {
      // Используем потоковую передачу для больших файлов
      await this.saveWithStreaming(artifactPath, content);
      this.config.logger.debug(`Использована потоковая передача для артефакта ${artifactPath} (${contentSize} байт)`);
    } else {
      // Обычное сохранение для небольших файлов
      await fs.writeFile(artifactPath, content, 'utf-8');
    }
    
    // Получение размера файла
    const stats = await fs.stat(artifactPath);
    
    // Сохранение метаданных
    if (this.config.saveMetadata) {
      const metadata: ArtifactMetadata = {
        name,
        stepId,
        createdAt: new Date().toISOString(),
        size: stats.size,
      };
      
      await this.saveMetadata(artifactPath, metadata);
    }
    
    this.config.logger.info(`Сохранен артефакт: ${artifactPath} (${stats.size} байт)`);
    
    return artifactPath;
  }
  
  /**
   * Сохранение артефакта с использованием потоковой передачи
   * @param artifactPath - Путь к файлу
   * @param content - Содержимое
   */
  private async saveWithStreaming(artifactPath: string, content: string): Promise<void> {
    const { Readable } = await import('stream');
    
    // Создаем readable stream из строки
    const readable = Readable.from([content]);
    
    // Создаем writable stream
    const writable = createWriteStream(artifactPath, { encoding: 'utf-8' });
    
    // Используем pipeline для потоковой передачи
    await pipeline(readable, writable);
  }

  /**
   * Загрузка артефакта с поддержкой потоковой передачи
   * @param path - Путь к артефакту
   * @returns Promise<string> - Содержимое артефакта
   */
  async load(artifactPath: string): Promise<string> {
    try {
      // Проверка существования файла
      const stats = await fs.stat(artifactPath);
      
      // Определяем, использовать ли потоковую передачу
      if (stats.size > this.config.streamingThreshold) {
        // Используем потоковую передачу для больших файлов
        const content = await this.loadWithStreaming(artifactPath);
        this.config.logger.debug(`Использована потоковая передача для загрузки артефакта ${artifactPath} (${stats.size} байт)`);
        return content;
      } else {
        // Обычная загрузка для небольших файлов
        const content = await fs.readFile(artifactPath, 'utf-8');
        this.config.logger.debug(`Загружен артефакт: ${artifactPath}`);
        return content;
      }
    } catch (error) {
      throw new WorkflowErrorClass({
        code: 'ARTIFACT_NOT_FOUND',
        category: 'execution',
        severity: 'error',
        message: `Артефакт не найден: ${artifactPath}`,
        context: { artifactPath, error },
        recoverable: false,
        suggestions: [
          'Проверьте правильность пути к артефакту',
          'Убедитесь, что шаг, создающий артефакт, был выполнен',
          'Проверьте целостность файловой системы',
        ],
      });
    }
  }
  
  /**
   * Загрузка артефакта с использованием потоковой передачи
   * @param artifactPath - Путь к файлу
   * @returns Promise<string> - Содержимое
   */
  private async loadWithStreaming(artifactPath: string): Promise<string> {
    const chunks: (string | Buffer)[] = [];
    const readable = createReadStream(artifactPath, { encoding: 'utf-8' });
    
    return new Promise((resolve, reject) => {
      readable.on('data', (chunk: string | Buffer) => {
        chunks.push(chunk);
      });
      
      readable.on('end', () => {
        const result = chunks.map(chunk => 
          typeof chunk === 'string' ? chunk : chunk.toString('utf-8')
        ).join('');
        resolve(result);
      });
      
      readable.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Проверка существования артефакта
   * @param path - Путь к артефакту
   * @returns Promise<boolean>
   */
  async exists(artifactPath: string): Promise<boolean> {
    try {
      await fs.access(artifactPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Получение списка артефактов для сессии
   * @param sessionId - ID сессии
   * @returns Promise<ArtifactInfo[]>
   */
  async list(sessionId: string): Promise<ArtifactInfo[]> {
    const sessionDir = this.getSessionDir(sessionId);
    
    // Проверка существования директории сессии
    try {
      await fs.access(sessionDir);
    } catch {
      // Директория не существует - возвращаем пустой список
      return [];
    }
    
    // Рекурсивный поиск всех файлов в директории сессии
    const artifacts: ArtifactInfo[] = [];
    await this.collectArtifacts(sessionDir, sessionDir, artifacts);
    
    return artifacts;
  }

  // ========== Вспомогательные методы ==========

  /**
   * Получение или создание директории сессии
   */
  private async getOrCreateSessionDir(sessionId: string): Promise<string> {
    // Проверка кэша
    if (this.sessionDirs.has(sessionId)) {
      return this.sessionDirs.get(sessionId)!;
    }
    
    // Формирование пути к директории сессии
    const sessionDir = this.getSessionDir(sessionId);
    
    // Создание директории
    await fs.mkdir(sessionDir, { recursive: true });
    
    // Кэширование
    this.sessionDirs.set(sessionId, sessionDir);
    
    this.config.logger.debug(`Создана директория сессии: ${sessionDir}`);
    
    return sessionDir;
  }

  /**
   * Получение пути к директории сессии
   */
  private getSessionDir(sessionId: string): string {
    // Подстановка переменных в шаблон
    const dirName = this.config.sessionDirTemplate
      .replace('{sessionId}', sessionId)
      .replace('{timestamp}', new Date().toISOString().replace(/[:.]/g, '-'));
    
    return path.join(this.config.baseDir, dirName);
  }

  /**
   * Сохранение метаданных артефакта
   */
  private async saveMetadata(artifactPath: string, metadata: ArtifactMetadata): Promise<void> {
    const metadataPath = `${artifactPath}.meta.json`;
    const content = JSON.stringify(metadata, null, 2);
    
    try {
      await fs.writeFile(metadataPath, content, 'utf-8');
    } catch (error) {
      // Ошибка сохранения метаданных не критична
      this.config.logger.warn(`Не удалось сохранить метаданные: ${metadataPath}`, error);
    }
  }

  /**
   * Загрузка метаданных артефакта
   */
  private async loadMetadata(artifactPath: string): Promise<ArtifactMetadata | null> {
    const metadataPath = `${artifactPath}.meta.json`;
    
    try {
      const content = await fs.readFile(metadataPath, 'utf-8');
      return JSON.parse(content) as ArtifactMetadata;
    } catch {
      // Метаданные отсутствуют или повреждены
      return null;
    }
  }

  /**
   * Рекурсивный сбор артефактов из директории
   */
  private async collectArtifacts(
    baseDir: string,
    currentDir: string,
    artifacts: ArtifactInfo[]
  ): Promise<void> {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      
      if (entry.isDirectory()) {
        // Рекурсивный обход поддиректорий
        await this.collectArtifacts(baseDir, fullPath, artifacts);
      } else if (entry.isFile() && !entry.name.endsWith('.meta.json')) {
        // Это файл артефакта (не метаданные)
        const stats = await fs.stat(fullPath);
        const metadata = await this.loadMetadata(fullPath);
        
        const artifactInfo: ArtifactInfo = {
          path: fullPath,
          name: entry.name,
          stepId: metadata?.stepId || 'unknown',
          size: stats.size,
          createdAt: metadata?.createdAt || stats.birthtime.toISOString(),
          metadata: metadata?.custom,
        };
        
        artifacts.push(artifactInfo);
      }
    }
  }
}

/**
 * Создание менеджера артефактов с конфигурацией по умолчанию
 */
export function createArtifactManager(
  config: Partial<ArtifactManagerConfig> = {}
): ArtifactManager {
  const defaultConfig: ArtifactManagerConfig = {
    baseDir: config.baseDir || './artifacts',
    sessionDirTemplate: config.sessionDirTemplate,
    saveMetadata: config.saveMetadata ?? true,
    logger: config.logger,
  };

  return new DefaultArtifactManager(defaultConfig);
}
