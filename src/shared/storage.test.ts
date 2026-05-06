import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LinkSpaceData } from './types';
import {
  createEmptyData,
  exportLinkSpaceData,
  importLinkSpaceData,
  loadData,
  saveData
} from './storage';

const localStorageMock = chrome.storage.local as unknown as {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
};

describe('storage logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('저장소에 유효한 데이터가 없으면 빈 데이터를 반환한다', async () => {
    localStorageMock.get.mockResolvedValue({});

    await expect(loadData()).resolves.toEqual(createEmptyData());
  });

  it('저장소에 유효하지 않은 데이터가 있으면 빈 데이터를 반환한다', async () => {
    localStorageMock.get.mockResolvedValue({ linkSpaceData: { sessions: [] } });

    await expect(loadData()).resolves.toEqual(createEmptyData());
  });

  it('saveData는 chrome.storage.local.set으로 linkSpaceData를 저장한다', async () => {
    const data = createEmptyData();
    localStorageMock.set.mockResolvedValue(undefined);

    await saveData(data);

    expect(localStorageMock.set).toHaveBeenCalledWith({ linkSpaceData: data });
  });

  it('유효한 JSON 문자열을 LinkSpaceData로 가져온다', () => {
    const validData: LinkSpaceData = createEmptyData();

    expect(importLinkSpaceData(JSON.stringify(validData))).toEqual(validData);
  });

  it('유효하지 않은 Link Space data면 예외를 던진다', () => {
    expect(() => importLinkSpaceData('{"sessions":[]}')).toThrow('Invalid Link Space data');
  });

  it('JSON 파싱에 실패하면 예외를 던진다', () => {
    expect(() => importLinkSpaceData('{bad json')).toThrow('Invalid Link Space data');
  });

  it('exportLinkSpaceData는 보기 좋은 JSON 문자열을 반환한다', () => {
    expect(exportLinkSpaceData(createEmptyData())).toBe(JSON.stringify(createEmptyData(), null, 2));
  });
});
