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
