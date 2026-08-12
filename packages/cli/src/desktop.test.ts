import { describe, expect, it } from 'vitest';
import {
  buildLinuxEntry,
  buildMacLauncher,
  buildMacPlist,
  buildWindowsScript,
  type DesktopInput,
  desktopPlan,
  isEphemeralInstall,
  supportedPlatform,
  withOpenFlag,
} from './desktop.js';

const base = (over: Partial<DesktopInput> = {}): DesktopInput => ({
  platform: 'linux',
  home: '/home/jo',
  execPath: '/usr/bin/node',
  cliPath: '/opt/lookspan/dist/index.js',
  args: [],
  ...over,
});

describe('isEphemeralInstall', () => {
  it('flags the npx cache on both slash styles', () => {
    expect(
      isEphemeralInstall('/home/jo/.npm/_npx/abc123/node_modules/lookspan/dist/index.js'),
    ).toBe(true);
    expect(
      isEphemeralInstall('C:\\Users\\jo\\AppData\\Local\\npm-cache\\_npx\\a1\\node_modules\\l.js'),
    ).toBe(true);
  });

  it('accepts a real global install', () => {
    expect(isEphemeralInstall('/usr/lib/node_modules/lookspan/dist/index.js')).toBe(false);
    expect(
      isEphemeralInstall('C:\\Program Files\\nodejs\\node_modules\\lookspan\\dist\\index.js'),
    ).toBe(false);
  });
});

describe('supportedPlatform', () => {
  it('accepts the three desktop platforms and rejects the rest', () => {
    expect(supportedPlatform('win32')).toBe('win32');
    expect(supportedPlatform('darwin')).toBe('darwin');
    expect(supportedPlatform('linux')).toBe('linux');
    expect(supportedPlatform('aix')).toBeNull();
  });
});

describe('withOpenFlag', () => {
  it('adds --open so clicking the icon actually shows the dashboard', () => {
    expect(withOpenFlag([])).toEqual(['--open']);
    expect(withOpenFlag(['--port', '3200'])).toEqual(['--port', '3200', '--open']);
  });

  it('does not duplicate one the user already passed', () => {
    expect(withOpenFlag(['--open'])).toEqual(['--open']);
  });
});

describe('buildLinuxEntry', () => {
  it('runs without a terminal window', () => {
    expect(buildLinuxEntry(base())).toContain('Terminal=false');
  });

  it('bakes the extra flags into Exec', () => {
    const entry = buildLinuxEntry(base({ args: ['--port', '3200'] }));
    expect(entry).toContain(
      "Exec='/usr/bin/node' '/opt/lookspan/dist/index.js' '--port' '3200' '--open'",
    );
  });

  it('quotes paths containing spaces', () => {
    const entry = buildLinuxEntry(base({ cliPath: '/opt/my apps/lookspan/index.js' }));
    expect(entry).toContain("'/opt/my apps/lookspan/index.js'");
  });
});

describe('buildMacLauncher', () => {
  it('is an exec-ing shell script', () => {
    const script = buildMacLauncher(base({ platform: 'darwin' }));
    expect(script.startsWith('#!/bin/sh\n')).toBe(true);
    expect(script).toContain("exec '/usr/bin/node' '/opt/lookspan/dist/index.js' '--open'");
  });

  it('escapes a single quote in a path instead of breaking out of the string', () => {
    const script = buildMacLauncher(base({ cliPath: "/opt/jo's/index.js" }));
    expect(script).toContain(`'/opt/jo'\\''s/index.js'`);
  });
});

describe('buildMacPlist', () => {
  it('names the bundle executable that desktopPlan writes', () => {
    expect(buildMacPlist()).toContain('<key>CFBundleExecutable</key>');
    expect(buildMacPlist()).toContain('<string>lookspan</string>');
  });
});

describe('buildWindowsScript', () => {
  const input = base({ platform: 'win32', home: 'C:\\Users\\jo', execPath: 'C:\\node.exe' });

  it('creates one shortcut per path, minimized', () => {
    const script = buildWindowsScript(['C:\\a.lnk', 'C:\\b.lnk'], input);
    expect(script.match(/CreateShortcut/g)).toHaveLength(2);
    expect(script.match(/WindowStyle = 7/g)).toHaveLength(2);
    expect(script.match(/\.Save\(\)/g)).toHaveLength(2);
  });

  it('doubles single quotes so a path cannot terminate the PowerShell string', () => {
    const script = buildWindowsScript(["C:\\jo's\\a.lnk"], input);
    expect(script).toContain("CreateShortcut('C:\\jo''s\\a.lnk')");
  });

  it('quotes only the arguments that contain spaces', () => {
    const script = buildWindowsScript(['C:\\a.lnk'], {
      ...input,
      cliPath: 'C:\\Program Files\\lookspan\\index.js',
      args: ['--port', '3200'],
    });
    expect(script).toContain(
      `$s0.Arguments = '"C:\\Program Files\\lookspan\\index.js" --port 3200 --open'`,
    );
  });
});

describe('desktopPlan', () => {
  it('writes a .desktop file under ~/.local/share/applications on Linux', () => {
    const plan = desktopPlan(base());
    expect(plan.platform).toBe('linux');
    expect(plan.files).toHaveLength(1);
    expect(plan.files[0]?.path.replace(/\\/g, '/')).toBe(
      '/home/jo/.local/share/applications/lookspan.desktop',
    );
    expect(plan.powershell).toBeUndefined();
  });

  it('builds an .app bundle on macOS and removes the whole bundle', () => {
    const plan = desktopPlan(base({ platform: 'darwin' }));
    const paths = plan.files.map((f) => f.path.replace(/\\/g, '/'));
    expect(paths).toContain('/home/jo/Applications/Lookspan.app/Contents/Info.plist');
    expect(paths).toContain('/home/jo/Applications/Lookspan.app/Contents/MacOS/lookspan');
    expect(plan.files.find((f) => f.path.endsWith('lookspan'))?.executable).toBe(true);
    expect(plan.removes.map((p) => p.replace(/\\/g, '/'))).toEqual([
      '/home/jo/Applications/Lookspan.app',
    ]);
  });

  it('targets Desktop and the Start Menu on Windows, with no files of its own', () => {
    const plan = desktopPlan(base({ platform: 'win32', home: 'C:\\Users\\jo' }));
    expect(plan.files).toEqual([]);
    expect(plan.powershell).toBeTruthy();
    const removes = plan.removes.map((p) => p.replace(/\\/g, '/'));
    expect(removes[0]).toBe('C:/Users/jo/Desktop/Lookspan.lnk');
    expect(removes[1]).toContain('Start Menu/Programs/Lookspan.lnk');
  });

  it('refuses a platform with no desktop', () => {
    expect(() => desktopPlan(base({ platform: 'aix' }))).toThrow(/unsupported platform/);
  });

  it('every plan removes exactly what it creates', () => {
    for (const platform of ['linux', 'darwin'] as const) {
      const plan = desktopPlan(base({ platform }));
      for (const file of plan.files) {
        expect(plan.removes.some((r) => file.path.startsWith(r))).toBe(true);
      }
    }
  });
});
