import { describe, it, expect, vi } from 'vitest';
import {
  publicApiErrorMessage,
  shuffle,
  stripJsonWrapper,
  makeAbort,
} from '../../src/background/helpers.js';

describe('publicApiErrorMessage', () => {
  it('passes through "Model provider…" messages verbatim', () => {
    expect(publicApiErrorMessage(new Error('Model provider request failed (429)'))).toBe(
      'Model provider request failed (429)',
    );
  });

  it('passes through "Permission for …" messages verbatim', () => {
    expect(publicApiErrorMessage(new Error('Permission for api.openai.com not granted'))).toBe(
      'Permission for api.openai.com not granted',
    );
  });

  it('passes through "Missing API key" messages verbatim', () => {
    expect(publicApiErrorMessage(new Error('Missing API key'))).toBe('Missing API key');
  });

  it('passes through "Missing model" messages verbatim', () => {
    expect(publicApiErrorMessage(new Error('Missing model'))).toBe('Missing model');
  });

  it('falls back to the generic message for anything else', () => {
    expect(publicApiErrorMessage(new Error('Random TypeError'))).toMatch(
      /The model provider request failed/,
    );
  });

  it('handles null/undefined error inputs', () => {
    expect(publicApiErrorMessage(null)).toMatch(/The model provider request failed/);
    expect(publicApiErrorMessage(undefined)).toMatch(/The model provider request failed/);
  });

  it('handles errors with no message field', () => {
    expect(publicApiErrorMessage({})).toMatch(/The model provider request failed/);
  });
});

describe('shuffle', () => {
  it('returns an array of the same length', () => {
    const input = [1, 2, 3, 4, 5];
    const out = shuffle(input);
    expect(out).toHaveLength(input.length);
  });

  it('does not mutate the input array', () => {
    const input = [1, 2, 3];
    const before = [...input];
    shuffle(input);
    expect(input).toEqual(before);
  });

  it('returns the same elements (just possibly reordered)', () => {
    const input = ['a', 'b', 'c', 'd'];
    const out = shuffle(input).sort();
    expect(out).toEqual([...input].sort());
  });

  it('handles empty arrays', () => {
    expect(shuffle([])).toEqual([]);
  });

  it('handles single-element arrays', () => {
    expect(shuffle([42])).toEqual([42]);
  });
});

describe('stripJsonWrapper', () => {
  it('returns input when empty/null/undefined', () => {
    expect(stripJsonWrapper('')).toBe('');
    expect(stripJsonWrapper(null)).toBe(null);
    expect(stripJsonWrapper(undefined)).toBe(undefined);
  });

  it('strips opening ```json fence', () => {
    expect(stripJsonWrapper('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('strips opening ``` fence with no language', () => {
    expect(stripJsonWrapper('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('extracts first { to last } when junk surrounds the JSON', () => {
    expect(stripJsonWrapper('preamble blah blah {"a":1} trailing'))
      .toBe('{"a":1}');
  });

  it('returns plain JSON unchanged (modulo trim)', () => {
    expect(stripJsonWrapper('  {"a":1}  ')).toBe('{"a":1}');
  });

  it('returns text unchanged when no braces present', () => {
    expect(stripJsonWrapper('no braces here')).toBe('no braces here');
  });

  it('handles last } before first {', () => {
    // }{ — last } is at index 0, first { is at index 1. last > first is false.
    expect(stripJsonWrapper('}{')).toBe('}{');
  });
});

describe('makeAbort', () => {
  function fakePort() {
    const listeners = [];
    return {
      onDisconnect: {
        addListener: (fn) => listeners.push(fn),
      },
      _fireDisconnect() {
        for (const fn of listeners) fn();
      },
    };
  }

  it('returns a controller and a getAborted accessor', () => {
    const port = fakePort();
    const { controller, getAborted } = makeAbort(port);
    expect(controller).toBeInstanceOf(AbortController);
    expect(typeof getAborted).toBe('function');
    expect(getAborted()).toBe(false);
  });

  it('aborts the controller and flips getAborted when the port disconnects', () => {
    const port = fakePort();
    const { controller, getAborted } = makeAbort(port);
    expect(controller.signal.aborted).toBe(false);
    port._fireDisconnect();
    expect(controller.signal.aborted).toBe(true);
    expect(getAborted()).toBe(true);
  });
});
