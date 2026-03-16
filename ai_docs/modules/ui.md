# Module: UI (`js/ui/`)

## Purpose

The UI module implements all user-facing interactive components of the igv.js genome browser. This includes the navigation bar widgets (zoom, chromosome selector, toolbar buttons), context menus for tracks, popup/popover panels for displaying feature information, dialog boxes (alerts, input dialogs, color pickers, data range editors), cursor/center-line guides, and the save-image functionality. Together these components provide the user interface layer that sits between the browser's internal state and the user's mouse/keyboard interactions.

## Genomic Context

While this module does not directly parse or process biological data, it provides the visual controls that let users navigate genomic coordinates (zoom widget, chromosome selector), inspect features (popovers showing gene names, variant details, alignment properties), configure track rendering (color pickers, display mode menus, data range dialogs), and export visualizations (SVG/PNG image saving). The UI layer translates user intent into browser API calls like `browser.zoomIn()`, `browser.updateLoci()`, and `trackView.repaintViews()`.

## Key Classes & Files

### Top-Level Components

#### `ui/alert.ts`
- **`Alert`** -- Thin wrapper around `AlertDialog`. Provides a `present(alert, callback)` method that accepts either an `Error` or a string message. Used as `browser.alert` for displaying error messages and notifications.

#### `ui/menuPopup.ts`
- **`MenuPopup`** -- The track gear menu popup. Creates a draggable, closeable popup that renders a list of `MenuItem` objects. Has two presentation modes:
  - `presentMenuList(trackView, menuList, config)` -- Renders the gear menu with menu items. Handles multi-track selection: when a track is selected and part of a multi-selection group, menu actions are applied to all selected tracks.
  - `presentTrackContextMenu(e, menuItems)` -- Renders a right-click context menu at the mouse position.
  - Supports click handlers, dialog handlers, checkboxes, and HTML string menu items.

#### `ui/menuUtils.ts`
- **`MenuUtils`** -- Factory for building track context menu item lists. Contains the logic for which menu items appear for which track types. Key methods:
  - `trackMenuItemList(trackView)` -- Builds the complete menu for a track, including height, rename, color picker, visibility window, track-specific items (from `track.menuItemList()`), and removal.
  - `defaultMenuItems(trackView)` -- Standard items: color picker (for supported track types), alt color, track-specific items, visibility window.
  - `multiSelectMenuItems(trackView)` -- Items shown when multiple tracks are selected (group autoscale for wig tracks, shared color changes).
  - Helper functions: `colorPickerMenuItem`, `trackHeightMenuItem`, `trackRenameMenuItem`, `trackRemovalMenuItem`, `visibilityWindowMenuItem`, `groupAutoScaleMenuItem`.
  - Exports `autoScaleGroupColorHash` (maps autoscale group IDs to colors), `multiTrackSelectExclusionTypes` (sequence, ruler, ideogram).

#### `ui/zoomWidget.ts`
- **`ZoomWidget`** -- Zoom controls with minus button, range slider, and plus button. The slider maps logarithmically to the zoom level (log2 of the scale factor between chromosome length and viewport extent). Listens to `locuschange` events to update the slider position. Disables itself in multi-locus mode.

#### `ui/chromosomeSelectWidget.ts`
- **`ChromosomeSelectWidget`** -- A `<select>` dropdown listing available chromosomes. Supports whole-genome view ("all" option), displays chromosome display names, and caps the list at 1000 entries for genomes with many sequences. On selection change, calls `browser.updateLoci()` to navigate to the chosen chromosome.

#### `ui/popover.ts`
- **`Popover`** -- A general-purpose popup panel for displaying feature information and context menus. Features:
  - Draggable header with close button.
  - `configure(menuItems)` -- Pre-populates with menu elements.
  - `present(event)` -- Positions the popover near the mouse click, adjusting to stay within bounds.
  - `presentContentWithEvent(event, htmlContent)` -- Shows raw HTML content.
  - `presentMenu(event, menuItems)` -- Shows a menu at the click position.
  - `createMenuElements()` -- Converts mixed item types (strings, DOM nodes, MenuItem objects) into menu elements with click handlers.

#### `ui/dropdown.ts`
- **`Dropdown`** -- A simpler popup menu used for toolbar button dropdowns (e.g., Save Image). Positions relative to a configurable shim offset. Uses `createMenuElements` from `popover.ts`.

