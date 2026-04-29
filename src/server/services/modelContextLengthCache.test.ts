import { describe, expect, it, beforeEach } from 'vitest';
import {
  setModelContextLength,
  setModelContextLengths,
  getModelContextLength,
  hasModelContextLength,
  clearModelContextLengthCache,
  extractContextLengthsFromPayload,
  getAllModelContextLengths,
} from './modelContextLengthCache.js';

describe('modelContextLengthCache', () => {
  beforeEach(() => {
    clearModelContextLengthCache();
  });

  describe('setModelContextLength / getModelContextLength', () => {
    it('stores and retrieves context length for a model', () => {
      setModelContextLength('gpt-4o', 128000);
      expect(getModelContextLength('gpt-4o')).toBe(128000);
    });

    it('returns default 1_000_000 when model is not in cache', () => {
      expect(getModelContextLength('unknown-model')).toBe(1_000_000);
    });

    it('normalizes model name case-insensitively', () => {
      setModelContextLength('GPT-4o', 128000);
      expect(getModelContextLength('gpt-4o')).toBe(128000);
      expect(getModelContextLength('GPT-4O')).toBe(128000);
    });

    it('ignores invalid values', () => {
      setModelContextLength('', 128000);
      expect(hasModelContextLength('')).toBe(false);

      setModelContextLength('model-a', NaN);
      expect(hasModelContextLength('model-a')).toBe(false);

      setModelContextLength('model-b', -100);
      expect(hasModelContextLength('model-b')).toBe(false);

      setModelContextLength('model-c', 0);
      expect(hasModelContextLength('model-c')).toBe(false);
    });

    it('rounds fractional values', () => {
      setModelContextLength('model', 128000.7);
      expect(getModelContextLength('model')).toBe(128001);
    });
  });

  describe('setModelContextLengths (bulk)', () => {
    it('stores multiple entries at once', () => {
      const entries = new Map([
        ['model-a', 128000],
        ['model-b', 200000],
        ['model-c', 1_000_000],
      ]);
      setModelContextLengths(entries);

      expect(getModelContextLength('model-a')).toBe(128000);
      expect(getModelContextLength('model-b')).toBe(200000);
      expect(getModelContextLength('model-c')).toBe(1_000_000);
    });

    it('ignores invalid entries in bulk', () => {
      const entries = new Map([
        ['valid-model', 128000],
        ['', 200000],
        ['nan-model', NaN],
      ]);
      setModelContextLengths(entries);

      expect(getModelContextLength('valid-model')).toBe(128000);
      expect(hasModelContextLength('')).toBe(false);
      expect(hasModelContextLength('nan-model')).toBe(false);
    });
  });

  describe('hasModelContextLength', () => {
    it('returns true only for cached models', () => {
      expect(hasModelContextLength('gpt-4o')).toBe(false);
      setModelContextLength('gpt-4o', 128000);
      expect(hasModelContextLength('gpt-4o')).toBe(true);
    });
  });

  describe('clearModelContextLengthCache', () => {
    it('clears all entries', () => {
      setModelContextLength('model-a', 128000);
      setModelContextLength('model-b', 200000);
      clearModelContextLengthCache();
      expect(hasModelContextLength('model-a')).toBe(false);
      expect(hasModelContextLength('model-b')).toBe(false);
    });
  });

  describe('extractContextLengthsFromPayload', () => {
    it('extracts context_length from OpenAI-compatible payload', () => {
      const payload = {
        data: [
          { id: 'gpt-4o', context_length: 128000 },
          { id: 'claude-3', context_length: 200000 },
        ],
      };
      const result = extractContextLengthsFromPayload(payload);
      expect(result.size).toBe(2);
      expect(result.get('gpt-4o')).toBe(128000);
      expect(result.get('claude-3')).toBe(200000);
    });

    it('extracts contextLength (camelCase)', () => {
      const payload = {
        data: [
          { id: 'model-a', contextLength: 256000 },
        ],
      };
      const result = extractContextLengthsFromPayload(payload);
      expect(result.get('model-a')).toBe(256000);
    });

    it('extracts max_context_length', () => {
      const payload = {
        data: [
          { id: 'model-b', max_context_length: 512000 },
        ],
      };
      const result = extractContextLengthsFromPayload(payload);
      expect(result.get('model-b')).toBe(512000);
    });

    it('extracts context_window', () => {
      const payload = {
        data: [
          { id: 'model-c', context_window: 1_000_000 },
        ],
      };
      const result = extractContextLengthsFromPayload(payload);
      expect(result.get('model-c')).toBe(1_000_000);
    });

    it('parses string values as numbers', () => {
      const payload = {
        data: [
          { id: 'model-str', context_length: '128000' },
        ],
      };
      const result = extractContextLengthsFromPayload(payload);
      expect(result.get('model-str')).toBe(128000);
    });

    it('returns empty map for payload without data array', () => {
      expect(extractContextLengthsFromPayload(null).size).toBe(0);
      expect(extractContextLengthsFromPayload({}).size).toBe(0);
      expect(extractContextLengthsFromPayload({ data: 'not-array' }).size).toBe(0);
    });

    it('returns empty map when no items have context_length', () => {
      const payload = {
        data: [
          { id: 'model-a' },
          { id: 'model-b' },
        ],
      };
      const result = extractContextLengthsFromPayload(payload);
      expect(result.size).toBe(0);
    });

    it('skips items without id', () => {
      const payload = {
        data: [
          { context_length: 128000 },
          { id: '', context_length: 200000 },
          { id: 'valid', context_length: 300000 },
        ],
      };
      const result = extractContextLengthsFromPayload(payload);
      expect(result.size).toBe(1);
      expect(result.get('valid')).toBe(300000);
    });

    it('skips zero or negative context_length', () => {
      const payload = {
        data: [
          { id: 'zero', context_length: 0 },
          { id: 'negative', context_length: -100 },
        ],
      };
      const result = extractContextLengthsFromPayload(payload);
      expect(result.size).toBe(0);
    });
  });

  describe('getAllModelContextLengths', () => {
    it('returns all cached entries', () => {
      setModelContextLength('a', 100);
      setModelContextLength('b', 200);
      const all = getAllModelContextLengths();
      expect(all.size).toBe(2);
      expect(all.get('a')).toBe(100);
      expect(all.get('b')).toBe(200);
    });
  });
});
