import { describe, it, expect } from 'vitest';
import { parseIdentityBlock, compareModelIdentity } from './identity-parser.js';

describe('parseIdentityBlock', () => {
  it('extracts Model, Provider, Temperature from a full LLM-IDENTITY block', () => {
    const response =
      'Some text before\n---LLM-IDENTITY---\nModel: gpt-5.4\nProvider: openai\nTemperature: 0.7\n---END-IDENTITY---\nRest of response';
    const result = parseIdentityBlock(response);
    expect(result).not.toBeNull();
    expect(result!.model).toBe('gpt-5.4');
    expect(result!.provider).toBe('openai');
    expect(result!.temperature).toBe('0.7');
  });

  it('returns null when no LLM-IDENTITY block is present', () => {
    const result = parseIdentityBlock('no identity block here');
    expect(result).toBeNull();
  });

  it('handles extra whitespace and newlines around field values', () => {
    const response =
      '---LLM-IDENTITY---\nModel:   claude-sonnet-4.6  \nProvider:  Anthropic \nTemperature:  1.0  \n---END-IDENTITY---';
    const result = parseIdentityBlock(response);
    expect(result).not.toBeNull();
    expect(result!.model).toBe('claude-sonnet-4.6');
    expect(result!.provider).toBe('Anthropic');
    expect(result!.temperature).toBe('1.0');
  });

  it('returns null for Temperature when block is partial (missing Temperature)', () => {
    const response = '---LLM-IDENTITY---\nModel: x\nProvider: y\n---END-IDENTITY---';
    const result = parseIdentityBlock(response);
    expect(result).not.toBeNull();
    expect(result!.model).toBe('x');
    expect(result!.provider).toBe('y');
    expect(result!.temperature).toBeNull();
  });

  it('returns null for all fields when block is completely empty', () => {
    const response = '---LLM-IDENTITY---\n---END-IDENTITY---';
    const result = parseIdentityBlock(response);
    expect(result).not.toBeNull();
    expect(result!.model).toBeNull();
    expect(result!.provider).toBeNull();
    expect(result!.temperature).toBeNull();
  });
});

describe('compareModelIdentity', () => {
  it('returns true for identical model names', () => {
    expect(compareModelIdentity('gpt-5.4', 'gpt-5.4')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(compareModelIdentity('gpt-5.4', 'GPT-5.4')).toBe(true);
    expect(compareModelIdentity('GPT-5.4', 'gpt-5.4')).toBe(true);
  });

  it('returns false for different models', () => {
    expect(compareModelIdentity('claude-sonnet-4.6', 'gpt-5.4')).toBe(false);
  });

  it('returns true when configuredModel is a substring of parsedModel (partial match)', () => {
    expect(compareModelIdentity('gpt-5.4-turbo', 'gpt-5.4')).toBe(true);
  });

  it('returns false when parsedModel is empty string', () => {
    expect(compareModelIdentity('', 'gpt-5.4')).toBe(false);
  });

  it('returns false when configuredModel is empty string', () => {
    expect(compareModelIdentity('gpt-5.4', '')).toBe(false);
  });

  it('returns false when both are empty strings', () => {
    expect(compareModelIdentity('', '')).toBe(false);
  });
});
