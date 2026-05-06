import { describe, expect, it } from 'vitest';
import { parseGoogleSearch } from './google';

describe('parseGoogleSearch', () => {
  it('google.com search URL에서 q 값을 추출한다', () => {
    expect(parseGoogleSearch('https://www.google.com/search?q=three.js+graph')).toEqual({
      engine: 'google',
      query: 'three.js graph'
    });
  });

  it('google.co.kr search URL에서 q 값을 추출한다', () => {
    expect(parseGoogleSearch('https://www.google.co.kr/search?q=%EB%A7%81%ED%81%AC')).toEqual({
      engine: 'google',
      query: '링크'
    });
  });

  it('Google 검색 URL이 아니면 null을 반환한다', () => {
    expect(parseGoogleSearch('https://example.com/search?q=three')).toBeNull();
  });

  it('q 값이 비어 있으면 null을 반환한다', () => {
    expect(parseGoogleSearch('https://www.google.com/search?q=')).toBeNull();
  });
});
