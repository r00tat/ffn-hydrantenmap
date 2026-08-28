import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  __resetRescueCatalogCache,
  loadRescueCatalog,
} from './euroRescueCatalog';

const RAW_VARIANT = {
  id: '35',
  name: 'A1 Sportback',
  make_id: '2',
  make_name: 'Audi',
  model_id: '12',
  model_name: 'A1',
  body_type: 'Hatchback',
  build_year_from: '2010',
  build_year_until: '2018',
  doors: '3',
  powertrain: 'Gasoline/Diesel',
  picture_url: 'https://example.test/a1.png',
  documents: [
    {
      id: '56',
      url: 'https://example.test/a1_EN.pdf',
      language: 'EN',
      type: 'Rescue Sheet',
    },
    {
      id: '2364',
      url: 'https://example.test/a1_DE.pdf',
      language: 'DE',
      type: 'Rescue Sheet',
    },
    {
      id: '10880',
      url: 'https://example.test/audi_DE.pdf',
      language: 'DE',
      type: 'Rescue Guide',
    },
  ],
};

function response(body: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  } as unknown as Response;
}

describe('loadRescueCatalog', () => {
  beforeEach(() => {
    __resetRescueCatalogCache();
    vi.stubGlobal('fetch', vi.fn());
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('maps the API payload onto the internal model', async () => {
    vi.mocked(fetch).mockResolvedValue(
      response({ Documents: [RAW_VARIANT] }),
    );

    const variants = await loadRescueCatalog();

    expect(variants).toEqual([
      {
        id: '35',
        makeName: 'Audi',
        modelName: 'A1',
        variantName: 'A1 Sportback',
        bodyType: 'Hatchback',
        buildYearFrom: 2010,
        buildYearUntil: 2018,
        doors: '3',
        powertrain: 'Gasoline/Diesel',
        pictureUrl: 'https://example.test/a1.png',
        documents: [
          {
            url: 'https://example.test/a1_EN.pdf',
            language: 'EN',
            type: 'sheet',
          },
          {
            url: 'https://example.test/a1_DE.pdf',
            language: 'DE',
            type: 'sheet',
          },
          {
            url: 'https://example.test/audi_DE.pdf',
            language: 'DE',
            type: 'guide',
          },
        ],
      },
    ]);
  });

  it('leaves an open build period undefined', async () => {
    vi.mocked(fetch).mockResolvedValue(
      response({
        Documents: [{ ...RAW_VARIANT, build_year_until: '' }],
      }),
    );

    const [variant] = await loadRescueCatalog();
    expect(variant.buildYearFrom).toBe(2010);
    expect(variant.buildYearUntil).toBeUndefined();
  });

  it('skips entries without an id and documents without a url', async () => {
    vi.mocked(fetch).mockResolvedValue(
      response({
        Documents: [
          { ...RAW_VARIANT, id: undefined },
          {
            ...RAW_VARIANT,
            id: '99',
            documents: [{ url: '', language: 'DE', type: 'Rescue Sheet' }],
          },
        ],
      }),
    );

    const variants = await loadRescueCatalog();
    expect(variants).toHaveLength(1);
    expect(variants[0].id).toBe('99');
    expect(variants[0].documents).toEqual([]);
  });

  it('drops urls that are not https', async () => {
    vi.mocked(fetch).mockResolvedValue(
      response({
        Documents: [
          {
            ...RAW_VARIANT,
            picture_url: 'javascript:alert(1)',
            documents: [
              {
                url: 'javascript:alert(1)',
                language: 'DE',
                type: 'Rescue Sheet',
              },
              {
                url: 'data:text/html,<script>alert(1)</script>',
                language: 'DE',
                type: 'Rescue Sheet',
              },
              {
                url: 'http://example.test/a1_DE.pdf',
                language: 'DE',
                type: 'Rescue Sheet',
              },
              {
                url: 'not a url at all',
                language: 'DE',
                type: 'Rescue Sheet',
              },
              {
                url: 'https://example.test/a1_DE.pdf',
                language: 'DE',
                type: 'Rescue Sheet',
              },
            ],
          },
        ],
      }),
    );

    const [variant] = await loadRescueCatalog();

    expect(variant.pictureUrl).toBeUndefined();
    expect(variant.documents).toEqual([
      {
        url: 'https://example.test/a1_DE.pdf',
        language: 'DE',
        type: 'sheet',
      },
    ]);
  });

  it('serves the cache instead of fetching again', async () => {
    vi.mocked(fetch).mockResolvedValue(
      response({ Documents: [RAW_VARIANT] }),
    );

    await loadRescueCatalog();
    await loadRescueCatalog();

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('refetches once the cache is stale', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockResolvedValue(
      response({ Documents: [RAW_VARIANT] }),
    );

    await loadRescueCatalog();
    vi.advanceTimersByTime(25 * 60 * 60 * 1000);
    await loadRescueCatalog();

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('shares a single request between concurrent callers', async () => {
    vi.mocked(fetch).mockResolvedValue(
      response({ Documents: [RAW_VARIANT] }),
    );

    await Promise.all([loadRescueCatalog(), loadRescueCatalog()]);

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps serving stale data when the refresh fails', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockResolvedValueOnce(
      response({ Documents: [RAW_VARIANT] }),
    );
    await loadRescueCatalog();

    vi.advanceTimersByTime(25 * 60 * 60 * 1000);
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network down'));

    const variants = await loadRescueCatalog();
    expect(variants).toHaveLength(1);
  });

  it('throws when the very first fetch fails', async () => {
    vi.mocked(fetch).mockResolvedValue(response({}, false));
    await expect(loadRescueCatalog()).rejects.toThrow();
  });
});
