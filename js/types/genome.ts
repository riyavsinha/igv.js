/**
 * Genome-related type definitions
 */

import type Chromosome from "../genome/chromosome"

export interface GenomeConfig {
    id?: string
    name?: string
    fastaURL?: string
    indexURL?: string
    cytobandURL?: string
    aliasURL?: string
    chromAliasBbURL?: string
    chromSizesURL?: string
    twoBitURL?: string
    twoBitBptURL?: string
    chromosomeOrder?: string[] | string
    format?: string
    compressedIndexURL?: string
    withCredentials?: boolean
    nameSet?: string
    /** Allow arbitrary additional properties */
    [key: string]: unknown
}

export interface ChromAlias {
    getChromosomeName(alias: string): string
    getChromosomeAlias(chr: string, nameSet: string): string
    search(alias: string): Record<string, string> | undefined | Promise<Record<string, string> | undefined>
    preload(chrNames?: string[]): Promise<void>
}

export interface SequenceSource {
    init(): Promise<void>
    getSequence(chr: string, start: number, end: number): Promise<string | null>
    getSequenceRecord?(chr: string): Chromosome | undefined
    chromosomeNames?: string[]
}
