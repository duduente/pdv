function normalizeCategoryName(value: string) {
  return value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
}

export function getUniqueInventoryCategories(categories: string[]) {
  const uniqueCategories = new Map<string, string>();
  for (const category of categories) {
    const trimmedCategory = category.trim();
    const normalizedCategory = normalizeCategoryName(trimmedCategory);
    if (normalizedCategory && !uniqueCategories.has(normalizedCategory)) {
      uniqueCategories.set(normalizedCategory, trimmedCategory);
    }
  }
  return [...uniqueCategories.values()].sort((first, second) => first.localeCompare(second, 'pt-BR'));
}

export function resolveInventoryCategory(requestedCategory: string, existingCategories: string[]) {
  const normalizedRequest = normalizeCategoryName(requestedCategory);
  return existingCategories.find((category) => normalizeCategoryName(category) === normalizedRequest)
    ?? requestedCategory.trim();
}
