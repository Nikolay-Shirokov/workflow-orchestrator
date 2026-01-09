import * as fc from 'fast-check';
import { DefaultTemplateEngine, createTemplateContext } from '../../src/core/template-engine.js';

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
        fc.array(fc.string(), { minLength: 0, maxLength: 11 }),
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
            fc.string(),
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
});
