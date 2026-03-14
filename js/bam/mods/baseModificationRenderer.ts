import {byteToUnsignedInt} from "./baseModificationUtils"
import {getModColor} from "./baseModificationColors"

interface BaseModificationSet {
    base: string
    strand: string
    modification: string
    canonicalBase: string
    likelihoods: Map<number, number>
    containsPosition(idx: number): boolean
}

interface AlignmentBlock {
    type?: string
    seqOffset: number
    len: number
    start: number
}

interface Alignment {
    blocks?: AlignmentBlock[]
    getBaseModificationSets(): BaseModificationSet[] | null
}

interface RenderContext {
    ctx: CanvasRenderingContext2D
    pixelEnd: number
    bpStart: number
    bpPerPixel: number
}


class BaseModificationRenderer {

    alignmentTrack: any
    context: RenderContext | undefined

    constructor(alignmentTrack: any) {
        this.alignmentTrack = alignmentTrack
    }

    /**
     * Update the context in which alignments are drawn.
     *  ctx,
     *  bpPerPixel,
     *  bpStart,
     *  bpEnd,
     *  pixelEnd,
     *  refSequence,
     *  refSequenceStart
     *
     * @param context
     */
    updateContext(context: RenderContext): void {
        this.context = context
    }

    drawModifications(alignment: Alignment, y: number, height: number, context: RenderContext, colorOption: string, threshold: number): void {

        const {ctx, pixelEnd, bpStart, bpPerPixel} = context

        const baseModificationSets: BaseModificationSet[] | null = alignment.getBaseModificationSets()
        if (baseModificationSets) {

            let selectedModification: string | undefined
            const parts: string[] = colorOption.split(":")
            if(parts.length == 2) {
                colorOption = parts[0]
                selectedModification = parts[1]
            }

            for (let block of alignment.blocks!) {

                if (block.type === 'S') continue   // Soft clip

                // Compute bounds
                const pY: number = y
                const dY: number = height
                let dX: number = Math.max(1, (1.0 / bpPerPixel))

                // Loop through sequence for this block
                for (let i: number = block.seqOffset; i < block.seqOffset + block.len; i++) {

                    let pX: number = ((block.start + (i - block.seqOffset) - bpStart) / bpPerPixel)
                    // Don't draw out of clipping rect
                    if (pX > pixelEnd) {
                        break
                    } else if (pX + dX < 0) {
                        continue
                    }

                    // Search all sets for modifications of this base, select modification with largest likelihood
                    let maxLh: number = -1
                    let noModLh: number = 255
                    let modification: string | undefined = undefined
                    let canonicalBase: string | number = 0

                    for (let bmSet of baseModificationSets) {
                        if(selectedModification && bmSet.modification !== selectedModification) {
                            continue
                        }
                        if (bmSet.containsPosition(i)) {
                            const lh: number = byteToUnsignedInt(bmSet.likelihoods.get(i)!)
                            noModLh -= lh
                            if (!modification || lh > maxLh) {         // TODO -- filter
                                modification = bmSet.modification
                                canonicalBase = bmSet.canonicalBase
                                maxLh = lh
                            }
                        }
                    }


                    if (modification) {

                        const scaledThreshold: number = threshold * 255

                        let c: string | undefined
                        if (noModLh > maxLh && colorOption === "basemod2" && noModLh >= scaledThreshold) {
                            c = getModColor("NONE_" + canonicalBase, noModLh, colorOption);
                        } else if (maxLh >= scaledThreshold) {
                            c = getModColor(modification, maxLh, colorOption);
                        }

                        ctx.fillStyle = c!

                        // Expand narrow width to make more visible
                        if (dX < 3) {
                            dX = 3
                            pX--
                        }
                        ctx.fillRect(pX, pY, dX, Math.max(1, dY - 2))

                    }
                }
            }
        }
    }
}


export default BaseModificationRenderer
