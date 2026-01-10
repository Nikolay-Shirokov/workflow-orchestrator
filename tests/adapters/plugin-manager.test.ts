/**
 * Тесты для менеджера плагинов адаптеров
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { PluginManager } from '../../src/adapters/plugin-manager.js';
import { AdapterRegistry } from '../../src/adapters/adapter-registry.js';

describe('PluginManager', () => {
  let pluginManager: PluginManager;
  let registry: AdapterRegistry;
  
  beforeEach(() => {
    registry = new AdapterRegistry();
    pluginManager = new PluginManager(registry);
  });
  
  describe('Проверка совместимости', () => {
    it('должен определять совместимый плагин', () => {
      const metadata = {
        name: 'compatible-adapter',
        version: '1.0.0',
        minOrchestratorVersion: '1.0.0'
      };
      
      const result = pluginManager.checkCompatibility(metadata);
      
      expect(result.compatible).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });
    
    it('должен определять несовместимый плагин (минимальная версия)', () => {
      const metadata = {
        name: 'incompatible-adapter',
        version: '1.0.0',
        minOrchestratorVersion: '99.0.0'
      };
      
      const result = pluginManager.checkCompatibility(metadata);
      
      expect(result.compatible).toBe(false);
      expect(result.reason).toContain('Требуется оркестратор версии');
    });
    
    it('должен выдавать предупреждение для максимальной версии', () => {
      const metadata = {
        name: 'warning-adapter',
        version: '1.0.0',
        minOrchestratorVersion: '0.1.0',
        maxOrchestratorVersion: '0.9.0'
      };
      
      const result = pluginManager.checkCompatibility(metadata);
      
      expect(result.compatible).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
    
    it('должен обрабатывать невалидные версии', () => {
      const metadata = {
        name: 'invalid-version-adapter',
        version: 'not-a-version',
        minOrchestratorVersion: 'also-not-a-version'
      };
      
      const result = pluginManager.checkCompatibility(metadata);
      
      expect(result.compatible).toBe(false);
    });
  });
  
  describe('Управление плагинами', () => {
    it('должен возвращать пустой список для незагруженных плагинов', () => {
      const plugins = pluginManager.getAllPlugins();
      expect(plugins).toHaveLength(0);
    });
    
    it('должен возвращать undefined для несуществующего плагина', () => {
      const info = pluginManager.getPluginInfo('non-existent');
      expect(info).toBeUndefined();
    });
    
    it('должен выбрасывать ошибку при создании адаптера из незагруженного плагина', () => {
      const config = {
        name: 'test',
        command: 'test'
      };
      
      expect(() => pluginManager.createAdapter('non-existent', config)).toThrow();
    });
    
    it('должен возвращать false при выгрузке несуществующего плагина', async () => {
      const result = await pluginManager.unloadPlugin('non-existent');
      expect(result).toBe(false);
    });
  });
  
  describe('Получение метаданных', () => {
    it('должен возвращать пустой массив метаданных для незагруженных плагинов', () => {
      const metadata = pluginManager.getAllPluginMetadata();
      expect(metadata).toHaveLength(0);
    });
  });
});
