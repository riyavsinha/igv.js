// SNP constants
import {calculateFeatureCoordinates} from "./renderFeature.js"

const codingNonSynonSet: Set<string> = new Set(['nonsense', 'missense', 'stop-loss', 'frameshift', 'cds-indel'])
const codingSynonSet: Set<string> = new Set(['coding-synon'])
const spliceSiteSet: Set<string> = new Set(['splice-3', 'splice-5'])
const untranslatedSet: Set<string> = new Set(['untranslated-5', 'untranslated-3'])
const locusSet: Set<string> = new Set(['near-gene-3', 'near-gene-5'])
const intronSet: Set<string> = new Set(['intron'])

interface SnpFeature {
    start: number;
    end: number;
    func: string;
    class: string;
    [key: string]: any;
}

interface FeatureCoordinates {
    px: number;
    pw: number;
}

interface SnpTrackContext {
    margin: number;
    snpColors: string[];
    displayMode: string;
    squishedRowHeight: number;
    expandedRowHeight: number;
    colorBy: string;
}

/**
 * Renderer for a UCSC snp track
 *
 * @param snp
 * @param bpStart  genomic location of the left edge of the current canvas
 * @param xScale  scale in base-pairs per pixel
 * @param pixelHeight  pixel height of the current canvas
 * @param ctx  the canvas 2d context
 */
export function renderSnp(this: SnpTrackContext, snp: SnpFeature, bpStart: number, xScale: number, pixelHeight: number, ctx: CanvasRenderingContext2D): void {

    var coord: FeatureCoordinates = calculateFeatureCoordinates(snp, bpStart, xScale),
        py: number = this.margin,
        h: number,
        colorArrLength: number = this.snpColors.length,
        colorPriority: number

    h = this.displayMode === "squished" ? this.squishedRowHeight : this.expandedRowHeight

    switch (this.colorBy) {
        case 'function':
            colorPriority = colorByFunc(snp.func)
            break
        case 'class':
            colorPriority = colorByClass(snp['class'])
    }

    ctx.fillStyle = this.snpColors[colorPriority]
    ctx.fillRect(coord.px, py, coord.pw, h)

    // Coloring functions, convert a value to a priority

    function colorByFunc(theFunc: string): number {
        var priorities: number[]
        var funcArray: string[] = theFunc.split(',')
        // possible func values


        priorities = funcArray.map(function (func: string): number {
            if (codingNonSynonSet.has(func) || spliceSiteSet.has(func)) {
                return colorArrLength - 1
            } else if (codingSynonSet.has(func)) {
                return colorArrLength - 2
            } else if (untranslatedSet.has(func)) {
                return colorArrLength - 3
            } else { // locusSet.has(func) || intronSet.has(func)
                return 0
            }
        })

        return priorities.reduce(function (a: number, b: number): number {
            return Math.max(a, b)
        })
    }

    function colorByClass(cls: string): number {
        if (cls === 'deletion') {
            return colorArrLength - 1
        } else if (cls === 'mnp') {
            return colorArrLength - 2
        } else if (cls === 'microsatellite' || cls === 'named') {
            return colorArrLength - 3
        } else { // cls === 'single' || cls === 'in-del' || cls === 'insertion'
            return 0
        }
    }
}
