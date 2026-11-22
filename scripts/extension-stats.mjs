// Fetches install/download counts and ratings for my VS Code extensions from the
// Visual Studio Marketplace and Open VSX, and writes Shields.io endpoint JSON files
// to badges/. Shields retired its own Marketplace badges, so the profile README
// reads these files through https://img.shields.io/endpoint?url=...
//
// Runs in GitHub Actions (see .github/workflows/extension-stats.yml). Node 20+.

import { mkdir, writeFile } from 'node:fs/promises';

const EXTENSIONS = [
  { id: 'onurkarakus.todoforge', slug: 'todoforge' },
  { id: 'onurkarakus.package-hub', slug: 'package-hub' },
];

const MARKETPLACE_BLUE = '007ACC';
const OPENVSX_PURPLE = 'C160EF';

const compact = (n) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
};

const rating = (average, count) =>
  count > 0 ? `${average.toFixed(1)}/5 (${count})` : 'no ratings yet';

const badge = (label, message, color, logo) => ({
  schemaVersion: 1,
  label,
  message,
  color,
  ...(logo ? { namedLogo: logo } : {}),
});

const fetchMarketplace = async (id) => {
  const res = await fetch('https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json;api-version=3.0-preview.1',
    },
    body: JSON.stringify({
      filters: [{ criteria: [{ filterType: 7, value: id }] }],
      flags: 914, // versions + statistics + latest version only
    }),
  });
  if (!res.ok) throw new Error(`Marketplace ${id}: HTTP ${res.status}`);
  const ext = (await res.json()).results?.[0]?.extensions?.[0];
  if (!ext) throw new Error(`Marketplace ${id}: extension not found`);
  const stat = (name) => ext.statistics?.find((s) => s.statisticName === name)?.value ?? 0;
  return {
    version: ext.versions?.[0]?.version ?? 'unknown',
    installs: Math.round(stat('install')),
    average: stat('averagerating'),
    ratingCount: Math.round(stat('ratingcount')),
  };
};

const fetchOpenVsx = async (id) => {
  const [namespace, name] = id.split('.');
  const res = await fetch(`https://open-vsx.org/api/${namespace}/${name}`);
  if (!res.ok) throw new Error(`Open VSX ${id}: HTTP ${res.status}`);
  const ext = await res.json();
  return {
    version: ext.version ?? 'unknown',
    downloads: ext.downloadCount ?? 0,
    average: ext.averageRating ?? 0,
    ratingCount: ext.reviewCount ?? 0,
  };
};

await mkdir('badges', { recursive: true });
const write = (file, data) => writeFile(`badges/${file}.json`, `${JSON.stringify(data, null, 2)}\n`);

let failures = 0;
for (const { id, slug } of EXTENSIONS) {
  // A failure for one source keeps the last good file for that source.
  try {
    const m = await fetchMarketplace(id);
    await write(`${slug}-marketplace-version`, badge('Marketplace', `v${m.version}`, MARKETPLACE_BLUE, 'visualstudiocode'));
    await write(`${slug}-marketplace-installs`, badge('installs', compact(m.installs), MARKETPLACE_BLUE));
    await write(`${slug}-marketplace-rating`, badge('rating', rating(m.average, m.ratingCount), MARKETPLACE_BLUE));
    console.log(`${id} Marketplace: v${m.version}, ${m.installs} installs, ${rating(m.average, m.ratingCount)}`);
  } catch (err) {
    failures++;
    console.error(String(err));
  }
  try {
    const o = await fetchOpenVsx(id);
    await write(`${slug}-openvsx-version`, badge('Open VSX', `v${o.version}`, OPENVSX_PURPLE, 'eclipseide'));
    await write(`${slug}-openvsx-downloads`, badge('downloads', compact(o.downloads), OPENVSX_PURPLE));
    await write(`${slug}-openvsx-rating`, badge('rating', rating(o.average, o.ratingCount), OPENVSX_PURPLE));
    console.log(`${id} Open VSX: v${o.version}, ${o.downloads} downloads, ${rating(o.average, o.ratingCount)}`);
  } catch (err) {
    failures++;
    console.error(String(err));
  }
}

if (failures === EXTENSIONS.length * 2) process.exit(1);
