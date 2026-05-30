import Foundation

// JSON-over-stdio loop. One line in, one line out.
// Real commands ship in later tasks; this scaffold just echoes.

private func jsonString(_ s: String) -> String {
    let data = try! JSONSerialization.data(withJSONObject: s, options: [.fragmentsAllowed])
    return String(data: data, encoding: .utf8)!
}

let stdout = FileHandle.standardOutput

while let line = readLine(strippingNewline: true) {
    if line.isEmpty { continue }
    let response = "{\"ok\":true,\"echo\":\(jsonString(line))}\n"
    stdout.write(response.data(using: .utf8)!)
}
