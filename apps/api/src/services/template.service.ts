/**
 * Simple template rendering engine using Handlebars-like syntax
 * Supports: {{ variable }}, {{ object.property }}, conditional blocks
 */

export interface TemplateVars {
  profile?: {
    email?: string;
    firstName?: string;
    lastName?: string;
    [key: string]: unknown;
  };
  campaign?: {
    id?: string;
    name?: string;
    [key: string]: unknown;
  };
  organization?: {
    name?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export function renderTemplate(template: string, vars: TemplateVars): string {
  if (!template) return '';

  let result = template;

  // Process conditional blocks first: {{#if variable}}...{{/if}}
  result = processConditionalBlocks(result, vars);

  // Process each/loop blocks: {{#each items}}...{{/each}}
  result = processEachBlocks(result, vars);

  // Process simple variable replacements: {{ variable }} or {{variable}}
  result = processVariables(result, vars);

  return result;
}

function processConditionalBlocks(template: string, vars: TemplateVars): string {
  const ifPattern = /\{\{#if\s+([^}]+)\}\}([\s\S]*?)\{\{\/if\}\}/g;

  return template.replace(ifPattern, (_, condition, content) => {
    const conditionValue = getNestedValue(vars, condition.trim());
    if (conditionValue) {
      // Process else blocks within the if
      const elsePattern = /\{\{else\}\}/;
      if (elsePattern.test(content)) {
        return content.split('{{else}}')[0];
      }
      return content;
    } else {
      // Return else content if exists
      const elsePattern = /\{\{else\}\}/;
      if (elsePattern.test(content)) {
        return content.split('{{else}}')[1] || '';
      }
      return '';
    }
  });
}

function processEachBlocks(template: string, vars: TemplateVars): string {
  const eachPattern = /\{\{#each\s+([^}]+)\}\}([\s\S]*?)\{\{\/each\}\}/g;

  return template.replace(eachPattern, (_, arrayPath, content) => {
    const array = getNestedValue(vars, arrayPath.trim());
    if (!Array.isArray(array)) {
      return '';
    }

    return array
      .map((item, index) => {
        let itemContent = content;
        // Replace {{this}} with the item
        itemContent = itemContent.replace(/\{\{\s*this\s*\}\}/g, String(item));
        // Replace {{@index}} with the index
        itemContent = itemContent.replace(/\{\{\s*@index\s*\}\}/g, String(index));
        // Replace {{property}} with item.property for objects
        if (typeof item === 'object' && item !== null) {
          const itemVars = { ...vars, item };
          itemContent = processVariables(itemContent, itemVars);
          // Also handle item.property syntax
          itemContent = itemContent.replace(/\{\{\s*item\.([^}]+)\s*\}\}/g, (_match: string, prop: string) => {
            const value = getNestedValue(item as Record<string, unknown>, prop.trim());
            return formatValue(value);
          });
        }
        return itemContent;
      })
      .join('');
  });
}

function processVariables(template: string, vars: TemplateVars): string {
  // Match {{ variable }} with optional spaces, including nested paths
  const varPattern = /\{\{\s*([^#/}][^}]*?)\s*\}\}/g;

  return template.replace(varPattern, (_, path) => {
    // Handle special helpers
    if (path.startsWith('formatDate ')) {
      const datePath = path.replace('formatDate ', '').trim();
      const dateValue = getNestedValue(vars, datePath);
      if (dateValue) {
        return formatDate(dateValue);
      }
      return '';
    }

    if (path.startsWith('uppercase ')) {
      const valuePath = path.replace('uppercase ', '').trim();
      const value = getNestedValue(vars, valuePath);
      return String(value || '').toUpperCase();
    }

    if (path.startsWith('lowercase ')) {
      const valuePath = path.replace('lowercase ', '').trim();
      const value = getNestedValue(vars, valuePath);
      return String(value || '').toLowerCase();
    }

    const value = getNestedValue(vars, path.trim());
    return formatValue(value);
  });
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function formatDate(value: unknown): string {
  if (!value) return '';

  const date = value instanceof Date ? value : new Date(String(value));
  if (isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// Default fallback values for common template variables
export function getDefaultFallbacks(): Record<string, string> {
  return {
    'profile.firstName': 'there',
    'profile.lastName': '',
    'profile.email': '',
    'organization.name': '',
  };
}

// Validate a template and return any issues
export function validateTemplate(template: string): {
  valid: boolean;
  errors: string[];
  variables: string[];
} {
  const errors: string[] = [];
  const variables: string[] = [];

  // Check for unclosed blocks
  const ifCount = (template.match(/\{\{#if/g) || []).length;
  const endIfCount = (template.match(/\{\{\/if\}\}/g) || []).length;
  if (ifCount !== endIfCount) {
    errors.push(`Unclosed {{#if}} blocks: ${ifCount} opened, ${endIfCount} closed`);
  }

  const eachCount = (template.match(/\{\{#each/g) || []).length;
  const endEachCount = (template.match(/\{\{\/each\}\}/g) || []).length;
  if (eachCount !== endEachCount) {
    errors.push(`Unclosed {{#each}} blocks: ${eachCount} opened, ${endEachCount} closed`);
  }

  // Extract variables
  const varPattern = /\{\{\s*([^#/}][^}]*?)\s*\}\}/g;
  let match;
  while ((match = varPattern.exec(template)) !== null) {
    const varName = match[1].trim();
    // Skip special syntax
    if (!varName.startsWith('else') && !variables.includes(varName)) {
      variables.push(varName);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    variables,
  };
}