#### `ui/navbarButton.ts`
- **`NavbarButton`** -- Base class for responsive navigation bar buttons. Supports two display modes:
  - **Text mode** (`igv-navbar-text-button`) -- Shows an SVG label with text.
  - **Icon mode** (`igv-navbar-icon-button`) -- Shows a background image SVG.
  - Responds to `navbar-resize` events to switch between modes.
  - Manages hover state with separate image/imageHover SVG dictionaries.

#### `ui/cursorGuide.ts`
- **`CursorGuide`** -- Crosshair cursor that tracks mouse movement across the viewport columns. Displays horizontal and vertical guide lines. Integrates with the ruler viewport to show genomic coordinates at the cursor position. Supports a `customMouseHandler` callback for external consumers.

#### `ui/viewportCenterLine.ts`
- **`ViewportCenterLine`** -- A vertical center line overlay that marks the center of each viewport column. Adjusts width based on zoom level: at high zoom (>1 pixel per base pair), the line widens to show the full base width; at low zoom, it is a single-pixel line. Toggleable via `browser.doShowCenterLine`.

#### `ui/circularViewControl.ts`
- **`CircularViewControl`** -- Toggle button for showing/hiding the circular genome view. Sets `browser.circularViewVisible` on click.

#### `ui/saveImageControl.ts`
- **`SaveImageControl`** -- Extends `NavbarButton`. Provides a dropdown with "Save as SVG" and "Save as PNG" options. Delegates to `browser.saveSVGtoFile()` and `browser.savePNGtoFile()`.

#### `ui/multiTrackSelectButton.ts`
- **`MultiTrackSelectButton`** -- Extends `NavbarButton`. Toggles multi-track selection mode. When enabled, each track view shows a selection checkbox; when disabled, clears selections and hides the overlay track button. Calls `trackView.enableTrackSelection()` on all track views.

#### `ui/regionTableBase.ts`
- **`RegionTableBase`** -- Base class for region-of-interest tables. Provides a draggable table UI with column headers, scrollable row container, "Go To" button, and row selection management. Used by ROI table implementations.

#### `ui/igvTable.ts`
- **`IGVTable`** -- Wraps the `components/table.ts` table in a draggable popup with header and close control. Used for displaying tabular data like search results.

### Button Control Files

#### `ui/cursorGuideButton.ts`, `ui/centerLineButton.ts`, `ui/trackLabelControl.ts`, `ui/overlayTrackButton.ts`, `ui/customButton.ts`
Specialized `NavbarButton` subclasses that toggle specific browser features (cursor guide visibility, center line visibility, track label visibility, overlay track creation, custom user-defined actions).

### Subdirectory: `ui/components/`

Reusable dialog and widget components:

- **`components/alertDialog.ts`** -- Modal alert dialog with sanitized HTML body (via DOMPurify), OK button, keyboard support (Enter to dismiss), and draggable header. Maps HTTP status codes to human-readable messages.
- **`components/dialog.ts`** -- Generic OK/Cancel dialog with configurable label, content panel, and callback. Used by `MenuUtils` for confirmation prompts.
- **`components/inputDialog.ts`** -- Input dialog with text field for user input (track height, track name, visibility window).
- **`components/sliderDialog.ts`** -- Dialog with a range slider for numeric input.
- **`components/dataRangeDialog.ts`** -- Specialized dialog for editing data range (min/max values) on quantitative tracks.
- **`components/genericColorPicker.ts`** -- Color picker widget with preset color swatches (from `genericColorPickerPalette`), a "More Colors" interactive picker (vanilla-picker), and recent colors. Used for setting track colors.
- **`components/colorScaleEditor.ts`** -- Editor for gradient and diverging color scales used by heatmap-type tracks.
- **`components/segFilterDialog.ts`** -- Filter dialog for segmentation tracks.
- **`components/checkbox.ts`** -- Reusable checkbox component.
- **`components/genericContainer.ts`** -- Base container with header, close button, and draggable behavior. Superclass for `GenericColorPicker`.
- **`components/panel.ts`** -- Simple content panel wrapper used as dialog content.
- **`components/table.ts`** -- Creates an HTML table from headers and rows with optional click handlers.
- **`components/textbox.ts`** -- Text display component.

### Subdirectory: `ui/navbarIcons/`

SVG icon definitions for navigation bar buttons. Each file exports SVG strings for normal and hover states:

