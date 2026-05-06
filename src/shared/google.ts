import type { SearchEngine } from './types';

export interface ParsedSearch {
  engine: SearchEngine;
  query: string;
}

const GOOGLE_HOSTS = new Set(['www.google.com', 'google.com', 'www.google.co.kr', 'google.co.kr']);

export function parseGoogleSearch(url: string): ParsedSearch | null {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (!GOOGLE_HOSTS.has(parsed.hostname)) {
    return null;
  }

  if (parsed.pathname !== '/search') {
    return null;
  }

  const query = parsed.searchParams.get('q')?.trim();
  if (!query) {
    return null;
  }

  return { engine: 'google', query };
}
