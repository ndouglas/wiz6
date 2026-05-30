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
