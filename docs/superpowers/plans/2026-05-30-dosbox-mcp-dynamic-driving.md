# DOSBox-X MCP dynamic driving Implementation Plan

> **SUPERSEDED (2026-06-02):** the save-state / DOSBox-X-driving MCP path described here was replaced by the dosbox-pure live backend. See `IMPLEMENTATION_PLAN.md` / `tools/libretro/build-state.ts` and the MCP section of the repo-root `CLAUDE.md`. Retained as a historical record.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 5 currently-stubbed dynamic MCP tools (`dosbox_send_input`, `dosbox_send_key`, `dosbox_screenshot`, `dosbox_save_state`, `dosbox_load_state`) with real implementations that drive a visible DOSBox-X window via macOS CGEvent + DOSBox-X's built-in keyboard shortcuts.

**Architecture:** A small Swift helper binary (`wiz6-input-helper`) handles all macOS-native operations (CGEvent key injection, window discovery + focus). A TypeScript bridge spawns the helper as a child process and speaks JSON over stdio. Five TypeScript "operation" modules (`input.ts`, `window.ts`, `screenshot.ts`, `state.ts`, `helper-client.ts`) replace the stub bodies in `tools/control.ts` and `tools/snapshots.ts`. Closed-loop workflow: agent sends inputs → screenshot → save state to slot N → existing save-state-backed read tools (`dosbox_inspect_save`, `dosbox_read_struct`, etc.) decode the new state.

**Tech Stack:** Swift 5 (helper binary; CoreGraphics + ApplicationServices), TypeScript ESM, MCP SDK (`@modelcontextprotocol/sdk`), Vitest, Node child_process.

**Spec:** `docs/superpowers/specs/2026-05-30-dosbox-mcp-dynamic-driving-design.md`.

---

## File structure

**Create (Swift helper):**
- `packages/mcp/helper/Package.swift`
- `packages/mcp/helper/Sources/wiz6-input-helper/main.swift`
- `packages/mcp/helper/Sources/wiz6-input-helper/Protocol.swift`
- `packages/mcp/helper/Sources/wiz6-input-helper/KeyCodes.swift`
- `packages/mcp/helper/Sources/wiz6-input-helper/Input.swift`
- `packages/mcp/helper/Sources/wiz6-input-helper/Window.swift`
- `packages/mcp/helper/Tests/wiz6-input-helperTests/KeyCodesTests.swift`
- `packages/mcp/helper/Tests/wiz6-input-helperTests/ProtocolTests.swift`
- `packages/mcp/helper/README.md`
- `packages/mcp/helper/build.sh`
- `packages/mcp/bin/wiz6-input-helper` (binary artifact, after build)
- `packages/mcp/.gitignore` (additions for `helper/.build`)

**Create (TS bridge):**
- `packages/mcp/src/dosbox/helper-client.ts`
- `packages/mcp/src/dosbox/window.ts`
- `packages/mcp/src/dosbox/input.ts`
- `packages/mcp/src/dosbox/screenshot.ts`
- `packages/mcp/src/dosbox/state.ts`
- `packages/mcp/src/dosbox/captures-dir.ts`
- `packages/mcp/tests/dosbox/helper-client.test.ts`
- `packages/mcp/tests/dosbox/input.test.ts`
- `packages/mcp/tests/dosbox/screenshot.test.ts`
- `packages/mcp/tests/dosbox/state.test.ts`
- `packages/mcp/tests/dosbox/captures-dir.test.ts`
- `packages/mcp/tests/integration/spike-target.test.ts`

**Create (docs):**
- `packages/mcp/PERMISSIONS.md`

