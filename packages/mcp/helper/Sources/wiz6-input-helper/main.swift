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
        case .keyDown(let kc, let fl):
            resp = postKeyDown(keyCode: kc, flags: fl)
        case .keyUp(let kc, let fl):
            resp = postKeyUp(keyCode: kc, flags: fl)
        case .findWindow, .focusWindow, .getFrontmost, .restoreFrontmost:
            resp = .failure("not yet implemented")
        }
        stdout.write(Data(encodeResponse(resp).utf8))
    } catch {
        let err = encodeResponse(.failure("decode error: \(error)"))
        stdout.write(Data(err.utf8))
    }
}
