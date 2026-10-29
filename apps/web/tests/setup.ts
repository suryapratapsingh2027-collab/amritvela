import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

process.env.NEXT_PUBLIC_API_URL = 'https://api.test';
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });
// jsdom has no layout engine
Element.prototype.scrollIntoView = () => {};
