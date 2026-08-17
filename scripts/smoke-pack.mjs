import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sandbox = mkdtempSync(join(tmpdir(), 'lookspan-pack-'));
const packageDir = join(sandbox, 'package');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npmExec = process.env.npm_execpath;

function runNpm(args, options) {
  if (npmExec) return execFileSync(process.execPath, [npmExec, ...args], options);
  return execFileSync(npm, args, options);
}

try {
  runNpm(['pack', '-w', 'lookspan', '--pack-destination', sandbox], {
    cwd: root,
    stdio: 'pipe',
  });
  const tarball = readdirSync(sandbox).find((name) => /^lookspan-.*\.tgz$/.test(name));
  if (!tarball) throw new Error('npm pack did not produce a lookspan tarball');

  mkdirSync(packageDir);
  runNpm(['init', '-y'], { cwd: packageDir, stdio: 'ignore' });
  runNpm(['install', '--no-audit', '--no-fund', join(sandbox, tarball)], {
    cwd: packageDir,
    stdio: 'pipe',
  });
  const cli = join(packageDir, 'node_modules', 'lookspan', 'dist', 'index.js');
  const version = execFileSync(process.execPath, [cli, '--version'], {
    cwd: packageDir,
    encoding: 'utf8',
    stdio: 'pipe',
  }).trim();
  if (!/^lookspan \d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`packed CLI returned an invalid version: ${version}`);
  }
  console.log(`[smoke:pack] clean install passed: ${version}`);
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
