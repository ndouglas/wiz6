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
