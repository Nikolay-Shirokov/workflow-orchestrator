/**
 * Менеджер плагинов для пользовательских адаптеров
 * Управляет загрузкой, валидацией и регистрацией пользовательских адаптеров
 */

import { readdir } from 'fs/promises';
import { join, resolve, extname } from 'path';
import { pathToFileURL } from 'url';
import * as semver from 'semver';
import {
  AdapterPlugin,
  AdapterPluginMetadata,
  PluginCompatibilityResult,
  PluginLoadOptions,
  AdapterConfig,
  CLIAdapter
} from '../core/types.js';
import { AdapterRegistry } from './adapter-registry.js';

/**
 * Версия оркестратора (должна быть синхронизирована с package.json)
 */
const ORCHESTRATOR_VERSION = '1.0.0';

/**
 * Информация о загруженном плагине
 */
interface LoadedPluginInfo {
  /** Плагин */
  plugin: AdapterPlugin;
  
  /** Путь к файлу плагина */
  path: string;
  
  /** Время загрузки */
  loadedAt: string;
  
  /** Результат проверки совместимости */
  compatibility: PluginCompatibilityResult;
}

/**
 * Менеджер плагинов адаптеров
 */
export class PluginManager {
  /** Загруженные плагины: имя -> информация */
  private plugins: Map<string, LoadedPluginInfo> = new Map();
  
  /** Реестр адаптеров для автоматической регистрации */
  private registry: AdapterRegistry;
  
  constructor(registry: AdapterRegistry) {
    this.registry = registry;
  }
  
  /**
   * Загрузка плагина из файла
   * @param pluginPath - Путь к файлу плагина (.js или .ts)
   * @param options - Опции загрузки
   * @returns Promise<AdapterPlugin> - Загруженный плагин
   */
  async loadPlugin(
    pluginPath: string,
    options: PluginLoadOptions = {}
  ): Promise<AdapterPlugin> {
    const {
      autoRegister = true,
      skipCompatibilityCheck = false,
      overwrite = false,
      validateConfig = true
    } = options;
    
    // Разрешаем абсолютный путь
    const absolutePath = resolve(pluginPath);
    
    // Проверяем расширение файла
    const ext = extname(absolutePath);
    if (!['.js', '.mjs', '.cjs'].includes(ext)) {
      throw new Error(
        `Неподдерживаемый формат файла плагина: ${ext}. ` +
        `Поддерживаются только .js, .mjs, .cjs файлы.`
      );
    }
    
    try {
      // Динамический импорт плагина
      const fileUrl = pathToFileURL(absolutePath).href;
      const module = await import(fileUrl);
      
      // Проверяем, что модуль экспортирует плагин
      const plugin = module.default || module.plugin;
      if (!plugin) {
        throw new Error(
          `Файл плагина не экспортирует плагин. ` +
          `Убедитесь, что файл экспортирует объект AdapterPlugin как default или named export 'plugin'.`
        );
      }
      
      // Валидируем структуру плагина
      this.validatePluginStructure(plugin);
      
      // Проверяем, не загружен ли уже плагин с таким именем
      if (this.plugins.has(plugin.metadata.name) && !overwrite) {
        throw new Error(
          `Плагин с именем "${plugin.metadata.name}" уже загружен. ` +
          `Используйте опцию overwrite: true для перезаписи.`
        );
      }
      
      // Проверяем совместимость
      let compatibility: PluginCompatibilityResult;
      if (!skipCompatibilityCheck) {
        compatibility = this.checkCompatibility(plugin.metadata);
        if (!compatibility.compatible) {
          throw new Error(
            `Плагин "${plugin.metadata.name}" несовместим с текущей версией оркестратора. ` +
            `Причина: ${compatibility.reason}`
          );
        }
        
        // Выводим предупреждения
        if (compatibility.warnings.length > 0) {
          console.warn(
            `Предупреждения при загрузке плагина "${plugin.metadata.name}":`
          );
          compatibility.warnings.forEach(warning => console.warn(`  - ${warning}`));
        }
      } else {
        compatibility = {
          compatible: true,
          warnings: ['Проверка совместимости пропущена'],
          orchestratorVersion: ORCHESTRATOR_VERSION,
          pluginVersion: plugin.metadata.version
        };
      }
      
      // Инициализируем плагин
      if (plugin.initialize) {
        await plugin.initialize();
      }
      
      // Сохраняем информацию о плагине
      this.plugins.set(plugin.metadata.name, {
        plugin,
        path: absolutePath,
        loadedAt: new Date().toISOString(),
        compatibility
      });
      
      // Автоматическая регистрация (если включена)
      if (autoRegister) {
        // Создаем тестовую конфигурацию для проверки
        const testConfig: AdapterConfig = {
          name: plugin.metadata.name,
          command: 'test',
          args: []
        };
        
        // Валидируем конфигурацию (если включена валидация)
        if (validateConfig && plugin.validateConfig) {
          const validationResult = plugin.validateConfig(testConfig);
          if (!validationResult.valid) {
            console.warn(
              `Плагин "${plugin.metadata.name}" имеет проблемы с валидацией конфигурации:`,
              validationResult.errors
            );
          }
        }
      }
      
      return plugin;
    } catch (error) {
      throw new Error(
        `Не удалось загрузить плагин из "${pluginPath}": ${(error as Error).message}`
      );
    }
  }
  
