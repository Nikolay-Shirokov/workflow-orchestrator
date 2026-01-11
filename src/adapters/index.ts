/**
 * Экспорт модулей адаптеров
 * Здесь будут размещены CLI-адаптеры для различных AI-моделей
 */

export { AdapterRegistry } from './adapter-registry.js';
export { BaseCLIAdapter } from './base-cli-adapter.js';
export { MockCLIAdapter, type MockResponse } from './mock-cli-adapter.js';
export { ClaudeCLIAdapter } from './claude-cli-adapter.js';
export { OpenAICLIAdapter } from './openai-cli-adapter.js';
export { GeminiCLIAdapter } from './gemini-cli-adapter.js';
export { CodexCLIAdapter } from './codex-cli-adapter.js';
export { PluginManager } from './plugin-manager.js';
