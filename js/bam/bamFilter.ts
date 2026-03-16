interface BamFilterOptions {
    vendorFailed?: boolean
    duplicate?: boolean
    duplicates?: boolean
    secondary?: boolean
    supplementary?: boolean
    mq?: number
    readgroups?: string[]
}

interface BamAlignment {
    isMapped(): boolean
    isFailsVendorQualityCheck(): boolean
    isDuplicate(): boolean
    isSecondary(): boolean
    isSupplementary(): boolean
    mq: number
    getTag(tag: string): string | number | number[] | null | undefined
}

class BamFilter {
    vendorFailed: boolean
    duplicate: boolean
    secondary: boolean
    supplementary: boolean
    mq: number
    readgroups?: Set<string>

    constructor(options?: BamFilterOptions) {
        options = options || {}

        // Default to true unless explicitly set to false
        this.vendorFailed = options.vendorFailed !== false

        // Support both 'duplicate' and 'duplicates' as synonyms
        const duplicateValue = options.duplicate !== undefined ? options.duplicate : options.duplicates
        this.duplicate = duplicateValue !== false

        this.secondary = options.secondary || false
        this.supplementary = options.supplementary || false
        this.mq = options.mq || 0

        if (options.readgroups) {
            this.readgroups = new Set(options.readgroups)
        }
    }

    pass(alignment: BamAlignment): boolean {
        if (!alignment.isMapped()) return false
        if (this.vendorFailed && alignment.isFailsVendorQualityCheck()) return false
        if (this.duplicate && alignment.isDuplicate()) return false
        if (this.secondary && alignment.isSecondary()) return false
        if (this.supplementary && alignment.isSupplementary()) return false
        if (alignment.mq < this.mq) return false
        if (this.readgroups) {
            const rg = alignment.getTag('RG') as string
            return this.readgroups.has(rg)
        }
        return true
    }
}

export default BamFilter
