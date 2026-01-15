/**
 * Главная точка входа для Workflow Orchestrator
 */

export * from './core/index.js';
// Экспортируем адаптеры явно, чтобы избежать конфликта с AdapterRegistry из core
export { 
  BaseCLIAdapter,
  ClaudeCLIAdapter,
  OpenAICLIAdapter,
  GeminiCLIAdapter,
  MockCLIAdapter
} from './adapters/index.js';
// CLI экспортируется отдельно, чтобы избежать конфликтов имен
export { createCLI, runCLI, CLIWorkflowStatus, DryRunResult } from './cli/index.js';
export { WorkflowOrchestrator } from './cli/orchestrator.js';
export { ProgressDisplay } from './cli/progress-display.js';
