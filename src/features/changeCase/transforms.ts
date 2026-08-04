import {
  camelCase,
  capitalCase,
  constantCase,
  dotCase,
  kebabCase,
  noCase,
  pascalCase,
  pathCase,
  sentenceCase,
  snakeCase
} from 'change-case';

export interface CaseCommandDefinition {
  label: string;
  description: string;
  transform: (input: string) => string;
}

const lower = (input: string): string => input.toLowerCase();
const upper = (input: string): string => input.toUpperCase();
const lowerFirst = (input: string): string => input.charAt(0).toLowerCase() + input.slice(1);
const upperFirst = (input: string): string => input.charAt(0).toUpperCase() + input.slice(1);

const swap = (input: string): string =>
  Array.from(input)
    .map((character) => {
      const upperCased = character.toUpperCase();
      return character === upperCased ? character.toLowerCase() : upperCased;
    })
    .join('');

/**
 * change-case@5 不再提供 lower/upper/lowerFirst/upperFirst/swap/title/param,
 * 因此这些 label 由本地实现或映射到最接近的 v5 函数(见 README 的行为变更说明).
 */
export const CASE_COMMANDS: readonly CaseCommandDefinition[] = [
  {
    label: 'camel',
    description:
      'Convert to a string with the separators denoted by having the next letter capitalised',
    transform: camelCase
  },
  {
    label: 'constant',
    description: 'Convert to an upper case, underscore separated string',
    transform: constantCase
  },
  { label: 'dot', description: 'Convert to a lower case, period separated string', transform: dotCase },
  {
    label: 'kebab',
    description: 'Convert to a lower case, dash separated string (alias for param case)',
    transform: kebabCase
  },
  { label: 'lower', description: 'Convert to a string in lower case', transform: lower },
  {
    label: 'lowerFirst',
    description: 'Convert to a string with the first character lower cased',
    transform: lowerFirst
  },
  {
    label: 'no',
    description: 'Convert the string without any casing (lower case, space separated)',
    transform: noCase
  },
  { label: 'param', description: 'Convert to a lower case, dash separated string', transform: kebabCase },
  {
    label: 'pascal',
    description:
      'Convert to a string denoted in the same fashion as camelCase, but with the first letter also capitalised',
    transform: pascalCase
  },
  { label: 'path', description: 'Convert to a lower case, slash separated string', transform: pathCase },
  {
    label: 'sentence',
    description: 'Convert to a space separated string with the first character upper cased',
    transform: sentenceCase
  },
  {
    label: 'snake',
    description: 'Convert to a lower case, underscore separated string',
    transform: snakeCase
  },
  {
    label: 'swap',
    description: 'Convert to a string with every character case reversed',
    transform: swap
  },
  {
    label: 'title',
    description:
      'Convert to a space separated string with the first character of every word upper cased',
    transform: capitalCase
  },
  { label: 'upper', description: 'Convert to a string in upper case', transform: upper },
  {
    label: 'upperFirst',
    description: 'Convert to a string with the first character upper cased',
    transform: upperFirst
  }
];

export function getCaseCommand(label: string): CaseCommandDefinition | undefined {
  return CASE_COMMANDS.find((command) => command.label === label);
}
