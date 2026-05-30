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

/// Bring the app that owns `windowId` to the front — reliably.
///
/// `NSRunningApplication.activate()` is subject to macOS focus-stealing
/// prevention: when another app is active (e.g. the user's editor, or even a
/// shell command that briefly foregrounds the terminal), it silently no-ops and
/// the synthetic key events never reach DOSBox. So after the best-effort
/// AppKit activate we also force the app frontmost via the Accessibility API
/// (`AXFrontmost`) — the same mechanism System Events `set frontmost` uses,
/// authorized by the helper's existing Accessibility grant.
public func focusWindow(windowId: UInt32) -> Response {
    let options: CGWindowListOption = [.optionIncludingWindow]
    guard let infoList = CGWindowListCopyWindowInfo(options, CGWindowID(windowId)) as? [[String: Any]],
          let info = infoList.first,
          let ownerPid = info[kCGWindowOwnerPID as String] as? Int32
    else {
        return .failure("window \(windowId) not found")
    }
    // Best-effort AppKit activate (succeeds when we're already foreground-eligible).
    NSRunningApplication(processIdentifier: pid_t(ownerPid))?.activate(options: [.activateIgnoringOtherApps])
    // Reliable path: set the application's AXFrontmost attribute, which brings
    // it forward even when another app currently holds focus.
    let axApp = AXUIElementCreateApplication(pid_t(ownerPid))
    let err = AXUIElementSetAttributeValue(axApp, kAXFrontmostAttribute as CFString, kCFBooleanTrue)
    if err != .success {
        return .failure("AX set frontmost failed (err \(err.rawValue)) for pid \(ownerPid)")
    }
    return .success()
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
