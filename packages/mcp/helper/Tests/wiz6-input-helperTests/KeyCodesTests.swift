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
