import {byteToUnsignedInt, modificationName} from "./baseModificationUtils"
import {complementBase} from "../../util/sequenceUtils"
import BaseModificationKey from "./baseModificationKey"

interface BaseModificationSet {
    base: string
    strand: string
    modification: string
    canonicalBase: string
    likelihoods: Map<number, number>
    containsPosition(readIdx: number): boolean
}

interface AlignmentBlock {
    type?: string
    len: number
    seqOffset: number
    start: number
}

interface Alignment {
    blocks?: AlignmentBlock[]
    getBaseModificationSets(): BaseModificationSet[] | null
}

type LikelihoodMap = Map<BaseModificationKey, Map<number, number[]>>

class BaseModificationCounts {

    /**
     * Set of all modification seen.
     */
    allModifications: Set<BaseModificationKey> = new Set()

    simplexModifications: Set<string> = new Set()

    /**
     * Maxixum likelihood (i.e. maximum of all modifications present) for each position and base moodification key*
     */
    maxLikelihoods: LikelihoodMap = new Map()

    /**
     * Maximum likelihood including no-modification (1 - sum(likelihoods)) for each position and base moodification key*
     */
    nomodLikelihoods: LikelihoodMap = new Map()

    lastThreshold: number | undefined


    /**
     * Increment modification counts for each position spanned by the supplied alignments.  Currently both thresholded
     * and total counts are tallied to support different coloring schemes.
     *
     * @param alignment
     */
    incrementCounts(alignment: Alignment): void {

        // Only works with block formats
        if (!alignment.blocks) return

        const baseModificationSets: BaseModificationSet[] | null = alignment.getBaseModificationSets()
        if (baseModificationSets) {

            for (let block of alignment.blocks) {

                //        /*
                //          start: scPos,
                //                 seqOffset: seqOffset,
                //                 len: c.len,
                //                 type: 'S'
                //          */

                if(block.type === 'S') continue // Soft clip

                for (let blockIdx = 0; blockIdx < block.len; blockIdx++) {

                    let readIdx: number = blockIdx + block.seqOffset
                    let canonicalBase: string | number = 0
                    let maxLH: number = -1
                    let maxKey: BaseModificationKey | undefined
                    let noModLH: number = 255

                    for (let bmset of baseModificationSets) {

                        //String modification = bmset.getModification();
                        const key: BaseModificationKey = BaseModificationKey.getKey(bmset.base, bmset.strand, bmset.modification)
                        this.allModifications.add(key)
                        const likelihoods: Map<number, number> = bmset.likelihoods

                        if (bmset.containsPosition(readIdx)) {

                            const lh: number = byteToUnsignedInt(likelihoods.get(readIdx)!)
                            noModLH -= lh
                            if (lh > maxLH) {
                                canonicalBase = bmset.canonicalBase
                                maxLH = lh
                                maxKey = key
                            }
                        }
                    }
                    // Count the modification with highest likelihood, which might be the likelihood of no-modification
                    if (canonicalBase != 0) {
                        const position: number = block.start + blockIdx

                        const noModKey: BaseModificationKey = BaseModificationKey.getKey(canonicalBase as string, '+', "NONE_" + canonicalBase)
                        this.allModifications.add(noModKey)

                        const pushLikelihood = (position: number, byteLikelihood: number, modKey: BaseModificationKey, likelihoods: LikelihoodMap): void => {
                            let t: Map<number, number[]> | undefined = likelihoods.get(modKey)
                            if (!t) {
                                t = new Map()
                                likelihoods.set(modKey, t)
                            }
                            let byteArrayList: number[] | undefined = t.get(position)
                            if (!byteArrayList) {
                                byteArrayList = []
                                t.set(position, byteArrayList)
                            }
                            byteArrayList.push(byteLikelihood)
                        }

                        // mono color counts -- does not include no-modification
                        pushLikelihood(position, maxLH, maxKey!, this.maxLikelihoods)

                        // 2-color counts, which include no-modification
                        if (noModLH > maxLH) {
                            pushLikelihood(position, noModLH, noModKey, this.nomodLikelihoods)
                        } else {
                            pushLikelihood(position, maxLH, maxKey!, this.nomodLikelihoods)
                        }

                    }

                }
            }
        }
    }


    getCount(position: number, key: BaseModificationKey, threshold: number, includeNoMods: boolean): number {

        this.lastThreshold = threshold
        const scaledThreshold: number = threshold * 255

        const t: Map<number, number[]> | undefined = includeNoMods ? this.nomodLikelihoods.get(key) : this.maxLikelihoods.get(key)
        if (!t) {
            return 0
        }

        const byteArrayList: number[] | undefined = t.get(position)
        if (!byteArrayList) {
            return 0
        } else {
            let count: number = 0
            for (let byteLikelihood of byteArrayList) {
                const lh: number = byteToUnsignedInt(byteLikelihood)
                if (lh >= scaledThreshold) {
                    count++
                }
            }
            return count
        }
    }

    getLikelihoodSum(position: number, key: BaseModificationKey, threshold: number, includeNoMods: boolean): number {
        this.lastThreshold = threshold
        const scaledThreshold: number = threshold * 255
        const t: Map<number, number[]> | undefined = includeNoMods ? this.nomodLikelihoods.get(key) : this.maxLikelihoods.get(key)
        const byteArrayList: number[] | undefined = t!.get(position)
        if (!byteArrayList) {
            return 0
        } else {
            let count: number = 0
            for (let byteLikelihood of byteArrayList) {
                const lh: number = byteToUnsignedInt(byteLikelihood)
                if (lh >= scaledThreshold) {
                    count += lh
                }
            }
            return count
        }
    }


    popupData(position: number, colorOption: string): string[] {
        const nameValues: string[] = []
        nameValues.push("<b>Modifications with likelihood > " + (this.lastThreshold! * 100) + "%</b>")

        for (let key of this.maxLikelihoods.keys()) {
            const t: Map<number, number[]> = this.maxLikelihoods.get(key)!
            if (t.has(position)) {
                let includeNoMods: boolean = colorOption === "basemod2"
                const count: number = this.getCount(position, key, this.lastThreshold!, includeNoMods)
                if (count > 0) {
                    const likelihoodSum: number = this.getLikelihoodSum(position, key, this.lastThreshold!, includeNoMods)
                    const averageLikelihood: number = (likelihoodSum / count) * .3921568      // => 100/255
                    const modName: string = modificationName(key.modification)
                    nameValues.push(modName + " (" + key.base + key.strand + "): " + count + "  @ average likelihood " + Math.round(averageLikelihood) + "%")
                }
            }
        }
        return nameValues
    }

    // Search modification keys for "simplex" data,  e.g. C+m without corresponding G-m, indicating only 1 strand of molecule was read or recorded
    computeSimplex(): void {
        const minusStranMods: Set<string> = new Set(Array.from(this.allModifications)
            .filter(key => key.strand === "-")
            .map(key => key.modification))
        for (let key of this.allModifications) {
            if (key.strand === "+" && !minusStranMods.has(key.modification)) {
                this.simplexModifications.add(key.modification)
                this.simplexModifications.add("NONE_" + key.getCanonicalBase())  // Mix of simplex & duplex keys for same base not supported.
            }
        }
    }
}


export default BaseModificationCounts
export type {BaseModificationSet}
