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
