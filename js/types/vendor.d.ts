// Ambient type declarations for vendor dependencies without their own types

declare module '*hdf5-indexed-reader/dist/hdf5-indexed-reader.esm.js' {
    export function openH5File(options: string | Record<string, unknown>): Promise<unknown>
}

declare module '*hic-straw/src/hicFile.js' {
    interface HicChromosome {
        name: string
        [key: string]: unknown
    }
    interface HicNormalizationVector {
        getValues(start: number, end: number): Promise<number[]>
    }
    interface HicContactRecord {
        bin1: number
        bin2: number
        counts: number
    }
    interface HicRegion {
        chr: string
        start: number
        end: number
    }
    class HicFile {
        initialized: boolean
        bpResolutions: number[]
        chromosomes: HicChromosome[]
        constructor(config: Record<string, unknown>)
        init(): Promise<void>
        readHeaderAndFooter(): Promise<void>
        getNormalizationOptions(): Promise<string[]>
        getNormalizationVector(type: string, chr: string, unit: string, binSize: number): Promise<HicNormalizationVector>
        getContactRecords(
            normalization: string | undefined,
            region1: HicRegion,
            region2: HicRegion,
            unit: string,
            binSize: number
        ): Promise<HicContactRecord[]>
    }
    export default HicFile
}

declare module '*circular-view/dist/circular-view.js' {
    interface CircularViewConfig {
        onChordClick?: (feature: { data: unknown }, chordTrack: unknown, pluginManager: unknown) => void
        [key: string]: unknown
    }
    interface ChordOptions {
        track: string
        color: string
        trackColor: string
    }
    class CircularView {
        static isInstalled(): boolean
        constructor(container: HTMLElement, config: CircularViewConfig)
        addChords(chords: unknown[], options: ChordOptions): void
    }
    export { CircularView }
}

declare module '*vanilla-picker/dist/vanilla-picker.csp.mjs' {
    interface PickerColor {
        hex: string
        rgbString: string
        rgba: string
        [key: string]: unknown
    }
    interface PickerOptions {
        parent?: HTMLElement
        popup?: string
        editor?: boolean
        editorFormat?: string
        alpha?: boolean
        color?: string
        [key: string]: unknown
    }
    class Picker {
        constructor(options?: HTMLElement | PickerOptions)
        show(): void
        hide(): void
        destroy(): void
        setColor(color: string, silent?: boolean): void
        setOptions(options: PickerOptions): void
        onOpen: (() => void) | null
        onChange: ((color: PickerColor) => void) | null
        onDone: ((color: PickerColor) => void) | null
    }
    export default Picker
}
