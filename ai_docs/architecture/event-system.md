# Event System

## Overview

igv.js uses a simple pub/sub event system built on the `EventEmitter` class (`js/events.ts`). The Browser class composes an EventEmitter instance and delegates event methods through it.

## EventEmitter (`js/events.ts`)

Minimal implementation (~65 lines):

```typescript
class EventEmitter {
    eventHandlers: Map<string, EventHandler[]>

    on(eventName, fn)      // Subscribe
    off(eventName?, fn?)   // Unsubscribe (remove all, by name, or specific handler)
    un(eventName, fn)      // Deprecated alias for off()
    emit(eventName, args?, thisObj?)  // Fire event, return first handler's result
}
```

### Key design decisions:
- **`emit()` returns the first handler's result** — Only used by `trackclick` event, which assumes a single handler
- **Handlers share global scope** — `handler.apply(scope, appliedArgs)` where scope defaults to `globalThis`
- **No async support** — Handlers are invoked synchronously
- **No error isolation** — A throwing handler will prevent subsequent handlers from running

## Browser Event Integration

Browser delegates to its `eventEmitter` property:

```typescript
// In Browser class:
on(eventName, fn)      → this.eventEmitter.on(eventName, fn)
off(eventName, fn)     → this.eventEmitter.off(eventName, fn)
fireEvent(name, args)  → this.eventEmitter.emit(name, args, this)
```

Events can be registered at creation time via config:
```javascript
igv.createBrowser(div, {
    listeners: {
        locuschange: (referenceFrameList) => { ... },
        trackclick: (track, popupData) => { ... }
    }
})
```

## Available Events

### Navigation Events
| Event | Args | When |
|-------|------|------|
| `locuschange` | `[referenceFrameList]` | Zoom, pan, search, or locus change |

### Track Events
| Event | Args | When |
|-------|------|------|
| `trackclick` | `[track, popupData]` | User clicks on a track feature. Return value controls popup display |
| `trackremoved` | `[]` | After a track is removed |
| `trackorderchanged` | `[trackOrder]` | After tracks are reordered |
| `trackdragend` | `[{srcIndex, dstIndex}]` | After drag-reorder completes |

### Genome Events
| Event | Args | When |
|-------|------|------|
| `genomechange` | `[{genome}]` | After a new genome/reference is loaded |

### Layout Events
| Event | Args | When |
|-------|------|------|
| `columnlayoutchange` | `[]` | When viewport columns are restructured |
| `didchangecolumnlayout` | `[{count, viewportWidth}]` | After column layout changes |

### Internal Events (used by igv.js components)
These events coordinate internal component behavior:
- `trackremoved` — Triggers sample control visibility check
- `columnlayoutchange` — Disposes orphaned popovers

## User Interaction Flow

### Click → Popup Data
```
User clicks on TrackViewport
│
├── TrackViewport mousedown/mouseup handler
│   ├── Calculate genomic position from pixel via ReferenceFrame
│   ├── Build ClickState: {genomicLocation, y, viewport, referenceFrame}
│   └── Call track.popupData(clickState)
│       └── Returns PopupData[] (name/value pairs or HTML strings)
│
├── browser.fireEvent('trackclick', [track, popupData])
│   └── If handler returns a truthy value → suppress default popup
│
└── If not suppressed → Show popup via Popover
```

### Drag → Pan
```
User drags on TrackViewport
│
├── mousedown → Record start position, set dragObject
│
├── mousemove → If delta > dragThreshold:
│   ├── Calculate pixel delta
│   ├── referenceFrame.shiftPixels(delta, viewportWidth, clamp)
│   └── browser.updateViews() (repaints all tracks)
│
└── mouseup → Clear dragObject
```

### Scroll → Content Pan (vertical)
```
User scrolls on TrackViewport (or drags scrollbar)
│
├── If delta > scrollThreshold:
│   ├── isScrolling = true
│   ├── Adjust viewport.contentTop
│   └── Repaint (shift canvas, don't reload features)
│
└── When done: isScrolling = false
```

### Zoom
```
Double-click or mouse wheel:
│
├── Calculate center genomic position
├── referenceFrame.zoomWithScaleFactor(browser, factor, viewportWidth, centerBP)
│   ├── Update bpPerPixel (clamped to min/max)
│   ├── Recalculate start/end centered on zoom point
│   └── browser.updateViews(true)
│
└── Ruler sweep (click-drag on ruler):
    ├── RulerSweeper captures drag region
    ├── Calculate new start/end from swept pixels
    └── browser.search(locusString)
```

## Keyboard Events

Browser registers a `keyup` handler for:
- `+` / `=` — Zoom in
- `-` — Zoom out
- Arrow keys — Pan left/right
- Other keys delegated to focused track

## DOM Event Architecture

igv.js uses native DOM events extensively:
- Event listeners attached to viewport elements, scrollbars, drag handles, toolbar buttons
- Uses `addEventListener` / `removeEventListener` (no framework abstraction)
- Touch events mirrored alongside mouse events for mobile support
- Bound handlers stored as properties for clean disposal

### Disposal Pattern
All event listeners and DOM references are cleaned up in `dispose()`:
```typescript
dispose() {
    this.viewportElement.remove()
    for (const key in this) {
        this[key] = undefined  // Release all references
    }
}
```

## Limitations

1. **No event bubbling** — Events don't propagate up a component tree
2. **Synchronous only** — No async event handlers
3. **Single return value** — Only first handler's return is used (trackclick)
4. **No event namespacing** — Can't easily remove a set of related handlers
5. **No wildcard subscriptions** — Must subscribe to exact event names
6. **No middleware/interceptor pattern** — Can't transform events in transit