  /**
   * Загрузка всех плагинов из директории
   * @param directory - Путь к директории с плагинами
   * @param options - Опции загрузки
   * @returns Promise<AdapterPlugin[]> - Массив загруженных плагинов
   */
  async loadPluginsFromDirectory(
    directory: string,
    options: PluginLoadOptions = {}
  ): Promise<AdapterPlugin[]> {
    const absolutePath = resolve(directory);
    const plugins: AdapterPlugin[] = [];
    
    try {
      // Читаем содержимое директории
      const entries = await readdir(absolutePath);
      
      // Фильтруем только .js файлы
      const pluginFiles = entries.filter(entry => {
        const ext = extname(entry);
        return ['.js', '.mjs', '.cjs'].includes(ext);
      });
      
      // Загружаем каждый плагин
      for (const file of pluginFiles) {
        const pluginPath = join(absolutePath, file);
        
        try {
          const plugin = await this.loadPlugin(pluginPath, options);
          plugins.push(plugin);
        } catch (error) {
          console.error(
            `Ошибка при загрузке плагина "${file}": ${(error as Error).message}`
          );
          // Продолжаем загрузку остальных плагинов
        }
      }
      
      return plugins;
    } catch (error) {
      throw new Error(
        `Не удалось загрузить плагины из директории "${directory}": ${(error as Error).message}`
      );
    }
  }
  
  /**
   * Создание адаптера из плагина
   * @param pluginName - Имя плагина
   * @param config - Конфигурация адаптера
   * @returns CLIAdapter - Созданный адаптер
   */
  createAdapter(pluginName: string, config: AdapterConfig): CLIAdapter {
    const pluginInfo = this.plugins.get(pluginName);
    if (!pluginInfo) {
      throw new Error(
        `Плагин "${pluginName}" не загружен. ` +
        `Доступные плагины: ${Array.from(this.plugins.keys()).join(', ')}`
      );
    }
    
    // Валидируем конфигурацию (если плагин поддерживает валидацию)
    if (pluginInfo.plugin.validateConfig) {
      const validationResult = pluginInfo.plugin.validateConfig(config);
      if (!validationResult.valid) {
        const errors = validationResult.errors
          .map(e => `  - ${e.message}`)
          .join('\n');
        throw new Error(
          `Невалидная конфигурация для плагина "${pluginName}":\n${errors}`
        );
      }
    }
    
    // Создаем адаптер через фабрику
    const adapter = pluginInfo.plugin.createAdapter(config);
    
    // Автоматически регистрируем адаптер
    if (!this.registry.has(adapter.name)) {
      this.registry.register(adapter);
    }
    
    return adapter;
  }
  
  /**
   * Выгрузка плагина
   * @param pluginName - Имя плагина
   * @returns Promise<boolean> - true если плагин был выгружен
   */
  async unloadPlugin(pluginName: string): Promise<boolean> {
    const pluginInfo = this.plugins.get(pluginName);
    if (!pluginInfo) {
      return false;
    }
    
    // Вызываем cleanup если есть
    if (pluginInfo.plugin.cleanup) {
      await pluginInfo.plugin.cleanup();
    }
    
    // Удаляем плагин из списка
    return this.plugins.delete(pluginName);
  }
  
  /**
   * Получение информации о загруженном плагине
   * @param pluginName - Имя плагина
   * @returns LoadedPluginInfo | undefined
   */
  getPluginInfo(pluginName: string): LoadedPluginInfo | undefined {
    return this.plugins.get(pluginName);
  }
  
  /**
   * Получение всех загруженных плагинов
   * @returns AdapterPlugin[]
   */
  getAllPlugins(): AdapterPlugin[] {
    return Array.from(this.plugins.values()).map(info => info.plugin);
  }
  
