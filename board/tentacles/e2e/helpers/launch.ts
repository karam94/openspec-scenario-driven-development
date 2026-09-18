import { test as base, expect, _electron, type ElectronApplication, type Page } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// board/tentacles/ — the app root (package.json main = build/main/main.js).
const APP_ROOT = path.resolve(__dirname, "..", "..");
const FIXTURES = path.join(APP_ROOT, "e2e", "fixtures");
const STUB_BIN = path.join(FIXTURES, "bin");
const FIXTURE_REPOS = path.join(FIXTURES, "repos");

export interface HermeticApp {
  electronApp: ElectronApplication;
  page: Page;
  // Absolute path of this test's stub invocation log; readStubLog() returns its text.
  stubLog: string;
  readStubLog: () => string;
}

export const test = base.extend<{ app: HermeticApp }>({
  app: async ({}, use, testInfo) => {
    const stubLog = path.join(
      os.tmpdir(),
      `tentacles-e2e-${testInfo.testId}-${Date.now()}.log`
    );
    fs.writeFileSync(stubLog, "");

    // Isolated settings file per test so a persisted scan root never leaks across
    // tests (a leaked root would override the injected TENTACLES_ROOT below).
    const settingsFile = path.join(
      os.tmpdir(),
      `tentacles-e2e-settings-${testInfo.testId}-${Date.now()}.json`
    );

    // On a normal macOS login session Electron launches under its OS sandbox as a
    // user runs it. On a restricted/headless host (CI, a sandboxed shell) that OS
    // sandbox can't initialise, so opt in to --no-sandbox there via E2E_NO_SANDBOX.
    // This flag does not change the app's per-window webPreferences.sandbox (still
    // true — the secure-posture scenario asserts that), only the process sandbox.
    const extraArgs = process.env.E2E_NO_SANDBOX ? ["--no-sandbox", "--disable-gpu"] : [];

    const electronApp = await _electron.launch({
      args: [".", ...extraArgs],
      cwd: APP_ROOT,
      env: {
        ...process.env,
        // Seam 1: scan the committed fixtures, not ~/Code.
        TENTACLES_ROOT: FIXTURE_REPOS,
        TENTACLES_DEPTH: "5",
        // Seam 2: skip login-shell PATH resolution so the stub-bin PATH below survives.
        TENTACLES_E2E: "1",
        // Isolated settings store for this test (absent until a Settings save writes it).
        TENTACLES_SETTINGS: settingsFile,
        // Stub bin FIRST so `openspec`/`gh` resolve to the stubs. If seam 2 regressed,
        // resolveShellPath would REPLACE PATH with the login shell's (no stub bin),
        // the real CLIs would run, and the stub log would stay empty.
        PATH: `${STUB_BIN}${path.delimiter}${process.env.PATH ?? ""}`,
        E2E_STUB_LOG: stubLog,
      },
    });

    const page = await electronApp.firstWindow();
    await page.waitForLoadState("domcontentloaded");

    await use({
      electronApp,
      page,
      stubLog,
      readStubLog: () => {
        try {
          return fs.readFileSync(stubLog, "utf8");
        } catch {
          return "";
        }
      },
    });

    await electronApp.close();
    try {
      fs.unlinkSync(stubLog);
    } catch {
      /* best effort */
    }
    try {
      fs.unlinkSync(settingsFile);
    } catch {
      /* best effort */
    }
  },
});

export { expect };
