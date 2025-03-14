import { createReadStream } from 'fs';
import { readFile } from 'fs/promises';
import path from 'path';
import fetchMock from 'jest-fetch-mock';
import {
  DEFAULT_REQUESTED_SNAP_VERSION,
  fetchNpmSnap,
  getSnapPrefix,
  resolveVersion,
  SnapIdPrefixes,
} from './utils';

fetchMock.enableMocks();

describe('fetchNpmSnap', () => {
  beforeEach(() => {
    fetchMock.resetMocks();
  });

  it('fetches a package tarball, extracts the necessary files, and validates them', async () => {
    const { version: templateSnapVersion } = JSON.parse(
      (
        await readFile(require.resolve('@metamask/template-snap/package.json'))
      ).toString('utf8'),
    );

    const tarballUrl = `https://registry.npmjs.cf/@metamask/template-snap/-/template-snap-${templateSnapVersion}.tgz`;
    const tarballRegistry = `https://registry.npmjs.org/@metamask/template-snap/-/template-snap-${templateSnapVersion}.tgz`;
    fetchMock
      .mockResponseOnce(
        JSON.stringify({
          'dist-tags': {
            latest: templateSnapVersion,
          },
          versions: {
            [templateSnapVersion]: {
              dist: {
                // return npmjs.org registry here so that we can check overriding it with npmjs.cf works
                tarball: tarballRegistry,
              },
            },
          },
        }),
      )
      .mockResponseOnce(
        (_req) =>
          Promise.resolve({
            ok: true,
            body: createReadStream(
              path.resolve(
                __dirname,
                `../../test/fixtures/metamask-template-snap-${templateSnapVersion}.tgz`,
              ),
            ),
          }) as any,
      );

    const { manifest, sourceCode, svgIcon } = await fetchNpmSnap(
      '@metamask/template-snap',
      templateSnapVersion,
      'https://registry.npmjs.cf',
      fetchMock,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://registry.npmjs.cf/@metamask/template-snap',
    );
    expect(fetchMock).toHaveBeenNthCalledWith(2, tarballUrl);

    expect(manifest).toStrictEqual(
      JSON.parse(
        (
          await readFile(
            require.resolve('@metamask/template-snap/snap.manifest.json'),
          )
        ).toString('utf8'),
      ),
    );

    expect(sourceCode).toStrictEqual(
      (
        await readFile(
          require.resolve('@metamask/template-snap/dist/bundle.js'),
        )
      ).toString('utf8'),
    );

    expect(svgIcon?.startsWith('<svg') && svgIcon.endsWith('</svg>')).toBe(
      true,
    );
  });
});

describe('resolveVersion', () => {
  it('defaults "latest" to DEFAULT_REQUESTED_SNAP_VERSION', () => {
    expect(resolveVersion('latest')).toBe(DEFAULT_REQUESTED_SNAP_VERSION);
  });

  it('defaults an undefined version to DEFAULT_REQUESTED_SNAP_VERSION', () => {
    expect(resolveVersion(undefined)).toBe(DEFAULT_REQUESTED_SNAP_VERSION);
  });

  it('returns the requested version for everything else', () => {
    expect(resolveVersion('1.2.3')).toBe('1.2.3');
  });
});

describe('getSnapPrefix', () => {
  it('detects npm prefix', () => {
    expect(getSnapPrefix('npm:example-snap')).toBe(SnapIdPrefixes.npm);
  });

  it('detects local prefix', () => {
    expect(getSnapPrefix('local:fooSnap')).toBe(SnapIdPrefixes.local);
  });

  it('throws in case of invalid prefix', () => {
    expect(() => getSnapPrefix('foo:fooSnap')).toThrow(
      'Invalid or no prefix found for "foo:fooSnap"',
    );
  });
});
