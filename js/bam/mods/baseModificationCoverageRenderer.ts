import {getModColor} from "./baseModificationColors"
import {complementBase} from "../../util/sequenceUtils"
import BaseModificationKey from "./baseModificationKey"
import BaseModificationCounts from "./baseModificationCounts"

interface CoverageMap {
    getTotalCount(pos: number): number
    getCount(pos: number, base: string): number
    getPosCount(pos: number, base: string): number
    getNegCount(pos: number, base: string): number
}

interface AlignmentContainerWithMods {
    baseModCounts: BaseModificationCounts | undefined
    coverageMap: CoverageMap
}

function drawModifications(ctx: CanvasRenderingContext2D,
                           pX: number,
                           pBottom: number,
                           dX: number,
                           barHeight: number,
                           pos: number,
                           alignmentContainer: AlignmentContainerWithMods,
                           colorOption: string,
                           threshold: number): void {

    const modificationCounts: BaseModificationCounts | undefined = alignmentContainer.baseModCounts
    const coverageMap: CoverageMap = alignmentContainer.coverageMap

    if (modificationCounts) {

        let selectedModification: string | undefined
        const parts: string[] = colorOption.split(":")
        if(parts.length == 2) {
            colorOption = parts[0]
            selectedModification = parts[1]
        }

        //Set<BaseModificationKey> allModificationKeys = modificationCounts.getAllModificationKeys();
        //List<BaseModificationKey> sortedKeys = new ArrayList<>(allModificationKeys);
        const sortedKeys: BaseModificationKey[] = Array.from(modificationCounts.allModifications)
        sortedKeys.sort(BaseModificationKey.compare)

        const total: number = coverageMap.getTotalCount(pos)

        // If site has no modification likelihoods skip (don't draw only "NONE_")
        const realModificationKeys: BaseModificationKey[] = sortedKeys.filter(key => {
            if (selectedModification) {
                return selectedModification === key.modification
            } else {
                return !key.modification.startsWith("NONE_")
            }
        })
        if(!realModificationKeys.find(key => modificationCounts.getCount(pos, key, 0, false) > 0)) {
            return
        }

        for (let key of sortedKeys) {

            //if (filter && !filter.pass(key.modification, key.getCanonicalBase())) continue;

            if (key.modification.startsWith("NONE_") && colorOption !== "basemod2")
                continue

            if(selectedModification && selectedModification !== key.modification && !key.modification.startsWith("NONE_")) {
                continue
            }


            const base: string = key.base
            const compl: string = complementBase(base)

            const modifiable: number = coverageMap.getCount(pos, base) + coverageMap.getCount(pos, compl)
            const detectable: number = modificationCounts.simplexModifications.has(key.modification) ?
                coverageMap.getPosCount(pos, base) + coverageMap.getNegCount(pos, compl) :
                modifiable


            if (detectable == 0) continue  //No informative reads

            const includeNoMod: boolean = colorOption === "basemod2"

            const count: number = modificationCounts.getCount(pos, key, threshold, includeNoMod )
            if (count == 0) continue

            const modFraction: number = (modifiable / total) * (count / detectable)
            const modHeight: number = Math.round(modFraction * barHeight)

            const likelihoodSum: number = modificationCounts.getLikelihoodSum(pos, key, threshold, includeNoMod)
            const averageLikelihood: number = likelihoodSum / count

            const baseY: number = pBottom - modHeight
            const modColor: string = getModColor(key.modification, averageLikelihood, colorOption)

            ctx.fillStyle = modColor
            ctx.fillRect(pX, baseY, dX, modHeight)
            pBottom = baseY
        }
    }
}


export {drawModifications}
