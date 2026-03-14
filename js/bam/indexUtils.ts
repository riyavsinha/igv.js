interface VirtualOffset {
    block: number
    offset: number
    isGreaterThan(other: VirtualOffset): boolean
}

interface Chunk {
    minv: VirtualOffset
    maxv: VirtualOffset
}

function optimizeChunks(chunks: Chunk[], lowest?: VirtualOffset): Chunk[] {

    if (chunks.length === 0) return chunks

    chunks.sort(function (c0: Chunk, c1: Chunk): number {

        const dif = c0.minv.block - c1.minv.block
        if (dif !== 0) {
            return dif
        } else {
            return c0.minv.offset - c1.minv.offset
        }
    })

    if (chunks.length <= 1) {
        return chunks
    }

    if (lowest) {
        chunks = chunks.filter(c => c.maxv.isGreaterThan(lowest))
    }

    const mergedChunks: Chunk[] = []
    let lastChunk: Chunk | undefined
    for (let chunk of chunks) {

        if (!lastChunk) {
            mergedChunks.push(chunk)
            lastChunk = chunk
        } else {
            if (canMerge(lastChunk, chunk)) {
                if (chunk.maxv.isGreaterThan(lastChunk.maxv)) {
                    lastChunk.maxv = chunk.maxv
                }
            } else {
                mergedChunks.push(chunk)
                lastChunk = chunk
            }
        }
    }

    return mergedChunks
}


/**
 * Merge 2 blocks if the file position gap between them is < 16 kb, and the total size is < ~5 mb
 * @param chunk1
 * @param chunk2
 * @returns {boolean}
 */
function canMerge(chunk1: Chunk, chunk2: Chunk): boolean {
    const gap = chunk2.minv.block - chunk1.maxv.block
    const sizeEstimate = chunk2.maxv.block - chunk1.minv.block
    return sizeEstimate < 5000000 && gap < 65000
}

export {optimizeChunks}
export type {Chunk, VirtualOffset}
