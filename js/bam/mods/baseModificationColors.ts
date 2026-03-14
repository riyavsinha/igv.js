import {byteToUnsignedInt} from "./baseModificationUtils"
import {IGVColor} from "../../../node_modules/igv-utils/src/index.js"

/**
 * C Modifications
 * C m 5mC 5-Methylcytosine 27551
 * C h 5hmC 5-Hydroxymethylcytosine 76792
 * C f 5fC 5-Formylcytosine 76794
 * C c 5caC 5-Carboxylcytosine 76793
 * C C Ambiguity code; any C mod
 */

const mColor: string = "rgb(255,0,0)"
const hColor: string = "rgb(255,0,255)"
const aColor: string = "rgb(51,0,111)"
const oColor: string = "rgb(111, 78, 129)"
const fColor: string = "rgb(246, 200, 95)"
const cColor: string = "rgb(157, 216, 102)"
const gColor: string = "rgb(255, 160, 86)"
const eColor: string = "rgb(141, 221, 208)"
const bColor: string = "rgb(202, 71, 47)"
const noModColor: string = "rgb(0,0,255)"
const genericColor: string = "rgb(132, 178, 158)"

const colors: Map<string, string> = new Map()
colors.set("m", mColor)
colors.set("h", hColor)
colors.set("o", oColor)
colors.set("f", fColor)
colors.set("c", cColor)
colors.set("g", gColor)
colors.set("e", eColor)
colors.set("b", bColor)
// NOTE: Duplicate entry - "h" is set twice (line 28 and 34 in original). The second set is redundant.
colors.set("h", hColor)
colors.set("a", aColor)
colors.set("NONE_A", noModColor)
colors.set("NONE_C", noModColor)
colors.set("NONE_T", noModColor)
colors.set("NONE_G", noModColor)
colors.set("NONE_N", noModColor)

/**
 * Cache for modified colors
 */
const modColorMap: Map<string, string> = new Map()

function getModColor(modification: string, likelihood: number, colorOption: string): string {

    let baseColor: string = getBaseColor(modification, colorOption)

    let l: number = byteToUnsignedInt(likelihood)
    if (l > 255) {
        return baseColor
    }

    const key: string = modification + l + colorOption

    const threshold: number = 256 * 0 //PreferencesManager.getPreferences().getAsFloat("SAM.BASEMOD_THRESHOLD");
    if (l < threshold) {
        l = 0
    }
    if (!modColorMap.has(key)) {
        const alpha: number = colorOption === "basemod2" ?
            Math.max(20, Math.min(255, 20 + (l * l / 50 - 4 * l + 200))) :
            Math.max(20, Math.min(255, 6.127e-3 * l * l))

        const [r, g, b] = IGVColor.rgbComponents(baseColor)
        modColorMap.set(key, `rgba(${r},${g},${b},${alpha / 255})`)
    }
    return modColorMap.get(key)!

}


function getBaseColor(modification: string, colorOption: string): string {
    if (colors.has(modification)) {
        return colors.get(modification)!
    } else {
        return genericColor
    }
}

export {getModColor}
