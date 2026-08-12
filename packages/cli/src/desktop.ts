// One-click desktop launcher.
//
// Lookspan is a local-first tool, so the natural way to open it is the same way
// you open any other app on your machine: click an icon. This module writes a
// native desktop entry that boots the server and opens the dashboard — a `.lnk`
// on Windows, an `.app` bundle on macOS, a `.desktop` file on Linux.
//
// Everything that decides *what* to write is a pure function so it can be
// tested without touching the filesystem; `installDesktop` / `uninstallDesktop`
// are the only parts that do I/O.

import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const APP_NAME = 'Lookspan';
export const APP_COMMENT = 'Local-first observability dashboard for AI agents';

export type DesktopPlatform = 'win32' | 'darwin' | 'linux';

export interface DesktopInput {
  platform: NodeJS.Platform;
  home: string;
  /** Absolute path to the node binary that will run the CLI. */
  execPath: string;
  /** Absolute path to the CLI entrypoint (dist/index.js). */
  cliPath: string;
  /** Flags baked into the launcher, e.g. ['--port', '3200', '--open']. */
  args: string[];
}

export interface DesktopFile {
  path: string;
  /** File contents. Absent for entries created by an external tool (Windows). */
  content?: string;
  /** Mark the file executable after writing (POSIX only). */
  executable?: boolean;
}

export interface DesktopPlan {
  platform: DesktopPlatform;
  /** Files written directly. */
  files: DesktopFile[];
  /** Paths removed on uninstall (includes directories for the macOS bundle). */
  removes: string[];
  /** PowerShell source used to create the Windows shortcuts, if any. */
  powershell?: string;
}

/**
 * `npx lookspan` runs from a cache npm is free to evict, so a shortcut pointing
 * there would break the first time the cache is cleaned. Detect it and tell the
 * user to install globally instead.
 */
export function isEphemeralInstall(cliPath: string): boolean {
  const normalized = cliPath.replace(/\\/g, '/');
  return /\/_npx\//.test(normalized) || /\/\.npm\/_npx\//.test(normalized);
}

/** Normalize a platform to the three we support, or null if unsupported. */
export function supportedPlatform(platform: NodeJS.Platform): DesktopPlatform | null {
  if (platform === 'win32' || platform === 'darwin' || platform === 'linux') return platform;
  return null;
}

/** The launcher always ends up opening the browser; callers need not pass it. */
export function withOpenFlag(args: string[]): string[] {
  return args.includes('--open') ? [...args] : [...args, '--open'];
}

/** Quote a single argument for a POSIX shell. */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Quote a value for a PowerShell single-quoted string. */
function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Freedesktop entry. `Terminal=false` is what makes it a one-click app rather
 * than something that pops a terminal; the server keeps running in the
 * background until the user stops it.
 */
export function buildLinuxEntry(input: DesktopInput): string {
  const exec = [input.execPath, input.cliPath, ...withOpenFlag(input.args)]
    .map(shellQuote)
    .join(' ');
  return [
    '[Desktop Entry]',
    'Type=Application',
    `Name=${APP_NAME}`,
    `Comment=${APP_COMMENT}`,
    `Exec=${exec}`,
    'Terminal=false',
    'Categories=Development;Monitor;',
    'StartupNotify=false',
    '',
  ].join('\n');
}

/** The executable inside the .app bundle — a plain shell script. */
export function buildMacLauncher(input: DesktopInput): string {
  const exec = [input.execPath, input.cliPath, ...withOpenFlag(input.args)]
    .map(shellQuote)
    .join(' ');
  return `#!/bin/sh\nexec ${exec}\n`;
}

export function buildMacPlist(): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    '  <key>CFBundleName</key>',
    `  <string>${APP_NAME}</string>`,
    '  <key>CFBundleDisplayName</key>',
    `  <string>${APP_NAME}</string>`,
    '  <key>CFBundleIdentifier</key>',
    '  <string>dev.fervon.lookspan</string>',
    '  <key>CFBundleExecutable</key>',
    '  <string>lookspan</string>',
    '  <key>CFBundlePackageType</key>',
    '  <string>APPL</string>',
    '  <key>LSUIElement</key>',
    '  <true/>',
    '</dict>',
    '</plist>',
    '',
  ].join('\n');
}

