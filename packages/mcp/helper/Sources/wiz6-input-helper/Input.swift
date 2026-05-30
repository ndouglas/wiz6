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