- **`navbarIcons/buttonLabel.ts`** -- Base SVG template for text-mode navbar buttons.
- **`navbarIcons/centerline.ts`** -- Center line toggle icon.
- **`navbarIcons/clearFilters.ts`** -- Clear filters icon.
- **`navbarIcons/cursor.ts`** -- Cursor guide toggle icon.
- **`navbarIcons/multiSelect.ts`** -- Multi-track selection icon.
- **`navbarIcons/overlayTrack.ts`** -- Overlay track creation icon.
- **`navbarIcons/roi.ts`** -- Region of interest icon.
- **`navbarIcons/sampleInfo.ts`** -- Sample info icon.
- **`navbarIcons/sampleNames.ts`** -- Sample names toggle icon.
- **`navbarIcons/saveImage.ts`** -- Save image icon.
- **`navbarIcons/trackLabels.ts`** -- Track labels toggle icon.

### Subdirectory: `ui/utils/`

Low-level utility functions:

- **`utils/dom-utils.ts`** -- DOM creation and manipulation helpers: `div()`, `create()`, `hide()`, `show()`, `empty()`, `offset()`, `pageCoordinates()`, `translateMouseCoordinates()`, `guid()`, `relativeDOMBBox()`, `applyStyle()`. The `translateMouseCoordinates()` function is widely used throughout the UI to convert mouse events to element-relative coordinates.
- **`utils/icons.ts`** -- SVG icon creation using Font Awesome-style path data. Contains path definitions for ~20 icons (check, cog, times, plus-circle, minus-circle, search, save, spinner, etc.). Exports `createIcon(name, color)` and `createCheckbox(name, initialState)`.
- **`utils/draggable.ts`** -- `makeDraggable(target, handle, constraint)` -- Makes an absolutely-positioned element draggable by its handle. Tracks drag state globally (only one drag at a time). Prevents dragging off-screen by clamping to element bounds.
- **`utils/ui-utils.ts`** -- `attachDialogCloseHandlerWithParent()` -- Attaches a close (X) button to a dialog header. `throttle(fn, delay)` -- Generic function throttle utility.
- **`utils/colorPalettes.ts`** -- Color palette definitions exported by `ui/utils/colorPalettes.ts` (distinct from `util/colorPalletes.ts`).

## Data Flow

1. **Browser initialization**: `Browser` constructor creates UI components (ZoomWidget, ChromosomeSelectWidget, NavbarButtons, MenuUtils, Alert, CursorGuide, ViewportCenterLine) and attaches them to the DOM. Components register event listeners on the browser instance.
2. **User navigation**: ZoomWidget click/slider --> `browser.zoomIn()`/`browser.zoomOut()`/`browser.zoomWithScaleFactor()`. ChromosomeSelectWidget change --> `browser.updateLoci()`. Browser fires `locuschange` event --> ZoomWidget updates slider, ChromosomeSelectWidget updates value.
3. **Track menus**: Gear button click --> `MenuPopup.presentMenuList()` with items from `MenuUtils.trackMenuItemList()`. Item click --> handler calls track methods (set height, set color, remove track, etc.) --> `trackView.repaintViews()`.
4. **Feature popups**: Canvas click --> `ClickState` constructed --> `track.popupData(clickState)` returns `PopupData[]` --> `Popover.presentMenu()` displays the data.
5. **Image export**: SaveImageControl dropdown --> `browser.saveSVGtoFile()` or `browser.savePNGtoFile()`.

## Dependencies

**Depends on**:
- `js/browser.ts` (Browser class, event system)
- `js/trackView.ts` (TrackView for menu context)
- `js/types/ui.ts` (MenuItem, Track, ClickState interfaces)
- `js/util/colorPalletes.ts` (color palettes for menus)
- `js/igv-icons.ts` (createCheckbox)
- `js/referenceFrame.ts` (ReferenceFrame for zoom calculations)
- `js/rulerViewport.ts` (RulerViewport for cursor guide coordinate display)
- Third-party: `vanilla-picker` (color picker), `dompurify` (HTML sanitization)

**Depended on by**:
- `js/browser.ts` -- Creates and manages all UI components.
- `js/trackView.ts` -- Uses `MenuPopup` and `Popover` for track menus and popups.
- `js/responsiveNavbar.ts` -- Layouts navbar button components.
- Various track types -- Use menu utilities for track-specific menus.
