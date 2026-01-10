/**
 * Транслятор DSL AST в WorkflowConfig
 * Преобразует AST в внутреннее представление рабочего процесса
 */

import {
  WorkflowNode,
  SettingNode,
  RoleNode,
  StepNode,
} from './dsl-parser.js';
import {
  WorkflowConfig,
  WorkflowStep,
  RoleConfig,
  WorkflowSettings,
} from './types.js';

export interface TranslationError {
  message: string;
  line: number;
  column: number;
}

/**
 * Транслятор DSL в WorkflowConfig
 */
export class DSLTranslator {
  private errors: TranslationError[] = [];
  
  /**
   * Транслирует AST в WorkflowConfig
   */
  translate(ast: WorkflowNode): { config: WorkflowConfig | null; errors: TranslationError[] } {
    try {
      const config: WorkflowConfig = {
        name: ast.name,
        version: ast.version.replace('v', ''),
        description: '',
        settings: this.translateSettings(ast.settings),
        roles: this.translateRoles(ast.roles),
        steps: this.translateSteps(ast.steps),
      };
      
      return { config, errors: this.errors };
    } catch (error) {
      if (error instanceof Error) {
        this.errors.push({
          message: error.message,
          line: ast.line,
          column: ast.column,
        });
      }
      return { config: null, errors: this.errors };
    }
  }
  
  /**
   * Транслирует настройки
   */
  private translateSettings(settings: SettingNode[]): WorkflowSettings {
    const result: WorkflowSettings = {
      artifacts_dir: 'artifacts/session_{timestamp}',
    };
    
    for (const setting of settings) {
      switch (setting.key) {
        case 'description':
          // description обрабатывается отдельно
          break;
        case 'artifacts_dir':
          result.artifacts_dir = setting.value as string;
          break;
        case 'default_adapter':
          result.default_adapter = setting.value as string;
          break;
        case 'parallel_execution': {
          const boolValue = setting.value;
          result.parallel_execution = String(boolValue) === 'true';
          break;
        }
        case 'max_retries':
          result.max_retries = setting.value as number;
          break;
        case 'timeout':
          result.timeout = setting.value as number;
          break;
        case 'log_level':
          result.log_level = setting.value as string;
          break;
        default:
          this.errors.push({
            message: `Неизвестная настройка: ${setting.key}`,
            line: setting.line,
            column: setting.column,
          });
      }
    }
    
    return result;
  }
  
  /**
   * Транслирует роли
   */
  private translateRoles(roles: RoleNode[]): Record<string, RoleConfig> {
    const result: Record<string, RoleConfig> = {};
    
    for (const role of roles) {
      const roleConfig: Partial<RoleConfig> = {};
      
      for (const prop of role.properties) {
        switch (prop.key) {
          case 'adapter':
            roleConfig.adapter = prop.value as string;
            break;
          case 'model':
            roleConfig.model = prop.value as string;
            break;
          case 'definition':
            roleConfig.role_definition = prop.value as string;
            break;
          case 'custom_instructions':
            roleConfig.custom_instructions = prop.value as string;
            break;
          case 'permissions': {
            // Обработка permissions (может быть массивом)
            const permValue = prop.value as string;
            roleConfig.permissions = permValue.split(',').map(p => p.trim());
            break;
          }
          case 'temperature':
            roleConfig.temperature = prop.value as number;
            break;
          case 'max_tokens':
            roleConfig.max_tokens = prop.value as number;
            break;
          default:
            this.errors.push({
              message: `Неизвестное свойство роли: ${prop.key}`,
              line: prop.line,
              column: prop.column,
            });
        }
      }
      
      // Проверяем, что adapter определен
      if (!roleConfig.adapter) {
        this.errors.push({
          message: `Роль "${role.name}" должна иметь свойство "adapter"`,
          line: role.line,
          column: role.column,
        });
        roleConfig.adapter = 'default'; // Значение по умолчанию
      }
      
      result[role.name] = roleConfig as RoleConfig;
    }
    
    return result;
  }
  