/**
 * WScript.Shell is the only way to author a .lnk without a native dependency.
 * WindowStyle 7 starts the console minimized: the process stays visible in the
 * taskbar so the user has an obvious way to stop it, without a window in the
 * way.
 */
export function buildWindowsScript(shortcutPaths: string[], input: DesktopInput): string {
  const args = [input.cliPath, ...withOpenFlag(input.args)]
    .map((a) => (a.includes(' ') ? `"${a}"` : a))
    .join(' ');
  const lines = ['$shell = New-Object -ComObject WScript.Shell'];
  for (const [i, path] of shortcutPaths.entries()) {
    lines.push(
      `$s${i} = $shell.CreateShortcut(${psQuote(path)})`,
      `$s${i}.TargetPath = ${psQuote(input.execPath)}`,
      `$s${i}.Arguments = ${psQuote(args)}`,
      `$s${i}.WorkingDirectory = ${psQuote(input.home)}`,
      `$s${i}.Description = ${psQuote(APP_COMMENT)}`,
      `$s${i}.WindowStyle = 7`,
      `$s${i}.Save()`,
    );
  }
  return lines.join('\n');
}

/** Decide every path and payload for the current platform. */
export function desktopPlan(input: DesktopInput): DesktopPlan {
  const platform = supportedPlatform(input.platform);
  if (!platform) throw new Error(`unsupported platform: ${input.platform}`);

  if (platform === 'linux') {
    const path = join(input.home, '.local', 'share', 'applications', 'lookspan.desktop');
    return {
      platform,
      files: [{ path, content: buildLinuxEntry(input), executable: true }],
      removes: [path],
    };
  }

  if (platform === 'darwin') {
    const bundle = join(input.home, 'Applications', `${APP_NAME}.app`);
    return {
      platform,
      files: [
        { path: join(bundle, 'Contents', 'Info.plist'), content: buildMacPlist() },
        {
          path: join(bundle, 'Contents', 'MacOS', 'lookspan'),
          content: buildMacLauncher(input),
          executable: true,
        },
      ],
      removes: [bundle],
    };
  }

  const shortcuts = [
    join(input.home, 'Desktop', `${APP_NAME}.lnk`),
    join(
      input.home,
      'AppData',
      'Roaming',
      'Microsoft',
      'Windows',
      'Start Menu',
      'Programs',
      `${APP_NAME}.lnk`,
    ),
  ];
  return {
    platform,
    files: [],
    removes: shortcuts,
    powershell: buildWindowsScript(shortcuts, input),
  };
}

/** Write the plan to disk. Returns the paths the user can now click. */
export async function installDesktop(input: DesktopInput): Promise<string[]> {
  const plan = desktopPlan(input);

  for (const file of plan.files) {
    mkdirSync(join(file.path, '..'), { recursive: true });
    writeFileSync(file.path, file.content ?? '', 'utf8');
    if (file.executable) chmodSync(file.path, 0o755);
  }

  if (plan.powershell) {
    for (const path of plan.removes) mkdirSync(join(path, '..'), { recursive: true });
    await runPowerShell(plan.powershell);
  }

  return plan.removes;
}

/** Remove whatever `installDesktop` created. Missing entries are not an error. */
export function uninstallDesktop(input: DesktopInput): string[] {
  const plan = desktopPlan(input);
  for (const path of plan.removes) rmSync(path, { recursive: true, force: true });
  return plan.removes;
}

async function runPowerShell(script: string): Promise<void> {
  const { execFile } = await import('node:child_process');
  await new Promise<void>((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      (err, _stdout, stderr) => {
        if (err) reject(new Error(stderr?.trim() || err.message));
        else resolve();
      },
    );
  });
}

/** Default input for the running process. */
export function currentDesktopInput(cliPath: string, args: string[]): DesktopInput {
  return {
    platform: process.platform,
    home: homedir(),
    execPath: process.execPath,
    cliPath,
    args,
  };
}
