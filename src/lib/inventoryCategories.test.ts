import { describe, expect, it } from 'vitest';
import { getUniqueInventoryCategories, resolveInventoryCategory } from './inventoryCategories';

describe('inventory categories', () => {
  it('lists trimmed categories without case or accent duplicates', () => {
    expect(getUniqueInventoryCategories(['Mercearia', ' mercearia ', 'Laticínios', 'laticinios', '']))
      .toEqual(['Laticínios', 'Mercearia']);
  });

  it('reuses the existing canonical category name', () => {
    expect(resolveInventoryCategory(' MERCEARIA ', ['Mercearia', 'Bebidas'])).toBe('Mercearia');
    expect(resolveInventoryCategory('Hortifruti', ['Mercearia', 'Bebidas'])).toBe('Hortifruti');
  });
});
