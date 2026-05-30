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
