import '@testing-library/jest-dom/vitest';

// Fresh storage between tests so persisted stores never leak state.
beforeEach(() => {
  localStorage.clear();
});