  /**
   * Транслирует шаги
   */
  private translateSteps(steps: StepNode[]): WorkflowStep[] {
    const result: WorkflowStep[] = [];
    
    for (const step of steps) {
      result.push(this.translateStep(step));
    }
    
    return result;
  }
  
  /**
   * Транслирует один шаг
   */
  private translateStep(step: StepNode): WorkflowStep {
    const workflowStep: WorkflowStep = {
      id: step.id,
      name: step.id, // По умолчанию name = id
      type: 'model', // По умолчанию
    };
    
    // Если это параллельный шаг
    if (step.isParallel && step.nestedSteps) {
      workflowStep.type = 'parallel';
      workflowStep.steps = this.translateSteps(step.nestedSteps);
    }
    
    // Обработка свойств
    for (const prop of step.properties) {
      switch (prop.key) {
        case 'name':
          workflowStep.name = prop.value as string;
          break;
        case 'type':
          workflowStep.type = prop.value as 'model' | 'script' | 'conditional' | 'parallel' | 'user_input';
          break;
        case 'role':
          workflowStep.role = prop.value as string;
          break;
        case 'adapter':
          workflowStep.adapter = prop.value as string;
          break;
        case 'model':
          workflowStep.model = prop.value as string;
          break;
        case 'prompt': {
          // Обработка prompt (может быть inline или from file)
          const promptValue = prop.value as string;
          if (promptValue.startsWith('from:')) {
            workflowStep.prompt_template = promptValue.substring(5);
          } else {
            workflowStep.prompt_template = promptValue;
          }
          break;
        }
        case 'script':
          workflowStep.script = prop.value as string;
          break;
        case 'condition':
          workflowStep.condition = prop.value as string;
          break;
        case 'input': {
          // Обработка input (список переменных через запятую)
          const inputValue = prop.value as string;
          workflowStep.inputs = {};
          for (const varName of inputValue.split(',')) {
            const trimmed = varName.trim();
            if (trimmed) {
              workflowStep.inputs[trimmed] = `\${${trimmed}}`;
            }
          }
          break;
        }
        case 'output': {
          // Обработка output (var = "value")
          const outputValue = prop.value as string;
          const [varName, varValue] = outputValue.split('=').map(s => s.trim());
          if (!workflowStep.outputs) {
            workflowStep.outputs = {};
          }
          workflowStep.outputs[varName] = varValue;
          break;
        }
        case 'depends_on': {
          // Обработка depends_on (список ID через запятую)
          const dependsValue = prop.value as string;
          workflowStep.depends_on = dependsValue.split(',').map(s => s.trim()).filter(s => s);
          break;
        }
        case 'timeout':
          workflowStep.timeout = prop.value as number;
          break;
        case 'retries':
          workflowStep.retries = prop.value as number;
          break;
        case 'continue_on_error': {
          const boolValue = prop.value;
          workflowStep.continue_on_error = String(boolValue) === 'true';
          break;
        }
        case 'description':
          workflowStep.description = prop.value as string;
          break;
        default:
          this.errors.push({
            message: `Неизвестное свойство шага: ${prop.key}`,
            line: prop.line,
            column: prop.column,
          });
      }
    }
    
    return workflowStep;
  }
}

/**
 * Транслирует AST в WorkflowConfig
 */
export function translateDSL(ast: WorkflowNode): {
  config: WorkflowConfig | null;
  errors: TranslationError[];
} {
  const translator = new DSLTranslator();
  return translator.translate(ast);
}

/**
 * Генерирует YAML из WorkflowConfig
 */
export async function generateYAML(config: WorkflowConfig): Promise<string> {
  const yaml = await import('yaml');
  return yaml.stringify(config);
}

/**
 * Генерирует JSON из WorkflowConfig
 */
export function generateJSON(config: WorkflowConfig): string {
  return JSON.stringify(config, null, 2);
}
