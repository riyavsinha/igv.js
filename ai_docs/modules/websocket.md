# WebSocket Module

## Purpose

The WebSocket module provides a remote control interface for igv.js, allowing external applications (such as IGV desktop, Jupyter notebooks, or custom scripts) to send commands to a running igv.js browser instance over a WebSocket connection. It implements a JSON-based message protocol with request/response semantics, automatic reconnection with exponential backoff, and support for intentional disconnection.

## Genomic Context

Bioinformatics workflows often involve programmatic control of genome browsers. Researchers may want to navigate to specific loci, load tracks, change colors, or export views from scripts or pipeline tools. The WebSocket interface enables this by exposing most of the igv.js Browser API over a simple JSON protocol, similar to IGV desktop's "port command" interface. This is commonly used in notebook environments (e.g., igv-jupyter, igv-notebook) where Python code drives the browser visualization.

## Key Classes & Files

### `websocket/websocketClient.ts`

The `createWebSocketClient` function establishes and manages a persistent WebSocket connection:

- **Connection setup**: Connects to `ws://host:port` (or `wss://` for non-local HTTPS pages). Default host is `localhost`, default port is `60141`.
- **Reconnection logic**: On unexpected disconnection, retries with exponential backoff starting at 1 second, doubling up to a maximum of 10 seconds. Reconnection is suppressed when:
  - The server sends a `{"type": "close"}` message (sets `intentionalClose` flag).
  - The page is being unloaded (`beforeunload` event).
- **Message handling**: Incoming JSON messages are parsed and dispatched to `handleMessage()`. The response is sent back over the same WebSocket connection as JSON.
- **Error handling**: Non-JSON messages produce a console warning. Other errors are caught and sent back as error responses.
- **Lifecycle**: The initial `connect()` call is made immediately. A `beforeunload` handler cleans up the connection and prevents reconnection attempts when the page closes.
- **Exported as**: Both named export (`createWebSocketClient`) and default export. Also re-exported from the public API in `js/index.ts`.

### `websocket/messageHandler.ts`

The `handleMessage` function is the command dispatcher. It receives a parsed JSON message with `{ uniqueID, type, args }` structure and returns a response with `{ uniqueID, status, message?, data? }`:

**Supported commands** (case-insensitive `type` field):

| Command | Description |
|---------|-------------|
| `goto` / `search` | Navigate to a locus (args: `locus` or `term`) |
| `currentLoci` | Return current locus strings for all panels |
| `visibilityChange` | Notify browser of visibility change (e.g., tab switch) |
| `toJSON` | Serialize current session to JSON |
| `compressedSession` | Serialize and compress current session |
| `toSVG` | Export current view as SVG |
| `removeTrackByName` | Remove track(s) by name |
| `loadSampleInfo` | Load sample information/attributes |
| `discardSampleInfo` | Clear sample information |
| `loadROI` | Load regions of interest |
| `clearROIs` | Clear all regions of interest |
| `getUserDefinedROIs` | Retrieve user-defined ROIs |
| `loadTrack` | Load a new track (args: `url`, `indexURL`) |
| `genome` | Load a genome by ID |
| `loadSession` | Load a session from URL |
| `zoomIn` | Zoom in one level |
| `zoomOut` | Zoom out one level |
| `setColor` | Set track color by name (supports "R,G,B" and "rgb(R,G,B)" formats) |
| `renameTrack` | Rename a track (args: `currentName`, `newName`) |

**Response structure**:
- `uniqueID`: Echoed from the request for correlation.
- `status`: `"ok"`, `"warning"`, or `"error"`.
- `message`: Human-readable description of what happened.
- `data`: Optional payload (e.g., JSON session, SVG string, locus array).

**Error handling**: All commands are wrapped in a try/catch. Errors set status to `"error"` with the error message. Unrecognized command types return an error status.

## Data Flow

```
External Application (Python, CLI, etc.)
  |
  | WebSocket JSON message: { uniqueID, type, args }
  v
websocketClient.ts -- connect(), parse JSON, dispatch
  |
  v
messageHandler.ts -- handleMessage() switch on type
  |
  v
Browser API methods (search, loadTrack, toJSON, etc.)
  |
  v
messageHandler.ts -- construct response { uniqueID, status, message, data }
  |
  v
websocketClient.ts -- sendJSON() back over WebSocket
  |
  v
External Application receives response
```

## Dependencies

### Depends on:
- `js/browser.ts` -- the `Browser` class whose API methods are called for each command
- `js/types/ui.ts` -- `Track` type for `findTracks` and track manipulation

### Depended on by:
- `js/igv-create.ts` -- `createBrowser()` optionally creates a WebSocket client when `config.enableWebSocket` is true
- `js/index.ts` -- re-exports `createWebSocketClient` as part of the public API, allowing manual WebSocket setup
