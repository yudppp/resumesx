import { ToolProvider } from '../types.js';
import codex from './codex/index.js';
import claude from './claude/index.js';
import gemini from './gemini/index.js';

const builtinProviders: ToolProvider[] = [codex, claude, gemini];

export const loadProviders = async (): Promise<ToolProvider[]> => {
  return builtinProviders;
};
