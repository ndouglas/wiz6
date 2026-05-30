# wiz6-input-helper

Small Swift helper binary that performs macOS-native operations on behalf of the
wiz6 MCP server: CGEvent keyboard injection, window discovery, window focus.

## Building

```bash
./build.sh
```

Outputs `packages/mcp/bin/wiz6-input-helper`. The MCP server spawns this binary
on demand and communicates with it via JSON over stdio.

## Protocol

One JSON request per line on stdin, one JSON response per line on stdout. See
`Sources/wiz6-input-helper/Protocol.swift` for the schema.
