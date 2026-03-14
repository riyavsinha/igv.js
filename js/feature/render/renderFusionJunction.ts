
interface SpanningCoord {
    left: number
    right: number
}

interface FusionJunctionFeature {
    junction_left: number
    junction_right: number
    num_junction_reads: number
    spanning_frag_coords: SpanningCoord[]
    row?: number
}

/**
 *
 * @param feature
 * @param bpStart  genomic location of the left edge of the current canvas
 * @param xScale  scale in base-pairs per pixel
 * @param pixelHeight  pixel height of the current canvas
 * @param ctx  the canvas 2d context
 */
export function renderFusionJuncSpan(this: any, feature: FusionJunctionFeature, bpStart: number, xScale: number, pixelHeight: number, ctx: CanvasRenderingContext2D): void {

    const rowHeight: number = (this.displayMode === "EXPANDED") ? this.expandedRowHeight : this.squishedRowHeight
    let py: number = this.margin
    if (this.displayMode !== "COLLAPSED" && feature.row !== undefined) {
        py += feature.row * rowHeight
    }

    const cy: number = py + 0.5 * rowHeight
    const topY: number = cy - 0.5 * rowHeight
    const bottomY: number = cy + 0.5 * rowHeight

    // draw the junction arc
    const junctionLeftPx: number = Math.round((feature.junction_left - bpStart) / xScale)
    const junctionRightPx: number = Math.round((feature.junction_right - bpStart) / xScale)

    ctx.beginPath()
    ctx.moveTo(junctionLeftPx, cy)
    ctx.bezierCurveTo(junctionLeftPx, topY, junctionRightPx, topY, junctionRightPx, cy)

    ctx.lineWidth = 1 + Math.log(feature.num_junction_reads) / Math.log(2)
    ctx.strokeStyle = 'blue'
    ctx.stroke()

    // draw the spanning arcs
    const spanningCoords: SpanningCoord[] = feature.spanning_frag_coords
    for (let i = 0; i < spanningCoords.length; i++) {

        const spanningInfo: SpanningCoord = spanningCoords[i]
        const spanLeftPx: number = Math.round((spanningInfo.left - bpStart) / xScale)
        const spanRightPx: number = Math.round((spanningInfo.right - bpStart) / xScale)

        ctx.beginPath()
        ctx.moveTo(spanLeftPx, cy)
        ctx.bezierCurveTo(spanLeftPx, bottomY, spanRightPx, bottomY, spanRightPx, cy)

        ctx.lineWidth = 1
        ctx.strokeStyle = 'purple'
        ctx.stroke()
    }
}
