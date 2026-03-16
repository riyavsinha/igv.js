// Ambient type declarations for igv-utils (source import from node_modules)
// This eliminates TS7016 "could not find declaration file" errors
// Uses wildcard module declarations to cover all relative-path import depths

declare module '*igv-utils/src/index.js' {
    export const StringUtils: {
        isString(value: any): boolean
        hashCode(str: string): number
        numberFormatter(number: number): string
        splitLines(str: string): string[]
        capitalize(str: string): string
        [key: string]: any
    }

    export const FileUtils: {
        isFile(value: any): boolean
        getFilename(path: string): string
        isFilePath(path: any): boolean
        [key: string]: any
    }

    export const URIUtils: {
        isDataURL(url: string): boolean
        isGoogleURL(url: string): boolean
        isAmazonV2(url: string): boolean
        [key: string]: any
    }

    export const FeatureUtils: {
        packFeatures(features: any[], maxRows?: number): any[]
        [key: string]: any
    }

    export const IGVColor: {
        rgbColor(r: number, g: number, b: number): string
        rgbaColor(r: number, g: number, b: number, a: number): string
        addAlpha(color: string, alpha: number): string
        rgbComponents(color: string): number[]
        complementFont(backgroundRGB: number[], whiteFont: string, blackFont: string): string
        createColorString(token: string): string
        darkenLighten(color: string, factor: number): string
        randomColor(min: number, max: number): string
        [key: string]: any
    }

    export const IGVMath: {
        mean(array: number[]): number
        percentile(array: number[], p: number): number
        clamp(value: number, min: number, max: number): number
        log2(x: number): number
        [key: string]: any
    }

    export const BGZip: {
        unzip(data: ArrayBuffer): ArrayBuffer
        isBlockCompressed(data: ArrayBuffer): boolean
        [key: string]: any
    }

    export const igvxhr: {
        load(url: string, options?: any): Promise<any>
        loadString(url: string, options?: any): Promise<string>
        loadJson(url: string, options?: any): Promise<any>
        loadArrayBuffer(url: string, options?: any): Promise<ArrayBuffer>
        loadByteArray(url: string, options?: any): Promise<Uint8Array>
        setApiKey(key: string): void
        setOauthToken(token: string, host?: string): void
        getOauthToken(host?: string): string | undefined
        corsProxy: string | undefined
        oauth: any
        [key: string]: any
    }

    export const GoogleAuth: {
        init(config: any): Promise<void>
        isInitialized(): boolean
        isSignedIn(): boolean
        signIn(): Promise<void>
        signOut(): Promise<void>
        getAccessToken(): string
        [key: string]: any
    }
}

declare module '*igv-utils/src/index' {
    export * from '*igv-utils/src/index.js'
}

declare module '*igv-utils/src/bgzf.js' {
    const BGZip: {
        unzip(data: ArrayBuffer): ArrayBuffer
        isBlockCompressed(data: ArrayBuffer): boolean
        [key: string]: any
    }
    export default BGZip
    export function isgzipped(data: ArrayBuffer): boolean
    export function ungzip(data: ArrayBuffer): ArrayBuffer
}

declare module '*igv-utils/src/igv-color.js' {
    const IGVColor: {
        rgbColor(r: number, g: number, b: number): string
        rgbaColor(r: number, g: number, b: number, a: number): string
        addAlpha(color: string, alpha: number): string
        rgbComponents(color: string): number[]
        [key: string]: any
    }
    export default IGVColor
}

declare module '*igv-utils/src/stringUtils.js' {
    export function numberFormatter(number: number): string
    export function isString(value: any): boolean
    const StringUtils: {
        isString(value: any): boolean
        numberFormatter(number: number): string
        [key: string]: any
    }
    export default StringUtils
}
