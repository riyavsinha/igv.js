// Ambient type declarations for vendor dependencies without their own types

declare module '*hdf5-indexed-reader/dist/hdf5-indexed-reader.esm.js' {
    export function openH5File(options: string | Record<string, unknown>): Promise<unknown>
}

declare module '*hic-straw/src/hicFile.js' {
    const HicFile: any
    export default HicFile
}

declare module '*circular-view/dist/circular-view.js' {
    export function makeCircularView(container: HTMLElement, config: any): any
    export function createCircularView(container: HTMLElement, config: any): any
    export const CircularView: any
    const _default: any
    export default _default
}

declare module '*vanilla-picker/dist/vanilla-picker.csp.mjs' {
    class Picker {
        constructor(options?: any)
        show(): void
        hide(): void
        destroy(): void
        setColor(color: string, silent?: boolean): void
        [key: string]: any
    }
    export default Picker
}