**Modify:**
- `packages/mcp/src/tools/control.ts` (replace `dosbox_send_input` + `dosbox_send_key` stubs with real impl; keep the other 7 stubs).
- `packages/mcp/src/tools/snapshots.ts` (replace `dosbox_screenshot`, `dosbox_save_state`, `dosbox_load_state` stubs with real impl).
- `packages/mcp/src/context.ts` (add `helperClient` lazy singleton).
- `packages/mcp/package.json` (add `build:helper` script, `test:integration` script).
- `TODO.md` (file follow-ups #063 / #064 / #065).

---

### Task 1: Swift helper package scaffold

**Files:**
- Create: `packages/mcp/helper/Package.swift`
- Create: `packages/mcp/helper/Sources/wiz6-input-helper/main.swift` (placeholder)
- Create: `packages/mcp/helper/README.md`
- Create: `packages/mcp/helper/build.sh`
- Create: `packages/mcp/helper/.gitignore`

- [ ] **Step 1: Create `Package.swift`**

```swift
// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "wiz6-input-helper",
    platforms: [.macOS(.v11)],
    targets: [
        .executableTarget(
            name: "wiz6-input-helper",
            path: "Sources/wiz6-input-helper",
            linkerSettings: [
                .linkedFramework("CoreGraphics"),
                .linkedFramework("ApplicationServices"),
                .linkedFramework("AppKit"),
            ]
        ),
        .testTarget(
            name: "wiz6-input-helperTests",
            dependencies: ["wiz6-input-helper"],
            path: "Tests/wiz6-input-helperTests"
        ),
    ]
)
```

- [ ] **Step 2: Create placeholder `main.swift`**

```swift
import Foundation

// JSON-over-stdio loop. One line in, one line out.
// Real commands ship in later tasks; this scaffold just echoes.
let stdin = FileHandle.standardInput
let stdout = FileHandle.standardOutput

while let line = readLine(strippingNewline: true) {
    if line.isEmpty { continue }
    let response = "{\"ok\":true,\"echo\":\(JSONString(line))}\n"
    stdout.write(response.data(using: .utf8)!)
}

private func JSONString(_ s: String) -> String {
    let data = try! JSONSerialization.data(withJSONObject: s, options: [.fragmentsAllowed])
    return String(data: data, encoding: .utf8)!
}
```

- [ ] **Step 3: Create `build.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
swift build -c release
mkdir -p ../bin
cp .build/release/wiz6-input-helper ../bin/wiz6-input-helper
echo "Built and installed: packages/mcp/bin/wiz6-input-helper"
```

Make executable: `chmod +x packages/mcp/helper/build.sh`.

- [ ] **Step 4: Create `.gitignore`**

```
.build/
.swiftpm/
```

- [ ] **Step 5: Create `README.md`**

```markdown
# wiz6-input-helper

Small Swift helper binary that performs macOS-native operations on behalf of the
wiz6 MCP server: CGEvent keyboard injection, window discovery, window focus.

## Building

```bash
./build.sh
```

Outputs `packages/mcp/bin/wiz6-input-helper`. The MCP server spawns this binary
on demand and communicates with it via JSON over stdio.

## Protocol

One JSON request per line on stdin, one JSON response per line on stdout. See
`Sources/wiz6-input-helper/Protocol.swift` for the schema.
```

- [ ] **Step 6: Build to verify scaffold compiles**

```bash
cd packages/mcp/helper && ./build.sh
```

Expected: `Built and installed: packages/mcp/bin/wiz6-input-helper`.

- [ ] **Step 7: Commit**

```bash
git add packages/mcp/helper packages/mcp/bin
git commit -m "feat(mcp-helper): Swift package scaffold with JSON-over-stdio loop"
```

---

### Task 2: Swift helper — Protocol module + tests

**Files:**
- Create: `packages/mcp/helper/Sources/wiz6-input-helper/Protocol.swift`
- Create: `packages/mcp/helper/Tests/wiz6-input-helperTests/ProtocolTests.swift`
- Modify: `packages/mcp/helper/Sources/wiz6-input-helper/main.swift`

- [ ] **Step 1: Create `Protocol.swift`**

```swift
import Foundation

/// A request from the MCP server.
public enum Request: Decodable {
    case ping
    case keyDown(keyCode: UInt16, flags: UInt64)
    case keyUp(keyCode: UInt16, flags: UInt64)
    case findWindow(appName: String)
    case focusWindow(windowId: UInt32)
    case getFrontmost
    case restoreFrontmost(bundleId: String)

    private enum CodingKeys: String, CodingKey {
        case op, keyCode, flags, appName, windowId, bundleId
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let op = try c.decode(String.self, forKey: .op)
        switch op {
        case "ping":
            self = .ping
        case "keyDown":
            self = .keyDown(
                keyCode: try c.decode(UInt16.self, forKey: .keyCode),
                flags: try c.decode(UInt64.self, forKey: .flags)
            )
        case "keyUp":
            self = .keyUp(
                keyCode: try c.decode(UInt16.self, forKey: .keyCode),
                flags: try c.decode(UInt64.self, forKey: .flags)
            )
        case "findWindow":
            self = .findWindow(appName: try c.decode(String.self, forKey: .appName))
        case "focusWindow":
            self = .focusWindow(windowId: try c.decode(UInt32.self, forKey: .windowId))
        case "getFrontmost":
            self = .getFrontmost
        case "restoreFrontmost":
            self = .restoreFrontmost(bundleId: try c.decode(String.self, forKey: .bundleId))
        default:
            throw DecodingError.dataCorruptedError(
                forKey: .op, in: c,
                debugDescription: "Unknown op: \(op)"
            )
        }
    }
}

/// A response back to the MCP server.
public struct Response: Encodable {
    public let ok: Bool
    public let error: String?
    public let windowId: UInt32?
    public let bundleId: String?

    public init(ok: Bool, error: String? = nil, windowId: UInt32? = nil, bundleId: String? = nil) {
        self.ok = ok
        self.error = error
        self.windowId = windowId
        self.bundleId = bundleId
    }

    public static func success() -> Response { Response(ok: true) }
    public static func failure(_ msg: String) -> Response { Response(ok: false, error: msg) }
}

public func decodeRequest(_ line: String) throws -> Request {
    guard let data = line.data(using: .utf8) else {
        throw DecodingError.dataCorrupted(
            DecodingError.Context(codingPath: [], debugDescription: "Invalid UTF-8")
        )
    }
    return try JSONDecoder().decode(Request.self, from: data)
}

public func encodeResponse(_ resp: Response) -> String {
    let encoder = JSONEncoder()
    encoder.outputFormatting = []
    let data = try! encoder.encode(resp)
    return String(data: data, encoding: .utf8)! + "\n"
}
```

- [ ] **Step 2: Create `ProtocolTests.swift`**

```swift
import XCTest
@testable import wiz6_input_helper

final class ProtocolTests: XCTestCase {
    func testDecodePing() throws {
        let req = try decodeRequest("{\"op\":\"ping\"}")
        guard case .ping = req else { return XCTFail("expected ping") }
    }

    func testDecodeKeyDown() throws {
        let req = try decodeRequest("{\"op\":\"keyDown\",\"keyCode\":36,\"flags\":0}")
        guard case .keyDown(let kc, let fl) = req else { return XCTFail("expected keyDown") }
        XCTAssertEqual(kc, 36)
        XCTAssertEqual(fl, 0)
    }

    func testDecodeFindWindow() throws {
        let req = try decodeRequest("{\"op\":\"findWindow\",\"appName\":\"dosbox-x\"}")
        guard case .findWindow(let name) = req else { return XCTFail("expected findWindow") }
        XCTAssertEqual(name, "dosbox-x")
    }

    func testDecodeUnknownOpThrows() {
        XCTAssertThrowsError(try decodeRequest("{\"op\":\"bogus\"}"))
    }

    func testEncodeSuccess() {
        let s = encodeResponse(.success())
        XCTAssertEqual(s, "{\"ok\":true}\n")
    }

    func testEncodeFailure() {
        let s = encodeResponse(.failure("oops"))
        // JSON key ordering may vary; assert presence not exact match
        XCTAssertTrue(s.contains("\"ok\":false"))
        XCTAssertTrue(s.contains("\"error\":\"oops\""))
    }

    func testEncodeWindowId() {
        let s = encodeResponse(Response(ok: true, windowId: 12345))
        XCTAssertTrue(s.contains("\"windowId\":12345"))
    }
}
```

- [ ] **Step 3: Replace `main.swift` with real dispatch loop**

```swift
import Foundation

let stdout = FileHandle.standardOutput

while let line = readLine(strippingNewline: true) {
    if line.isEmpty { continue }
    do {
        let req = try decodeRequest(line)
        let resp: Response
        switch req {
        case .ping:
            resp = .success()
        case .keyDown, .keyUp, .findWindow, .focusWindow, .getFrontmost, .restoreFrontmost:
            // Real handlers in later tasks.
            resp = .failure("not yet implemented")
        }
        stdout.write(encodeResponse(resp).data(using: .utf8)!)
    } catch {
        let err = encodeResponse(.failure("decode error: \(error)"))
        stdout.write(err.data(using: .utf8)!)
    }
}
```

- [ ] **Step 4: Run tests + build**

```bash
cd packages/mcp/helper
swift test
./build.sh
```

Expected: all ProtocolTests pass; build succeeds.

- [ ] **Step 5: Smoke the binary**

```bash
echo '{"op":"ping"}' | packages/mcp/bin/wiz6-input-helper
```

Expected output: `{"ok":true}`.

- [ ] **Step 6: Commit**

```bash
git add packages/mcp/helper packages/mcp/bin/wiz6-input-helper
git commit -m "feat(mcp-helper): JSON request/response protocol + tests"
```

---

### Task 3: Swift helper — KeyCodes module + tests

**Files:**
- Create: `packages/mcp/helper/Sources/wiz6-input-helper/KeyCodes.swift`
- Create: `packages/mcp/helper/Tests/wiz6-input-helperTests/KeyCodesTests.swift`

- [ ] **Step 1: Create `KeyCodes.swift`**

This file maps logical key names ("Enter", "ArrowDown", "Ctrl+F5", "a", "A") to (virtualKeyCode, flags) pairs. The mapping is needed in BOTH the Swift helper and the TS side — but since the helper accepts raw `keyCode` + `flags` from the TS layer, we put the canonical map in TypeScript and the Swift helper only stores constants for clarity in tests.

```swift
import Foundation

/// macOS virtual key codes for the keys this helper exercises in tests.
/// Authoritative TS-side map lives in `packages/mcp/src/dosbox/input.ts`.
public enum KeyCodes {
    public static let a: UInt16 = 0x00
    public static let returnKey: UInt16 = 0x24
    public static let escape: UInt16 = 0x35
    public static let arrowUp: UInt16 = 0x7E
    public static let arrowDown: UInt16 = 0x7D
    public static let arrowLeft: UInt16 = 0x7B
    public static let arrowRight: UInt16 = 0x7C
    public static let f5: UInt16 = 0x60
    public static let f4: UInt16 = 0x76
}

/// macOS CGEventFlags bits we care about. Names mirror CoreGraphics constants
/// without the framework dependency in this declarative module.
public enum KeyFlags {
    public static let none: UInt64 = 0
    public static let shift: UInt64 = 0x00020000
    public static let control: UInt64 = 0x00040000
    public static let option: UInt64 = 0x00080000
    public static let command: UInt64 = 0x00100000
}
```

- [ ] **Step 2: Create `KeyCodesTests.swift`**

```swift
import XCTest
@testable import wiz6_input_helper

final class KeyCodesTests: XCTestCase {
    func testReturnKey() {
        XCTAssertEqual(KeyCodes.returnKey, 0x24)
    }

    func testArrowDown() {
        XCTAssertEqual(KeyCodes.arrowDown, 0x7D)
    }

    func testF5() {
        XCTAssertEqual(KeyCodes.f5, 0x60)
    }

    func testFlagsControl() {
        XCTAssertEqual(KeyFlags.control, 0x00040000)
    }
}
```

- [ ] **Step 3: Run tests**

```bash
cd packages/mcp/helper && swift test
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add packages/mcp/helper
git commit -m "feat(mcp-helper): keyCodes + keyFlags constants"
```

---

### Task 4: Swift helper — Input module (CGEvent keyDown/keyUp)

**Files:**
- Create: `packages/mcp/helper/Sources/wiz6-input-helper/Input.swift`
- Modify: `packages/mcp/helper/Sources/wiz6-input-helper/main.swift`

- [ ] **Step 1: Create `Input.swift`**

```swift
import Foundation
import CoreGraphics

public enum InputError: Error {
    case eventCreationFailed
    case accessibilityDenied
}

/// Post a key-down CGEvent system-wide. Returns success or accessibility error.
public func postKeyDown(keyCode: UInt16, flags: UInt64) -> Response {
    guard let event = CGEvent(keyboardEventSource: nil, virtualKey: keyCode, keyDown: true) else {
        return .failure("CGEvent creation failed for keyDown \(keyCode)")
    }
    event.flags = CGEventFlags(rawValue: flags)
    event.post(tap: .cghidEventTap)
    return .success()
}

/// Post a key-up CGEvent system-wide.
public func postKeyUp(keyCode: UInt16, flags: UInt64) -> Response {
    guard let event = CGEvent(keyboardEventSource: nil, virtualKey: keyCode, keyDown: false) else {
        return .failure("CGEvent creation failed for keyUp \(keyCode)")
    }
    event.flags = CGEventFlags(rawValue: flags)
    event.post(tap: .cghidEventTap)
    return .success()
}
```

**Note about testing**: CGEvent post requires Accessibility permission and posts to the focused window. Unit-testing the actual post in CI is impractical — that's covered by the TS integration test (Task 14). This module is a thin wrapper; the testable surface is in `Protocol.swift` (already done) and `KeyCodes.swift` (already done).

- [ ] **Step 2: Wire `Input` into `main.swift`**

```swift
import Foundation

let stdout = FileHandle.standardOutput

while let line = readLine(strippingNewline: true) {
    if line.isEmpty { continue }
    do {
        let req = try decodeRequest(line)
        let resp: Response
        switch req {
        case .ping:
            resp = .success()
        case .keyDown(let kc, let fl):
            resp = postKeyDown(keyCode: kc, flags: fl)
        case .keyUp(let kc, let fl):
            resp = postKeyUp(keyCode: kc, flags: fl)
        case .findWindow, .focusWindow, .getFrontmost, .restoreFrontmost:
            resp = .failure("not yet implemented")
        }
        stdout.write(encodeResponse(resp).data(using: .utf8)!)
    } catch {
        let err = encodeResponse(.failure("decode error: \(error)"))
        stdout.write(err.data(using: .utf8)!)
    }
}
```

- [ ] **Step 3: Build + smoke**

```bash
cd packages/mcp/helper && ./build.sh
echo '{"op":"keyDown","keyCode":36,"flags":0}' | ../bin/wiz6-input-helper
```

Expected: `{"ok":true}`. Note: this actually presses Return system-wide — run from a context where that's safe (a terminal where Return just inserts a newline).

If you get `{"ok":false,"error":"CGEvent creation failed..."}`: you need to grant Accessibility permission to your terminal (System Settings → Privacy & Security → Accessibility → enable Terminal / iTerm / Claude Code).

- [ ] **Step 4: Commit**

```bash
git add packages/mcp/helper packages/mcp/bin/wiz6-input-helper
git commit -m "feat(mcp-helper): CGEvent keyDown/keyUp injection"
```

---

### Task 5: Swift helper — Window module (find + focus + restore)

**Files:**
- Create: `packages/mcp/helper/Sources/wiz6-input-helper/Window.swift`
- Modify: `packages/mcp/helper/Sources/wiz6-input-helper/main.swift`

- [ ] **Step 1: Create `Window.swift`**

```swift
import Foundation
import AppKit
import ApplicationServices

/// Find the first on-screen window owned by an app whose localized name
/// contains `appName` (case-insensitive). Returns the CGWindowID.
public func findWindow(appName: String) -> Response {
    let target = appName.lowercased()
    let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
    guard let infoList = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else {
        return .failure("CGWindowListCopyWindowInfo returned nil")
    }
    for info in infoList {
        guard let owner = info[kCGWindowOwnerName as String] as? String else { continue }
        if owner.lowercased().contains(target) {
            guard let windowId = info[kCGWindowNumber as String] as? UInt32 else { continue }
            return Response(ok: true, windowId: windowId)
        }
    }
    return .failure("no window matched appName=\(appName)")
}

/// Bring the app that owns `windowId` to the front.
public func focusWindow(windowId: UInt32) -> Response {
    let options: CGWindowListOption = [.optionIncludingWindow]
    guard let infoList = CGWindowListCopyWindowInfo(options, CGWindowID(windowId)) as? [[String: Any]],
          let info = infoList.first,
          let ownerPid = info[kCGWindowOwnerPID as String] as? Int32
    else {
        return .failure("window \(windowId) not found")
    }
    guard let app = NSRunningApplication(processIdentifier: pid_t(ownerPid)) else {
        return .failure("no running app for pid \(ownerPid)")
    }
    if app.activate(options: [.activateIgnoringOtherApps]) {
        return .success()
    }
    return .failure("activate() returned false for pid \(ownerPid)")
}

/// Return the bundle identifier of the currently-frontmost application.
public func getFrontmost() -> Response {
    guard let app = NSWorkspace.shared.frontmostApplication else {
        return .failure("no frontmost application")
    }
    return Response(ok: true, bundleId: app.bundleIdentifier)
}

/// Activate an application by its bundle identifier (restore prior focus).
public func restoreFrontmost(bundleId: String) -> Response {
    let running = NSRunningApplication.runningApplications(withBundleIdentifier: bundleId)
    guard let app = running.first else {
        return .failure("no running app with bundleId=\(bundleId)")
    }
    if app.activate(options: [.activateIgnoringOtherApps]) {
        return .success()
    }
    return .failure("activate() returned false for \(bundleId)")
}
```

- [ ] **Step 2: Wire `Window` into `main.swift`**

```swift
import Foundation

let stdout = FileHandle.standardOutput

while let line = readLine(strippingNewline: true) {
    if line.isEmpty { continue }
    do {
        let req = try decodeRequest(line)
        let resp: Response
        switch req {
        case .ping:
            resp = .success()
        case .keyDown(let kc, let fl):
            resp = postKeyDown(keyCode: kc, flags: fl)
        case .keyUp(let kc, let fl):
            resp = postKeyUp(keyCode: kc, flags: fl)
        case .findWindow(let name):
            resp = findWindow(appName: name)
        case .focusWindow(let wid):
            resp = focusWindow(windowId: wid)
        case .getFrontmost:
            resp = getFrontmost()
        case .restoreFrontmost(let bid):
            resp = restoreFrontmost(bundleId: bid)
        }
        stdout.write(encodeResponse(resp).data(using: .utf8)!)
    } catch {
        let err = encodeResponse(.failure("decode error: \(error)"))
        stdout.write(err.data(using: .utf8)!)
    }
}
```

- [ ] **Step 3: Build + smoke**

```bash
cd packages/mcp/helper && ./build.sh
echo '{"op":"findWindow","appName":"finder"}' | ../bin/wiz6-input-helper
```

Expected: `{"ok":true,"windowId":<some-id>}`. (Finder always has a window.)

- [ ] **Step 4: Commit**

```bash
git add packages/mcp/helper packages/mcp/bin/wiz6-input-helper
git commit -m "feat(mcp-helper): window find/focus + frontmost get/restore"
```

---

### Task 6: TS helper-client (spawn helper, JSON protocol)

**Files:**
- Create: `packages/mcp/src/dosbox/helper-client.ts`
- Create: `packages/mcp/tests/dosbox/helper-client.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { HelperClient } from '../../src/dosbox/helper-client.js';

// A fake "helper" that reads lines and echoes back canned responses. Used to
// unit-test HelperClient without the real Swift binary.
function spawnFakeHelper(): ReturnType<typeof spawn> {
  return spawn('node', ['-e', `
    process.stdin.setEncoding('utf8');
    let buf = '';
    process.stdin.on('data', chunk => {
      buf += chunk;
      let idx;
      while ((idx = buf.indexOf('\\n')) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        const req = JSON.parse(line);
        if (req.op === 'ping') process.stdout.write('{"ok":true}\\n');
        else if (req.op === 'findWindow') process.stdout.write('{"ok":true,"windowId":42}\\n');
        else process.stdout.write('{"ok":false,"error":"unknown"}\\n');
      }
    });
  `]);
}

describe('HelperClient', () => {
  let client: HelperClient | null = null;

  afterEach(async () => {
    if (client) await client.shutdown();
    client = null;
  });

  it('round-trips a ping', async () => {
    client = new HelperClient(spawnFakeHelper);
    const res = await client.send({ op: 'ping' });
    expect(res).toEqual({ ok: true });
  });

  it('returns windowId on findWindow', async () => {
    client = new HelperClient(spawnFakeHelper);
    const res = await client.send({ op: 'findWindow', appName: 'finder' });
    expect(res).toEqual({ ok: true, windowId: 42 });
  });

  it('propagates failure responses', async () => {
    client = new HelperClient(spawnFakeHelper);
    const res = await client.send({ op: 'bogus' as 'ping' });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('unknown');
  });
});
```

- [ ] **Step 2: Run test — expect failure**

```bash
pnpm --filter @wiz6/mcp test helper-client
```

Expected: import error, `helper-client.js` not found.

- [ ] **Step 3: Implement `helper-client.ts`**

```ts
/**
 * HelperClient — spawns the wiz6-input-helper Swift binary as a child process
 * and speaks line-delimited JSON over its stdio. The helper is long-lived for
 * the lifetime of the MCP server; a single instance handles many requests
 * sequentially.
 *
 * Spec: docs/superpowers/specs/2026-05-30-dosbox-mcp-dynamic-driving-design.md
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_HELPER_PATH = resolve(__dirname, '..', '..', 'bin', 'wiz6-input-helper');

export type HelperRequest =
  | { op: 'ping' }
  | { op: 'keyDown'; keyCode: number; flags: number }
  | { op: 'keyUp'; keyCode: number; flags: number }
  | { op: 'findWindow'; appName: string }
  | { op: 'focusWindow'; windowId: number }
  | { op: 'getFrontmost' }
  | { op: 'restoreFrontmost'; bundleId: string };

export interface HelperResponse {
  ok: boolean;
  error?: string;
  windowId?: number;
  bundleId?: string;
}

type SpawnFn = () => ChildProcess;

const DEFAULT_SPAWN: SpawnFn = () => spawn(DEFAULT_HELPER_PATH, [], { stdio: 'pipe' });

export class HelperClient {
  private child: ChildProcess | null = null;
  private buf = '';
  private pending: Array<(resp: HelperResponse) => void> = [];
  private spawnFn: SpawnFn;

  constructor(spawnFn: SpawnFn = DEFAULT_SPAWN) {
    this.spawnFn = spawnFn;
  }

  private ensureStarted(): void {
    if (this.child !== null) return;
    this.child = this.spawnFn();
    this.child.stdout?.setEncoding('utf8');
    this.child.stdout?.on('data', (chunk: string) => this.onData(chunk));
    this.child.on('error', (err) => {
      const resolver = this.pending.shift();
      if (resolver) resolver({ ok: false, error: `helper spawn error: ${err.message}` });
    });
  }

  private onData(chunk: string): void {
    this.buf += chunk;
    let idx;
    while ((idx = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, idx);
      this.buf = this.buf.slice(idx + 1);
      const resolver = this.pending.shift();
      if (!resolver) continue;
      try {
        resolver(JSON.parse(line) as HelperResponse);
      } catch (e) {
        resolver({ ok: false, error: `helper response parse error: ${(e as Error).message}` });
      }
    }
  }

  async send(req: HelperRequest): Promise<HelperResponse> {
    this.ensureStarted();
    return new Promise<HelperResponse>((resolve) => {
      this.pending.push(resolve);
      this.child!.stdin!.write(JSON.stringify(req) + '\n');
    });
  }

  async shutdown(): Promise<void> {
    if (this.child === null) return;
    this.child.stdin?.end();
    this.child.kill('SIGTERM');
    this.child = null;
    this.pending = [];
    this.buf = '';
  }
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
pnpm --filter @wiz6/mcp test helper-client
```

Expected: 3/3 green.

- [ ] **Step 5: Commit**

```bash
git add packages/mcp/src/dosbox/helper-client.ts packages/mcp/tests/dosbox/helper-client.test.ts
git commit -m "feat(mcp): HelperClient — spawn Swift helper + JSON stdio protocol"
```

---

### Task 7: TS input layer (key-name resolver, sendKey, sendMacro)

**Files:**
- Create: `packages/mcp/src/dosbox/input.ts`
- Create: `packages/mcp/tests/dosbox/input.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { resolveKey, parseMacro, sendKey, sendMacro } from '../../src/dosbox/input.js';
import type { HelperClient, HelperResponse } from '../../src/dosbox/helper-client.js';

describe('resolveKey', () => {
  it('maps "Enter" to keyCode 36 with no flags', () => {
    expect(resolveKey('Enter')).toEqual({ keyCode: 0x24, flags: 0 });
  });

  it('maps "ArrowDown" to keyCode 125', () => {
    expect(resolveKey('ArrowDown')).toEqual({ keyCode: 0x7d, flags: 0 });
  });

  it('maps lowercase "a" to keyCode 0 no shift', () => {
    expect(resolveKey('a')).toEqual({ keyCode: 0x00, flags: 0 });
  });

  it('maps uppercase "A" to keyCode 0 with shift', () => {
    expect(resolveKey('A')).toEqual({ keyCode: 0x00, flags: 0x00020000 });
  });

  it('parses "Ctrl+F5" with control modifier', () => {
    expect(resolveKey('Ctrl+F5')).toEqual({ keyCode: 0x60, flags: 0x00040000 });
  });

  it('parses "Alt+F5" with option modifier', () => {
    expect(resolveKey('Alt+F5')).toEqual({ keyCode: 0x60, flags: 0x00080000 });
  });

  it('throws on unknown key name', () => {
    expect(() => resolveKey('Zog')).toThrow(/unknown key/);
  });
});

describe('parseMacro', () => {
  it('splits a space-separated macro into key names', () => {
    expect(parseMacro('down down enter')).toEqual(['ArrowDown', 'ArrowDown', 'Enter']);
  });

  it('preserves modifier-key compounds intact', () => {
    expect(parseMacro('Ctrl+F5 enter')).toEqual(['Ctrl+F5', 'Enter']);
  });

  it('expands a quoted "type" macro into per-character keys', () => {
    expect(parseMacro('"abc"')).toEqual(['a', 'b', 'c']);
  });
});

describe('sendKey', () => {
  it('sends keyDown then keyUp via the helper', async () => {
    const calls: unknown[] = [];
    const fake: Partial<HelperClient> = {
      send: vi.fn(async (req): Promise<HelperResponse> => {
        calls.push(req);
        return { ok: true };
      }),
    };
    await sendKey(fake as HelperClient, 'Enter');
    expect(calls).toEqual([
      { op: 'keyDown', keyCode: 0x24, flags: 0 },
      { op: 'keyUp', keyCode: 0x24, flags: 0 },
    ]);
  });
});

describe('sendMacro', () => {
  it('iterates keys with bounded inter-key delay', async () => {
    const calls: unknown[] = [];
    const fake: Partial<HelperClient> = {
      send: vi.fn(async (req): Promise<HelperResponse> => {
        calls.push(req);
        return { ok: true };
      }),
    };
    await sendMacro(fake as HelperClient, 'down enter', { interKeyDelayMs: 0 });
    expect(calls).toEqual([
      { op: 'keyDown', keyCode: 0x7d, flags: 0 },
      { op: 'keyUp', keyCode: 0x7d, flags: 0 },
      { op: 'keyDown', keyCode: 0x24, flags: 0 },
      { op: 'keyUp', keyCode: 0x24, flags: 0 },
    ]);
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
pnpm --filter @wiz6/mcp test dosbox/input
```

Expected: import error.

- [ ] **Step 3: Implement `input.ts`**

```ts
/**
 * Input layer — resolves logical key names to macOS virtual key codes + flags,
 * sends key events via the Swift helper.
 *
 * Spec: docs/superpowers/specs/2026-05-30-dosbox-mcp-dynamic-driving-design.md
 */

import type { HelperClient } from './helper-client.js';

const FLAG_SHIFT = 0x00020000;
const FLAG_CONTROL = 0x00040000;
const FLAG_OPTION = 0x00080000;
const FLAG_COMMAND = 0x00100000;

const MODIFIER_FLAGS: Record<string, number> = {
  Shift: FLAG_SHIFT,
  Ctrl: FLAG_CONTROL,
  Control: FLAG_CONTROL,
  Alt: FLAG_OPTION,
  Option: FLAG_OPTION,
  Cmd: FLAG_COMMAND,
  Command: FLAG_COMMAND,
};

// Map of logical key names → macOS virtual key codes. Authoritative for the project.
const KEY_CODES: Record<string, number> = {
  Enter: 0x24,
  Return: 0x24,
  Tab: 0x30,
  Space: 0x31,
  Backspace: 0x33,
  Escape: 0x35,
  ArrowUp: 0x7e,
  ArrowDown: 0x7d,
  ArrowLeft: 0x7b,
  ArrowRight: 0x7c,
  F1: 0x7a, F2: 0x78, F3: 0x63, F4: 0x76, F5: 0x60, F6: 0x61,
  F7: 0x62, F8: 0x64, F9: 0x65, F10: 0x6d, F11: 0x67, F12: 0x6f,
  // Letters
  a: 0x00, b: 0x0b, c: 0x08, d: 0x02, e: 0x0e, f: 0x03, g: 0x05,
  h: 0x04, i: 0x22, j: 0x26, k: 0x28, l: 0x25, m: 0x2e, n: 0x2d,
  o: 0x1f, p: 0x23, q: 0x0c, r: 0x0f, s: 0x01, t: 0x11, u: 0x20,
  v: 0x09, w: 0x0d, x: 0x07, y: 0x10, z: 0x06,
  // Digits
  '0': 0x1d, '1': 0x12, '2': 0x13, '3': 0x14, '4': 0x15,
  '5': 0x17, '6': 0x16, '7': 0x1a, '8': 0x1c, '9': 0x19,
};

// Short macro aliases — case-insensitive.
const MACRO_ALIASES: Record<string, string> = {
  down: 'ArrowDown',
  up: 'ArrowUp',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  enter: 'Enter',
  return: 'Return',
  esc: 'Escape',
  escape: 'Escape',
  tab: 'Tab',
  space: 'Space',
  backspace: 'Backspace',
};

export interface ResolvedKey {
  keyCode: number;
  flags: number;
}

export function resolveKey(spec: string): ResolvedKey {
  // Split modifier+key, e.g. "Ctrl+F5" → ["Ctrl", "F5"].
  const parts = spec.split('+');
  const keyName = parts[parts.length - 1]!;
  const modifierParts = parts.slice(0, -1);
  let flags = 0;
  for (const m of modifierParts) {
    const f = MODIFIER_FLAGS[m];
    if (f === undefined) throw new Error(`unknown modifier: ${m}`);
    flags |= f;
  }
  // Letter case → implicit shift for uppercase ASCII letters.
  if (keyName.length === 1 && keyName >= 'A' && keyName <= 'Z') {
    const kc = KEY_CODES[keyName.toLowerCase()];
    if (kc === undefined) throw new Error(`unknown key: ${keyName}`);
    return { keyCode: kc, flags: flags | FLAG_SHIFT };
  }
  const kc = KEY_CODES[keyName];
  if (kc === undefined) throw new Error(`unknown key: ${keyName}`);
  return { keyCode: kc, flags };
}

export function parseMacro(macro: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < macro.length) {
    // Skip whitespace.
    while (i < macro.length && /\s/.test(macro[i]!)) i++;
    if (i >= macro.length) break;
    // Quoted "type" segment → expand to per-character keys.
    if (macro[i] === '"') {
      i++;
      while (i < macro.length && macro[i] !== '"') {
        tokens.push(macro[i]!);
        i++;
      }
      if (macro[i] === '"') i++;
      continue;
    }
    // Whitespace-delimited token.
    let j = i;
    while (j < macro.length && !/\s/.test(macro[j]!)) j++;
    const tok = macro.slice(i, j);
    i = j;
    // Case-insensitive alias lookup.
    const aliased = MACRO_ALIASES[tok.toLowerCase()];
    tokens.push(aliased ?? tok);
  }
  return tokens;
}

export interface SendMacroOptions {
  interKeyDelayMs?: number;
}

export async function sendKey(client: HelperClient, spec: string): Promise<void> {
  const { keyCode, flags } = resolveKey(spec);
  const down = await client.send({ op: 'keyDown', keyCode, flags });
  if (!down.ok) throw new Error(`sendKey: keyDown failed: ${down.error ?? '?'}`);
  const up = await client.send({ op: 'keyUp', keyCode, flags });
  if (!up.ok) throw new Error(`sendKey: keyUp failed: ${up.error ?? '?'}`);
}

export async function sendMacro(
  client: HelperClient,
  macro: string,
  opts: SendMacroOptions = {},
): Promise<void> {
  const delayMs = opts.interKeyDelayMs ?? 30;
  const keys = parseMacro(macro);
  for (const k of keys) {
    await sendKey(client, k);
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
pnpm --filter @wiz6/mcp test dosbox/input
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/mcp/src/dosbox/input.ts packages/mcp/tests/dosbox/input.test.ts
git commit -m "feat(mcp): input layer — key-name resolver + sendKey/sendMacro"
```

---

### Task 8: TS window layer (find + focus + scoped focus block)

**Files:**
- Create: `packages/mcp/src/dosbox/window.ts`
- (Tests are integration-only — the find/focus calls require a real DOSBox-X window. Unit testing reduces to mocking the HelperClient.)

- [ ] **Step 1: Write a unit test that exercises the focus-block contract**

```ts
import { describe, it, expect, vi } from 'vitest';
import { withFocusedDosbox, DOSBOX_APP_NAME } from '../../src/dosbox/window.js';
import type { HelperClient, HelperResponse } from '../../src/dosbox/helper-client.js';

describe('withFocusedDosbox', () => {
  it('finds + focuses the DOSBox-X window, runs the body, then restores prior focus', async () => {
    const calls: unknown[] = [];
    const responses: HelperResponse[] = [
      { ok: true, bundleId: 'com.apple.Terminal' },     // getFrontmost
      { ok: true, windowId: 7 },                         // findWindow
      { ok: true },                                      // focusWindow
      { ok: true },                                      // (no-op from body)
      { ok: true },                                      // restoreFrontmost
    ];
    const fake: Partial<HelperClient> = {
      send: vi.fn(async (req) => {
        calls.push(req);
        return responses.shift()!;
      }),
    };
    let bodyRan = false;
    await withFocusedDosbox(fake as HelperClient, async () => {
      bodyRan = true;
    });
    expect(bodyRan).toBe(true);
    expect(calls[0]).toEqual({ op: 'getFrontmost' });
    expect(calls[1]).toEqual({ op: 'findWindow', appName: DOSBOX_APP_NAME });
    expect(calls[2]).toEqual({ op: 'focusWindow', windowId: 7 });
    expect(calls[3]).toEqual({ op: 'restoreFrontmost', bundleId: 'com.apple.Terminal' });
  });

  it('restores prior focus even if body throws', async () => {
    const calls: unknown[] = [];
    const responses: HelperResponse[] = [
      { ok: true, bundleId: 'com.apple.Terminal' },
      { ok: true, windowId: 7 },
      { ok: true },
      { ok: true },
    ];
    const fake: Partial<HelperClient> = {
      send: vi.fn(async (req) => {
        calls.push(req);
        return responses.shift()!;
      }),
    };
    await expect(
      withFocusedDosbox(fake as HelperClient, async () => { throw new Error('boom'); })
    ).rejects.toThrow('boom');
    // restoreFrontmost still called (last entry).
    expect(calls[calls.length - 1]).toEqual({
      op: 'restoreFrontmost',
      bundleId: 'com.apple.Terminal',
    });
  });

  it('throws actionable error when DOSBox window not found', async () => {
    const fake: Partial<HelperClient> = {
      send: vi.fn(async (req) => {
        if ((req as { op: string }).op === 'getFrontmost') return { ok: true, bundleId: 'com.apple.Terminal' };
        if ((req as { op: string }).op === 'findWindow') return { ok: false, error: 'no window matched' };
        return { ok: true };
      }),
    };
    await expect(withFocusedDosbox(fake as HelperClient, async () => {})).rejects.toThrow(/DOSBox-X not running/);
  });
});
```

- [ ] **Step 2: Run — expect failure**

- [ ] **Step 3: Implement `window.ts`**

```ts
/**
 * Window layer — locate the DOSBox-X window, bring it to front, and restore
 * prior focus around an operation. All operations go through the Swift helper.
 *
 * Spec: docs/superpowers/specs/2026-05-30-dosbox-mcp-dynamic-driving-design.md
 */

import type { HelperClient } from './helper-client.js';

/** App-name substring the helper matches (case-insensitive). */
export const DOSBOX_APP_NAME = 'dosbox-x';

/**
 * Run `body` with the DOSBox-X window focused. On entry: capture the current
 * frontmost app, find the DOSBox-X window, focus it. On exit (success or
 * error): restore the prior frontmost app.
 *
 * Throws an actionable error if DOSBox-X isn't running or its window isn't
 * findable.
 */
export async function withFocusedDosbox<T>(
  client: HelperClient,
  body: () => Promise<T>,
): Promise<T> {
  const fm = await client.send({ op: 'getFrontmost' });
  if (!fm.ok) throw new Error(`withFocusedDosbox: getFrontmost failed: ${fm.error ?? '?'}`);
  const priorBundle = fm.bundleId;
  const fw = await client.send({ op: 'findWindow', appName: DOSBOX_APP_NAME });
  if (!fw.ok || fw.windowId === undefined) {
    throw new Error(
      `DOSBox-X not running or window not visible — call dosbox_launch first, or un-minimize the window.`,
    );
  }
  const focus = await client.send({ op: 'focusWindow', windowId: fw.windowId });
  if (!focus.ok) throw new Error(`withFocusedDosbox: focusWindow failed: ${focus.error ?? '?'}`);
  try {
    return await body();
  } finally {
    if (priorBundle !== undefined) {
      // Best-effort restore; don't mask body errors.
      await client.send({ op: 'restoreFrontmost', bundleId: priorBundle }).catch(() => {});
    }
  }
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/mcp/src/dosbox/window.ts packages/mcp/tests/dosbox/window.test.ts
git commit -m "feat(mcp): window layer — focus + restore-around scope"
```

---

### Task 9: TS captures-dir resolver

**Files:**
- Create: `packages/mcp/src/dosbox/captures-dir.ts`
- Create: `packages/mcp/tests/dosbox/captures-dir.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveCapturesDir } from '../../src/dosbox/captures-dir.js';

describe('resolveCapturesDir', () => {
  it('reads `[render] captures=` from a wiz6.conf file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wiz6-captures-test-'));
    try {
      const conf = join(dir, 'wiz6.conf');
      writeFileSync(conf, [
        '[sdl]',
        'output = opengl',
        '',
        '[render]',
        'captures = /tmp/my-captures',
        'aspect = true',
      ].join('\n'));
      expect(resolveCapturesDir(conf)).toBe('/tmp/my-captures');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns default ~/Documents/DOSBox-X if no captures= line', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wiz6-captures-test-'));
    try {
      const conf = join(dir, 'wiz6.conf');
      writeFileSync(conf, '[render]\naspect = true\n');
      const got = resolveCapturesDir(conf);
      expect(got).toMatch(/Documents\/DOSBox-X$/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws if conf file is missing', () => {
    expect(() => resolveCapturesDir('/no/such/file.conf')).toThrow(/captures path/);
  });
});
```

- [ ] **Step 2: Run — expect failure**

- [ ] **Step 3: Implement `captures-dir.ts`**

```ts
/**
 * Locate the directory where DOSBox-X writes screenshot captures. Reads
 * `[render] captures=` from a wiz6.conf-style ini file; falls back to the
 * DOSBox-X default `~/Documents/DOSBox-X`.
 *
 * Spec: docs/superpowers/specs/2026-05-30-dosbox-mcp-dynamic-driving-design.md
 */

import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_CAPTURES_DIR = join(homedir(), 'Documents', 'DOSBox-X');

export function resolveCapturesDir(confPath: string): string {
  if (!existsSync(confPath)) {
    throw new Error(`captures path: wiz6.conf not found at ${confPath}`);
  }
  const lines = readFileSync(confPath, 'utf-8').split('\n');
  let inRender = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('[') && line.endsWith(']')) {
      inRender = line === '[render]';
      continue;
    }
    if (!inRender) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (key === 'captures') return value;
  }
  return DEFAULT_CAPTURES_DIR;
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/mcp/src/dosbox/captures-dir.ts packages/mcp/tests/dosbox/captures-dir.test.ts
git commit -m "feat(mcp): captures-dir resolver from wiz6.conf"
```

---

### Task 10: TS screenshot layer

**Files:**
- Create: `packages/mcp/src/dosbox/screenshot.ts`
- Create: `packages/mcp/tests/dosbox/screenshot.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { findNewestPngSince, captureScreenshot } from '../../src/dosbox/screenshot.js';
import type { HelperClient, HelperResponse } from '../../src/dosbox/helper-client.js';

describe('findNewestPngSince', () => {
  it('returns the newest .png with mtime > since', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wiz6-screenshot-test-'));
    try {
      const older = join(dir, 'a.png');
      const newer = join(dir, 'b.png');
      writeFileSync(older, 'old');
      writeFileSync(newer, 'new');
      const now = Date.now() / 1000;
      utimesSync(older, now - 100, now - 100);
      utimesSync(newer, now, now);
      const sinceMs = (now - 50) * 1000;
      expect(findNewestPngSince(dir, sinceMs)).toBe(newer);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns null when no .png is newer than `since`', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wiz6-screenshot-test-'));
    try {
      const f = join(dir, 'a.png');
      writeFileSync(f, 'x');
      utimesSync(f, 0, 0);
      expect(findNewestPngSince(dir, Date.now())).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('captureScreenshot', () => {
  it('focuses DOSBox, sends Ctrl+F5, returns the newest PNG bytes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wiz6-screenshot-test-'));
    try {
      const calls: unknown[] = [];
      const fake: Partial<HelperClient> = {
        send: vi.fn(async (req): Promise<HelperResponse> => {
          calls.push(req);
          if ((req as { op: string }).op === 'getFrontmost') return { ok: true, bundleId: 'com.apple.Terminal' };
          if ((req as { op: string }).op === 'findWindow') return { ok: true, windowId: 1 };
          // Simulate DOSBox writing a PNG when keyDown F5+Ctrl arrives.
          if ((req as { op: string }).op === 'keyDown') {
            const png = join(dir, 'snap.png');
            // PNG signature so the bytes look valid.
            writeFileSync(png, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
          }
          return { ok: true };
        }),
      };
      const bytes = await captureScreenshot(fake as HelperClient, dir, { pollIntervalMs: 5, timeoutMs: 1000 });
      expect(bytes).toBeInstanceOf(Buffer);
      expect(bytes.slice(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('times out with actionable error when no PNG appears', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wiz6-screenshot-test-'));
    try {
      const fake: Partial<HelperClient> = {
        send: vi.fn(async (req): Promise<HelperResponse> => {
          if ((req as { op: string }).op === 'getFrontmost') return { ok: true, bundleId: 'com.apple.Terminal' };
          if ((req as { op: string }).op === 'findWindow') return { ok: true, windowId: 1 };
          return { ok: true };
        }),
      };
      await expect(
        captureScreenshot(fake as HelperClient, dir, { pollIntervalMs: 5, timeoutMs: 50 })
      ).rejects.toThrow(/DOSBox-X did not write a screenshot/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run — expect failure**

- [ ] **Step 3: Implement `screenshot.ts`**

```ts
/**
 * Screenshot layer — focuses DOSBox, sends Ctrl+F5 (DOSBox's built-in capture
 * key), polls the captures directory for the newest .png, returns bytes.
 *
 * Spec: docs/superpowers/specs/2026-05-30-dosbox-mcp-dynamic-driving-design.md
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { withFocusedDosbox } from './window.js';
import { sendKey } from './input.js';
import type { HelperClient } from './helper-client.js';

export function findNewestPngSince(dir: string, sinceMs: number): string | null {
  let bestPath: string | null = null;
  let bestMtime = 0;
  for (const name of readdirSync(dir)) {
    if (!name.toLowerCase().endsWith('.png')) continue;
    const full = join(dir, name);
    const st = statSync(full);
    const mtimeMs = st.mtimeMs;
    if (mtimeMs > sinceMs && mtimeMs > bestMtime) {
      bestMtime = mtimeMs;
      bestPath = full;
    }
  }
  return bestPath;
}

export interface ScreenshotOptions {
  pollIntervalMs?: number;
  timeoutMs?: number;
}

export async function captureScreenshot(
  client: HelperClient,
  capturesDir: string,
  opts: ScreenshotOptions = {},
): Promise<Buffer> {
  const pollIntervalMs = opts.pollIntervalMs ?? 50;
  const timeoutMs = opts.timeoutMs ?? 2000;
  const since = Date.now();
  return withFocusedDosbox(client, async () => {
    await sendKey(client, 'Ctrl+F5');
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const path = findNewestPngSince(capturesDir, since);
      if (path !== null) return readFileSync(path);
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
    throw new Error(
      `DOSBox-X did not write a screenshot — verify [render] captures= in tools/dosbox/wiz6.conf and that the path is writable.`,
    );
  });
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/mcp/src/dosbox/screenshot.ts packages/mcp/tests/dosbox/screenshot.test.ts
git commit -m "feat(mcp): screenshot layer — Ctrl+F5 + poll captures dir"
```

---

### Task 11: TS state layer (save/load to slot)

**Files:**
- Create: `packages/mcp/src/dosbox/state.ts`
- Create: `packages/mcp/tests/dosbox/state.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { saveStateToSlot, loadStateFromSlot } from '../../src/dosbox/state.js';
import type { HelperClient, HelperResponse } from '../../src/dosbox/helper-client.js';

describe('saveStateToSlot', () => {
  it('focuses, cycles slot, sends save chord, verifies mtime advanced', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wiz6-state-test-'));
    try {
      const savePath = join(dir, '5.sav');
      writeFileSync(savePath, 'old');
      utimesSync(savePath, 0, 0);
      const calls: unknown[] = [];
      const fake: Partial<HelperClient> = {
        send: vi.fn(async (req): Promise<HelperResponse> => {
          calls.push(req);
          if ((req as { op: string }).op === 'getFrontmost') return { ok: true, bundleId: 'com.apple.Terminal' };
          if ((req as { op: string }).op === 'findWindow') return { ok: true, windowId: 1 };
          // After the save chord fires, simulate DOSBox updating the file mtime.
          if ((req as { op: string; keyCode?: number }).op === 'keyDown' && (req as { keyCode?: number }).keyCode === 0x60) {
            const now = Date.now() / 1000;
            utimesSync(savePath, now, now);
          }
          return { ok: true };
        }),
      };
      await saveStateToSlot(fake as HelperClient, 5, dir, { pollIntervalMs: 5, timeoutMs: 1000 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws on slot out of range', async () => {
    const fake: Partial<HelperClient> = { send: vi.fn(async () => ({ ok: true })) };
    await expect(saveStateToSlot(fake as HelperClient, 99, '/tmp')).rejects.toThrow(/slot/);
  });

  it('throws with actionable error when mtime does not advance', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wiz6-state-test-'));
    try {
      const savePath = join(dir, '5.sav');
      writeFileSync(savePath, 'x');
      utimesSync(savePath, 0, 0);
      const fake: Partial<HelperClient> = {
        send: vi.fn(async (req): Promise<HelperResponse> => {
          if ((req as { op: string }).op === 'getFrontmost') return { ok: true, bundleId: 'com.apple.Terminal' };
          if ((req as { op: string }).op === 'findWindow') return { ok: true, windowId: 1 };
          return { ok: true };
        }),
      };
      await expect(
        saveStateToSlot(fake as HelperClient, 5, dir, { pollIntervalMs: 5, timeoutMs: 50 })
      ).rejects.toThrow(/did not save state/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('loadStateFromSlot', () => {
  it('focuses, cycles slot, sends load chord', async () => {
    const calls: unknown[] = [];
    const fake: Partial<HelperClient> = {
      send: vi.fn(async (req): Promise<HelperResponse> => {
        calls.push(req);
        if ((req as { op: string }).op === 'getFrontmost') return { ok: true, bundleId: 'com.apple.Terminal' };
        if ((req as { op: string }).op === 'findWindow') return { ok: true, windowId: 1 };
        return { ok: true };
      }),
    };
    await loadStateFromSlot(fake as HelperClient, 3);
    // Verifies the key sequence ran without error.
    expect(calls.some((c) => (c as { op: string }).op === 'keyDown')).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect failure**

- [ ] **Step 3: Implement `state.ts`**

```ts
/**
 * State layer — save/load DOSBox-X state to/from a specific slot. Uses
 * DOSBox-X's built-in key chords:
 *   - Ctrl+F4: cycle through save-state slots (one slot advance per press).
 *   - Ctrl+F5: save state to current slot.
 *   - Ctrl+F6: load state from current slot.
 *
 * NOTE: These chords are the stock DOSBox-X defaults. If they differ on a
 * given user's DOSBox-X build, the user can rebind them via the Mapper Editor
 * and update SAVE_KEY / LOAD_KEY / CYCLE_KEY in this file. See PERMISSIONS.md.
 *
 * Spec: docs/superpowers/specs/2026-05-30-dosbox-mcp-dynamic-driving-design.md
 */

import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { withFocusedDosbox } from './window.js';
import { sendKey } from './input.js';
import type { HelperClient } from './helper-client.js';

/** DOSBox-X save-state slot range. */
const MIN_SLOT = 0;
const MAX_SLOT = 9;

/** Stock DOSBox-X save-state key bindings (override via Mapper Editor if needed). */
const CYCLE_KEY = 'Ctrl+F4';
const SAVE_KEY = 'Ctrl+F5';
const LOAD_KEY = 'Ctrl+F6';

export interface StateOptions {
  pollIntervalMs?: number;
  timeoutMs?: number;
}

function validateSlot(slot: number): void {
  if (!Number.isInteger(slot) || slot < MIN_SLOT || slot > MAX_SLOT) {
    throw new Error(`saveStateToSlot/loadStateFromSlot: slot must be integer ${MIN_SLOT}..${MAX_SLOT}, got ${slot}`);
  }
}

async function cycleToSlot(client: HelperClient, slot: number): Promise<void> {
  // DOSBox-X cycles forward only; we cycle (slot+1) times to land on it,
  // assuming initial slot 0. If the user has cycled previously, this is
  // approximate — for v1, treat slot as relative-from-0.
  for (let i = 0; i <= slot; i++) {
    await sendKey(client, CYCLE_KEY);
    await new Promise((r) => setTimeout(r, 30));
  }
}

export async function saveStateToSlot(
  client: HelperClient,
  slot: number,
  saveDir: string,
  opts: StateOptions = {},
): Promise<void> {
  validateSlot(slot);
  const pollIntervalMs = opts.pollIntervalMs ?? 50;
  const timeoutMs = opts.timeoutMs ?? 2000;
  const savePath = join(saveDir, `${slot}.sav`);
  const sinceMs = existsSync(savePath) ? statSync(savePath).mtimeMs : 0;
  await withFocusedDosbox(client, async () => {
    await cycleToSlot(client, slot);
    await sendKey(client, SAVE_KEY);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (existsSync(savePath) && statSync(savePath).mtimeMs > sinceMs) return;
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
    throw new Error(
      `DOSBox-X did not save state to slot ${slot} (expected ${savePath} mtime to advance). The save chord ${SAVE_KEY} may differ on this DOSBox-X version — check the Mapper Editor.`,
    );
  });
}

export async function loadStateFromSlot(
  client: HelperClient,
  slot: number,
): Promise<void> {
  validateSlot(slot);
  await withFocusedDosbox(client, async () => {
    await cycleToSlot(client, slot);
    await sendKey(client, LOAD_KEY);
  });
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/mcp/src/dosbox/state.ts packages/mcp/tests/dosbox/state.test.ts
git commit -m "feat(mcp): state layer — save/load to slot via DOSBox-X key chords"
```

---

### Task 12: Wire real impls into `tools/control.ts` + `tools/snapshots.ts`

**Files:**
- Modify: `packages/mcp/src/tools/control.ts`
- Modify: `packages/mcp/src/tools/snapshots.ts`
- Modify: `packages/mcp/src/context.ts`

- [ ] **Step 1: Add lazy HelperClient singleton to `context.ts`**

Read the existing `context.ts` first. Add this near the existing context structure:

```ts
import { HelperClient } from './dosbox/helper-client.js';

// Lazy singleton — created on first dynamic-tool call, persists across tool
// invocations for the lifetime of the MCP server.
let _helperClient: HelperClient | null = null;
export function getHelperClient(): HelperClient {
  if (_helperClient === null) _helperClient = new HelperClient();
  return _helperClient;
}
```

If `context.ts` exports a class/factory, attach this as a method on it instead. Match the existing pattern.

- [ ] **Step 2: Replace `dosbox_send_input` + `dosbox_send_key` stubs in `control.ts`**

Find these two registrations in `packages/mcp/src/tools/control.ts` and replace their handlers (keeping schemas):

```ts
import { sendKey, sendMacro } from '../dosbox/input.js';
import { getHelperClient } from '../context.js';
import { successResult } from '../tool-result.js';

// dosbox_send_input
async ({ keys }) => {
  try {
    await sendMacro(getHelperClient(), keys);
    return successResult({ keysSent: keys });
  } catch (e) {
    return errorResult(`dosbox_send_input: ${(e as Error).message}`);
  }
}

// dosbox_send_key (the existing schema may differ — check current shape)
async ({ key }) => {
  try {
    await sendKey(getHelperClient(), key);
    return successResult({ key });
  } catch (e) {
    return errorResult(`dosbox_send_key: ${(e as Error).message}`);
  }
}
```

Update descriptions to drop the `[STUB]` prefix and `BLOCKED_MESSAGE` suffix; replace with a brief usage note ("sends a macro string like 'down down enter' to the focused DOSBox-X window").

**LEAVE** the other 7 stubs in `control.ts` (`pause`, `resume`, `step`, `step_over`, `step_into`, `run_until`, all 3 breakpoint tools) unchanged. Their `BLOCKED_MESSAGE` is still correct.

- [ ] **Step 3: Replace the 3 snapshot stubs in `snapshots.ts`**

```ts
import { captureScreenshot } from '../dosbox/screenshot.js';
import { saveStateToSlot, loadStateFromSlot } from '../dosbox/state.js';
import { resolveCapturesDir } from '../dosbox/captures-dir.js';
import { getHelperClient } from '../context.js';
import { successResult, imageResult } from '../tool-result.js';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const WIZ6_CONF = join(REPO_ROOT, 'tools', 'dosbox', 'wiz6.conf');
const SAVE_DIR = join(REPO_ROOT, 'tools', 'dosbox', 'save');

// dosbox_screenshot
async () => {
  try {
    const bytes = await captureScreenshot(getHelperClient(), resolveCapturesDir(WIZ6_CONF));
    return imageResult(bytes, 'image/png');
  } catch (e) {
    return errorResult(`dosbox_screenshot: ${(e as Error).message}`);
  }
}

// dosbox_save_state
async ({ slot }) => {
  try {
    await saveStateToSlot(getHelperClient(), slot, SAVE_DIR);
    return successResult({ slot, path: join(SAVE_DIR, `${slot}.sav`) });
  } catch (e) {
    return errorResult(`dosbox_save_state: ${(e as Error).message}`);
  }
}

// dosbox_load_state
async ({ slot }) => {
  try {
    await loadStateFromSlot(getHelperClient(), slot);
    return successResult({ slot });
  } catch (e) {
    return errorResult(`dosbox_load_state: ${(e as Error).message}`);
  }
}
```

**Note**: if `imageResult` doesn't exist in `tool-result.ts`, add it there. The MCP `ImageContent` type takes `{ type: 'image', mimeType: string, data: string /* base64 */ }`. Implement as:

```ts
export function imageResult(bytes: Buffer, mimeType: string) {
  return {
    content: [{ type: 'image' as const, mimeType, data: bytes.toString('base64') }],
  };
}
```

- [ ] **Step 4: Update existing tool tests**

Run the existing test suite:
```bash
pnpm --filter @wiz6/mcp test
```

If any existing test fails because it asserted on the stub messages, update those assertions to match the new tool behavior (the registry shape shouldn't change; only the handlers do).

- [ ] **Step 5: Verify no other stubs got accidentally touched**

```bash
grep -n 'BLOCKED_MESSAGE\|not implemented in v1' packages/mcp/src/tools/control.ts packages/mcp/src/tools/snapshots.ts
```

Expected: `control.ts` still has 7 stubs (`pause`, `resume`, `step`, `step_over`, `step_into`, `run_until`, `set_breakpoint`, `clear_breakpoint`, `list_breakpoints` — 9 actually, but breakpoint tools are in a separate file; check `breakpoints.ts`). `snapshots.ts` should have ZERO BLOCKED_MESSAGE references after this change.

- [ ] **Step 6: Commit**

```bash
git add packages/mcp/src/tools/control.ts packages/mcp/src/tools/snapshots.ts packages/mcp/src/context.ts packages/mcp/src/tool-result.ts
git commit -m "feat(mcp): wire dynamic tools — send_input/send_key/screenshot/save_state/load_state real impls"
```

---

### Task 13: Documentation — PERMISSIONS.md

**Files:**
- Create: `packages/mcp/PERMISSIONS.md`

- [ ] **Step 1: Write the doc**

```markdown
# Setup — macOS permissions for the wiz6 MCP server

The dynamic-driving tools (`dosbox_send_input`, `dosbox_screenshot`, etc.) use
macOS CGEvent injection to drive a visible DOSBox-X window. This requires
**Accessibility** permission for whichever app launches the MCP server.

## One-time setup

1. Open **System Settings → Privacy & Security → Accessibility**.
2. Add (or enable) the app that runs the MCP server:
   - **Claude Code**: enable `Claude.app` or the terminal binary launching it.
   - **iTerm / Terminal**: enable the terminal app you use.
3. The wiz6 MCP helper binary will then be able to post key events to other
   apps. Without this permission, CGEvent silently no-ops and you'll see
   `accessibility denied` errors from the MCP tools.

## DOSBox-X capture directory

The screenshot tool reads PNGs from DOSBox-X's captures directory, configured
via `[render] captures=` in `tools/dosbox/wiz6.conf`. If unset, defaults to
`~/Documents/DOSBox-X`.

Recommended: set an explicit path under the repo for cleaner cleanup:

```ini
[render]
captures = /Users/you/Projects/wiz6/tools/dosbox/captures
```

The MCP server reads this at startup.

## Save-state key chords

DOSBox-X's stock save/load key chords:

| Chord | Action |
|---|---|
| Ctrl+F4 | cycle to next save slot |
| Ctrl+F5 | save state to current slot / screenshot |
| Ctrl+F6 | load state from current slot |

If your DOSBox-X build uses different chords (some forks rebind these), update
the `CYCLE_KEY` / `SAVE_KEY` / `LOAD_KEY` constants in
`packages/mcp/src/dosbox/state.ts`. To check your bindings: in DOSBox-X, open
the Mapper Editor (Ctrl+F1 or via the menu) and inspect `key_save` / `key_load` /
`key_capslot`.

## Verifying the setup

After permissions are granted and DOSBox-X is configured, run the smoke test:

```bash
WIZ6_MCP_INTEGRATION=1 pnpm --filter @wiz6/mcp test:integration
```

This launches DOSBox-X, sends ~30 keystrokes, takes a screenshot, and saves
state to slot 5. If the test passes, your setup is correct.

## Troubleshooting

- **`accessibility denied`**: the parent app lacks Accessibility permission
  (see step 1 above). Quit + reopen the app after enabling.
- **`no window matched appName=dosbox-x`**: DOSBox-X isn't running, or its
  window is minimized to the Dock. Bring it back on-screen.
- **`DOSBox-X did not write a screenshot`**: the captures directory is wrong
  or unwritable. Check the `[render] captures=` line in your wiz6.conf.
- **`DOSBox-X did not save state`**: the SAVE_KEY chord doesn't match your
  DOSBox-X build's binding. Check the Mapper Editor.
```

- [ ] **Step 2: Commit**

```bash
git add packages/mcp/PERMISSIONS.md
git commit -m "docs(mcp): macOS Accessibility + DOSBox-X capture setup"
```

---

### Task 14: Integration smoke test

**Files:**
- Create: `packages/mcp/tests/integration/spike-target.test.ts`
- Modify: `packages/mcp/package.json` (add `test:integration` script)

- [ ] **Step 1: Add the integration test**

```ts
/**
 * Spike-target integration smoke. Gated on WIZ6_MCP_INTEGRATION=1.
 *
 * Exercises the full closed loop:
 *  1. Launch DOSBox-X.
 *  2. Wait for title page.
 *  3. Send keys to reach ADD PARTY MEMBER → NEW CHARACTER → name input.
 *  4. Type NATHAN.
 *  5. Screenshot.
 *  6. Save state to slot 5.
 *  7. Inspect slot 5 to verify NATHAN appears.
 *  8. Kill DOSBox-X.
 *
 * Requires:
 *   - macOS with Accessibility permission for the test runner.
 *   - DOSBox-X installed at the path in wiz6.conf.
 *   - A captures directory configured.
 *
 * Spec: docs/superpowers/specs/2026-05-30-dosbox-mcp-dynamic-driving-design.md
 */

import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HelperClient } from '../../src/dosbox/helper-client.js';
import { sendMacro } from '../../src/dosbox/input.js';
import { captureScreenshot } from '../../src/dosbox/screenshot.js';
import { saveStateToSlot } from '../../src/dosbox/state.js';
import { resolveCapturesDir } from '../../src/dosbox/captures-dir.js';
// dosbox_launch + dosbox_kill use the existing lifecycle.ts — invoke directly.
import { launchDosbox, killDosbox } from '../../src/tools/lifecycle.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const WIZ6_CONF = join(REPO_ROOT, 'tools', 'dosbox', 'wiz6.conf');
const SAVE_DIR = join(REPO_ROOT, 'tools', 'dosbox', 'save');

const INTEGRATION = process.env.WIZ6_MCP_INTEGRATION === '1';

describe.skipIf(!INTEGRATION)('spike target — closed-loop integration', () => {
  it('launch → name input → screenshot → save → inspect', async () => {
    const client = new HelperClient();
    let dosboxPid: number | null = null;
    try {
      // 1. Launch.
      const launched = await launchDosbox();
      dosboxPid = launched.pid;
      // 2. Wait for title page.
      await new Promise((r) => setTimeout(r, 4000));
      // 3+4. Send keys: dismiss title (2 enters), pick CREATE A NEW PARTY (down*?, enter),
      //      reach NEW CHARACTER name input, type NATHAN, enter.
      //
      // EXACT KEY SEQUENCE TO REACH THE NAME INPUT IS NOT KNOWN STATICALLY;
      // tune during first run. As a starting point:
      await sendMacro(client, 'enter enter');                    // dismiss intro
      await new Promise((r) => setTimeout(r, 500));
      await sendMacro(client, 'enter');                          // pick CREATE A NEW PARTY (assumed default)
      await new Promise((r) => setTimeout(r, 500));
      await sendMacro(client, 'enter');                          // pick CREATE A NEW CHARACTER
      await new Promise((r) => setTimeout(r, 500));
      // Race picker — keep arrow-down + enter to pick first race. Adjust during tuning.
      await sendMacro(client, 'enter');
      await new Promise((r) => setTimeout(r, 500));
      // Type NATHAN at the name prompt.
      await sendMacro(client, '"NATHAN" enter', { interKeyDelayMs: 50 });

      // 5. Screenshot.
      const png = await captureScreenshot(client, resolveCapturesDir(WIZ6_CONF));
      expect(png.length).toBeGreaterThan(100); // non-trivial PNG
      expect(png.slice(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

      // 6. Save state to slot 5.
      await saveStateToSlot(client, 5, SAVE_DIR);
      expect(existsSync(join(SAVE_DIR, '5.sav'))).toBe(true);

      // 7. Inspect slot 5 — verify it exists and has non-trivial size.
      // (Full party_names verification depends on having booted to a state
      // where NATHAN is committed; this initial smoke just checks the save
      // was written.)
    } finally {
      await client.shutdown();
      if (dosboxPid !== null) await killDosbox(dosboxPid).catch(() => {});
    }
  }, 30_000); // 30s timeout for the whole smoke
});
```

- [ ] **Step 2: Add `test:integration` script to `package.json`**

In `packages/mcp/package.json`, add to `scripts`:

```json
"test:integration": "WIZ6_MCP_INTEGRATION=1 vitest run tests/integration"
```

- [ ] **Step 3: Verify the gate works (without running the test)**

```bash
pnpm --filter @wiz6/mcp test
```

Expected: tests pass, and the integration test is **skipped** (because WIZ6_MCP_INTEGRATION isn't set).

- [ ] **Step 4: Commit**

```bash
git add packages/mcp/tests/integration packages/mcp/package.json
git commit -m "test(mcp): integration smoke for spike target (gated)"
```

---

### Task 15: TODO follow-ups

**Files:**
- Modify: `TODO.md`

- [ ] **Step 1: Bump next free ID + add three entries**

In `TODO.md`, update `Next free ID:` to `**#066**`, and insert three entries under `## Open`:

```markdown
- #063 [open] — DOSBox-X MCP: Linux + Windows ports of input/window/screenshot helpers
  - macOS-only v1 ships in #060-family work. Linux (xdotool + ImageMagick), Windows (SendInput + screenshot APIs).
  - Same module shape: `packages/mcp/src/dosbox/{input,window,screenshot}.ts` are platform-agnostic façades; the Swift helper at `packages/mcp/helper/` is the macOS implementation. Add `wiz6-input-helper-linux` / `-windows` siblings or fold platform selection into the TS layer.

- #064 [open] — DOSBox-X MCP: drive the debugger (re-open `pause/resume/step/run_until/breakpoints` stubs)
  - The 9 debugger-driving stubs in `tools/control.ts` + `tools/breakpoints.ts` remain stubs after the dynamic-driving work — that work routes around the debugger entirely.
  - Two viable paths: (a) node-pty + a vt100 screen scraper of DOSBox-X's ncurses debugger UI; (b) patch DOSBox-X to expose a TCP debug port.
  - Path (b) is cleaner long-term; cost is maintaining a fork.

- #065 [open] — Visual regression harness for headless playthroughs
  - Once dynamic-driving lands, capture reference screenshot sequences for known game flows (e.g., "boot → ADD PARTY MEMBER → NEW CHAR → NATHAN → commit"). Re-run the same sequence in CI; diff each frame against the reference. Catches gameplay-flow regressions the existing pixel-parity tests don't (they cover isolated frames, not transitions).
```

- [ ] **Step 2: Commit**

```bash
git add TODO.md
git commit -m "chore: TODO #063/#064/#065 — DOSBox-X automation follow-ups"
```

---

## Self-review checklist

After implementation: verify each spec section maps to a task.

| Spec section | Task(s) |
|---|---|
| Swift helper (Package.swift, main, Protocol, KeyCodes, Input, Window) | Tasks 1-5 |
| TS helper-client | Task 6 |
| TS input layer (resolveKey, sendKey, sendMacro) | Task 7 |
| TS window layer (withFocusedDosbox) | Task 8 |
| Captures dir resolver | Task 9 |
| TS screenshot layer | Task 10 |
| TS state layer (saveStateToSlot, loadStateFromSlot) | Task 11 |
| Wire MCP tools (control.ts + snapshots.ts) | Task 12 |
| PERMISSIONS.md | Task 13 |
| Integration smoke (spike target) | Task 14 |
| TODO follow-ups (#063/#064/#065) | Task 15 |

All spec items mapped. Engineer-notes on known unknowns (exact save-state key chord on this DOSBox-X build, exact key sequence to reach the name input in the smoke test) are flagged inline so the implementer doesn't break on them.
