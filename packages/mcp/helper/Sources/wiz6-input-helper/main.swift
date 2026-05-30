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
        stdout.write(Data(encodeResponse(resp).utf8))
    } catch {
        let err = encodeResponse(.failure("decode error: \(error)"))
        stdout.write(Data(err.utf8))
    }
}
