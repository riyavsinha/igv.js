# Browser Lifecycle

## Creation Flow

```
igv.createBrowser(parentDiv, config)              [js/igv-create.ts]
│
├── GenomeUtils.initializeGenomes(config)          Load known genome list (once, shared)
├── setDefaults(config)                            Apply default configuration values
├── extractQuery(config)                           Parse URL query parameters (if enabled)
├── GoogleAuth.init()                              Initialize Google OAuth (if configured)
│
├── new Browser(config, parentDiv)                 [js/browser.ts]
│   ├── attachShadow({mode: "open"})               Create Shadow DOM
│   ├── CSSStyleSheet → adoptedStyleSheets          Inject CSS into shadow root
│   ├── Create root container (.igv-container)
│   ├── new Alert()                                 Alert dialog
│   ├── new EventEmitter()                          Event system
│   ├── initialize(config)                          Set browser-level config properties
│   ├── addEventHandlers()                          Mouse/keyboard/resize handlers
│   ├── new SampleInfo()                            Sample metadata manager
│   ├── createStandardControls()
│   │   ├── new ResponsiveNavbar()                  Navigation bar with all controls
│   │   ├── new CursorGuide()                       Vertical cursor line
│   │   ├── new InputDialog()                       Text input dialog
│   │   ├── new DataRangeDialog()                   Data range editor
│   │   ├── new GenericColorPicker()                Color picker
│   │   └── new SliderDialog()                      Slider dialog
│   └── new ROIManager()                            Region of interest manager
│
├── browser.loadSession() or browser.loadSessionObject()
│   ├── cleanHouseForSession()                      Remove existing tracks/DOM
│   ├── Create column layout (axis, viewport, scrollbar, drag, gear columns)
│   ├── loadReference(genomeConfig)                 Load reference genome
│   │   ├── Genome.createGenome() or loadGenbank()
│   │   ├── updateLoci() or search()                Set initial locus
│   │   └── fireEvent('genomechange')
│   ├── Create IdeogramTrack + TrackView             Ideogram bar
│   ├── Create RulerTrack + TrackView                Ruler/coordinate bar
│   ├── roiManager.loadROI()                         Load regions of interest
│   ├── sampleInfo.loadSampleInfo()                  Load sample metadata
│   └── loadTrackList(trackConfigurations)           Load all tracks
│       └── for each track config:
│           ├── createTrack(config)
│           │   ├── inferFileFormat()                Detect format from URL
│           │   ├── TrackUtils.inferTrackType()      Map format → track type
│           │   └── getTrack(type, config, browser)  Factory creates track instance
│           ├── track.postInit()                     Async initialization
│           └── addTrack(track)
│               └── new TrackView(browser, columnContainer, track)
│                   ├── createAxis()
│                   ├── createViewports()             One per reference frame
│                   │   └── createViewport() → TrackViewport | IdeogramViewport | RulerViewport
│                   ├── new SampleInfoViewport()
│                   ├── new SampleNameViewport()
│                   ├── createTrackScrollbar()
│                   ├── createTrackDragHandle()
│                   └── createTrackGearPopup()
│
└── navbar.navbarDidResize()                        Final layout adjustment
```

## Update Cycle

Triggered by zoom, pan, locus change, or track property change:

```
Browser.updateViews(force?)
│
├── updateLocusSearchWidget()              Update locus display in navbar
│   ├── Recalculate referenceFrame.end from pixel width
│   └── fireEvent('locuschange')
│
├── Preload sequence if zoomed in enough
│
├── Repaint center guide lines
│
├── Group autoscale handling:
│   ├── Collect trackViews by autoscaleGroup
│   ├── Load features for group tracks
│   ├── Compute shared dataRange via doAutoscale()
│   └── Update all group tracks
│
└── For each TrackView:
    TrackView.updateViews()
    └── For each Viewport:
        ├── loadFeatures()              Fetch data if not cached
        │   ├── Check FeatureCache
        │   ├── If miss: track.getFeatures(chr, start, end, bpPerPixel)
        │   └── Store in FeatureCache
        ├── checkContentHeight()        Resize if feature count changed
        └── repaint()                   Re-render canvas
            ├── Create offscreen canvas
            ├── Build DrawConfiguration
            ├── track.draw(config)       Track-specific rendering
            └── Copy to visible canvas
```

## Resize Handling

```
window resize event
└── Browser resize handler
    ├── calculateViewportWidth()        Recompute available width
    ├── updateReferenceFrames()         Adjust bpPerPixel for new width
    ├── updateViewportElements()        Resize viewport DOM elements
    └── updateViews()                   Trigger full repaint
```

## Track Management

### Adding a track
```
browser.loadTrack(config)
└── loadTrackList([config])
    └── #loadTrackHelper(config)
        ├── createTrack(config)          Format detection + factory
        ├── track.postInit()             Async setup (e.g., load header)
        └── addTrack(track)
            └── new TrackView(...)       DOM creation + initial render
```

### Removing a track
```
browser.removeTrack(track)
├── trackView.dispose()                 Remove DOM, null properties
├── Remove from trackViews array
├── fireEvent('trackremoved')
└── Check if sample controls need hiding
```

### Reordering tracks
```
browser.reorderTracks()
├── Sort trackViews by track.order
└── Reorder DOM elements to match
```

## Session Management

### Saving
```
browser.toJSON()
├── Serialize genome/reference config
├── For each track: track.getState()     Capture current properties
├── Serialize locus, ROIs, sample info
└── Return JSON object
```

### Loading
```
browser.loadSession({url: "session.json"})
├── Fetch and parse session file
│   ├── JSON → direct parse
│   ├── XML → XMLSession parser
│   └── hub.txt → UCSC Hub parser
├── cleanHouseForSession()               Tear down existing state
└── loadSessionObject(session)           Rebuild from session config
```

## Disposal

```
igv.removeBrowser(browser)
├── browser.dispose()
│   ├── Remove event listeners
│   ├── Dispose all trackViews
│   ├── Dispose all UI components
│   └── Null all properties
├── browser.root.remove()               Remove DOM tree
└── Remove from allBrowsers array
```
