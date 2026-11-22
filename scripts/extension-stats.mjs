// Fetches install counts and ratings for my VS Code extensions from the Visual
// Studio Marketplace and writes Shields.io endpoint JSON files to badges/.
// Shields retired its own Marketplace badges and the Marketplace API needs a POST,
// so the profile README reads these files through https://img.shields.io/endpoint?url=...
// Open VSX badges use Shields' native open-vsx badges, which read the API directly.
//
// Runs in GitHub Actions (see .github/workflows/extension-stats.yml). Node 20+.

import { mkdir, writeFile } from 'node:fs/promises';

const EXTENSIONS = [
  { id: 'onurkarakus.todoforge', slug: 'todoforge' },
  { id: 'onurkarakus.package-hub', slug: 'package-hub' },
];

const MARKETPLACE_BLUE = '007ACC';

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

await mkdir('badges', { recursive: true });
const write = (file, data) => writeFile(`badges/${file}.json`, `${JSON.stringify(data, null, 2)}\n`);

let failures = 0;
for (const { id, slug } of EXTENSIONS) {
  // A failure keeps the last good files for that extension.
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
}

if (failures === EXTENSIONS.length) process.exit(1);