  /**
   * Получение метаданных всех загруженных плагинов
   * @returns AdapterPluginMetadata[]
   */
  getAllPluginMetadata(): AdapterPluginMetadata[] {
    return Array.from(this.plugins.values()).map(info => info.plugin.metadata);
  }
  
  /**
   * Проверка совместимости плагина с текущей версией оркестратора
   * @param metadata - Метаданные плагина
   * @returns PluginCompatibilityResult
   */
  checkCompatibility(metadata: AdapterPluginMetadata): PluginCompatibilityResult {
    const warnings: string[] = [];
    
    // Проверяем минимальную версию
    if (!semver.valid(metadata.minOrchestratorVersion)) {
      return {
        compatible: false,
        reason: `Невалидная минимальная версия оркестратора: ${metadata.minOrchestratorVersion}`,
        warnings,
        orchestratorVersion: ORCHESTRATOR_VERSION,
        pluginVersion: metadata.version
      };
    }
    
    if (!semver.valid(ORCHESTRATOR_VERSION)) {
      return {
        compatible: false,
        reason: `Невалидная версия оркестратора: ${ORCHESTRATOR_VERSION}`,
        warnings,
        orchestratorVersion: ORCHESTRATOR_VERSION,
        pluginVersion: metadata.version
      };
    }
    
    // Проверяем, что текущая версия >= минимальной
    if (semver.lt(ORCHESTRATOR_VERSION, metadata.minOrchestratorVersion)) {
      return {
        compatible: false,
        reason: 
          `Требуется оркестратор версии >= ${metadata.minOrchestratorVersion}, ` +
          `текущая версия: ${ORCHESTRATOR_VERSION}`,
        warnings,
        orchestratorVersion: ORCHESTRATOR_VERSION,
        pluginVersion: metadata.version
      };
    }
    
    // Проверяем максимальную версию (если указана)
    if (metadata.maxOrchestratorVersion) {
      if (!semver.valid(metadata.maxOrchestratorVersion)) {
        warnings.push(
          `Невалидная максимальная версия оркестратора: ${metadata.maxOrchestratorVersion}`
        );
      } else if (semver.gt(ORCHESTRATOR_VERSION, metadata.maxOrchestratorVersion)) {
        warnings.push(
          `Плагин может быть несовместим с текущей версией оркестратора. ` +
          `Максимальная поддерживаемая версия: ${metadata.maxOrchestratorVersion}, ` +
          `текущая версия: ${ORCHESTRATOR_VERSION}`
        );
      }
    }
    
    // Проверяем версию плагина
    if (!semver.valid(metadata.version)) {
      warnings.push(`Невалидная версия плагина: ${metadata.version}`);
    }
    
    return {
      compatible: true,
      warnings,
      orchestratorVersion: ORCHESTRATOR_VERSION,
      pluginVersion: metadata.version
    };
  }
  
  /**
   * Валидация структуры плагина
   * @param plugin - Плагин для валидации
   * @throws Error если структура невалидна
   */
  private validatePluginStructure(plugin: unknown): asserts plugin is AdapterPlugin {
    if (!plugin || typeof plugin !== 'object') {
      throw new Error('Плагин должен быть объектом');
    }
    
    const p = plugin as Partial<AdapterPlugin>;
    
    // Проверяем наличие metadata
    if (!p.metadata || typeof p.metadata !== 'object') {
      throw new Error('Плагин должен содержать поле metadata');
    }
    
    const metadata = p.metadata as Partial<AdapterPluginMetadata>;
    
    // Проверяем обязательные поля metadata
    if (!metadata.name || typeof metadata.name !== 'string') {
      throw new Error('metadata.name должно быть строкой');
    }
    
    if (!metadata.version || typeof metadata.version !== 'string') {
      throw new Error('metadata.version должно быть строкой');
    }
    
    if (!metadata.minOrchestratorVersion || typeof metadata.minOrchestratorVersion !== 'string') {
      throw new Error('metadata.minOrchestratorVersion должно быть строкой');
    }
    
    // Проверяем наличие createAdapter
    if (!p.createAdapter || typeof p.createAdapter !== 'function') {
      throw new Error('Плагин должен содержать функцию createAdapter');
    }
    
    // Проверяем опциональные методы
    if (p.initialize && typeof p.initialize !== 'function') {
      throw new Error('initialize должно быть функцией');
    }
    
    if (p.cleanup && typeof p.cleanup !== 'function') {
      throw new Error('cleanup должно быть функцией');
    }
    
    if (p.validateConfig && typeof p.validateConfig !== 'function') {
      throw new Error('validateConfig должно быть функцией');
    }
  }
}
