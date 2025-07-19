/**
 * Manages coordinate transformations for insertion-aware rendering
 * Maps between genomic coordinates and expanded coordinates that include insertion spaces
 */
class VariantAwareCoordinates {
    constructor() {
        this.insertions = new Map() // Map: chr -> array of {pos, insertedBases}
        this.coordinateCache = new Map() // Cache transformed coordinates
    }

    /**
     * Register an insertion that affects coordinates
     * @param {string} chr - chromosome
     * @param {number} pos - genomic position (0-based)
     * @param {string} insertedBases - bases inserted after this position
     */
    addInsertion(chr, pos, insertedBases) {
        if (!this.insertions.has(chr)) {
            this.insertions.set(chr, [])
        }
        
        const chrInsertions = this.insertions.get(chr)
        
        // Check if insertion already exists at this position
        const existingIndex = chrInsertions.findIndex(ins => ins.pos === pos)
        if (existingIndex >= 0) {
            // Update existing insertion to use longest sequence (union approach)
            const existing = chrInsertions[existingIndex]
            if (insertedBases.length > existing.insertedBases.length) {
                existing.insertedBases = insertedBases
            }
        } else {
            // Add new insertion
            chrInsertions.push({ pos, insertedBases })
        }
        
        // Sort insertions by position and clear cache
        chrInsertions.sort((a, b) => a.pos - b.pos)
        this.coordinateCache.clear()
        
        console.log(`Added insertion at ${chr}:${pos} (${insertedBases}), total insertions: ${chrInsertions.length}`)
    }

    /**
     * Convert genomic coordinate to expanded coordinate
     * @param {string} chr - chromosome
     * @param {number} genomicPos - genomic position (0-based)
     * @returns {number} expanded coordinate
     */
    genomicToExpanded(chr, genomicPos) {
        const cacheKey = `${chr}:${genomicPos}`
        if (this.coordinateCache.has(cacheKey)) {
            return this.coordinateCache.get(cacheKey)
        }

        let expandedPos = genomicPos
        const chrInsertions = this.insertions.get(chr) || []
        
        // Add insertion lengths for all insertions before this position
        for (const insertion of chrInsertions) {
            if (insertion.pos < genomicPos) {
                expandedPos += insertion.insertedBases.length
            } else {
                break // Insertions are sorted, so we can stop here
            }
        }
        
        this.coordinateCache.set(cacheKey, expandedPos)
        return expandedPos
    }

    /**
     * Convert expanded coordinate back to genomic coordinate
     * @param {string} chr - chromosome
     * @param {number} expandedPos - expanded position
     * @returns {number} genomic coordinate
     */
    expandedToGenomic(chr, expandedPos) {
        let genomicPos = expandedPos
        const chrInsertions = this.insertions.get(chr) || []
        
        // Subtract insertion lengths
        for (const insertion of chrInsertions) {
            const insertionExpandedPos = this.genomicToExpanded(chr, insertion.pos)
            if (insertionExpandedPos < expandedPos) {
                genomicPos -= insertion.insertedBases.length
            } else {
                break
            }
        }
        
        return genomicPos
    }

    /**
     * Get expanded sequence including insertions
     * @param {string} chr - chromosome  
     * @param {number} start - genomic start position
     * @param {number} end - genomic end position
     * @param {Function} getGenomicSequence - function to get reference sequence
     * @returns {Promise<string>} expanded sequence with insertions
     */
    async getExpandedSequence(chr, start, end, getGenomicSequence) {
        // Get reference sequence
        const refSequence = await getGenomicSequence(chr, start, end)
        if (!refSequence) return null
        
        const chrInsertions = this.insertions.get(chr) || []
        const relevantInsertions = chrInsertions.filter(ins => ins.pos >= start && ins.pos < end)
        
        if (relevantInsertions.length === 0) {
            return refSequence
        }
        
        // Build expanded sequence by inserting bases at appropriate positions
        let expandedSequence = refSequence
        let offset = 0 // Track how much we've shifted due to insertions
        
        for (const insertion of relevantInsertions) {
            const relativePos = insertion.pos - start + offset
            // Insert bases after the reference position
            expandedSequence = expandedSequence.slice(0, relativePos + 1) + 
                              insertion.insertedBases + 
                              expandedSequence.slice(relativePos + 1)
            offset += insertion.insertedBases.length
        }
        
        return expandedSequence
    }

    /**
     * Clear all insertions
     */
    clear() {
        this.insertions.clear()
        this.coordinateCache.clear()
    }

    /**
     * Get information about insertions in a region
     * @param {string} chr - chromosome
     * @param {number} start - start position  
     * @param {number} end - end position
     * @returns {Array} insertions in the region
     */
    getInsertionsInRegion(chr, start, end) {
        const chrInsertions = this.insertions.get(chr) || []
        return chrInsertions.filter(ins => ins.pos >= start && ins.pos < end)
    }
}

export default VariantAwareCoordinates