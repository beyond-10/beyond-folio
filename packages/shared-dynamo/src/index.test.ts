import { describe, expect, it } from 'vitest';

import { placeholder } from './index';

describe('shared-dynamo placeholder', () => {
  it('exposes a placeholder value that is ok', () => {
    expect(placeholder.ok).toBe(true);
  });
});
