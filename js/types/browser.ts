/**
 * Browser-specific internal type definitions
 */

import type TrackViewport from "../trackViewport.js"
import type ReferenceFrame from "../referenceFrame.js"

/** State captured on viewport mouse-down for drag/pan tracking */
export interface VpMouseDown {
    viewport: TrackViewport
    lastMouseX: number
    mouseDownX: number
    lastMouseY: number
    mouseDownY: number
    referenceFrame: ReferenceFrame
    r?: number
}

/** Active drag state during viewport panning */
export interface DragObject {
    viewport: TrackViewport
    start: number
}
