import HicFile from '../../node_modules/hic-straw/src/hicFile.js'

interface JuiceboxBrowser {
    url: string
    state: string
    name: string
    colorScale: any
    tracks?: any[]
}

interface JuiceboxSession {
    browsers: JuiceboxBrowser[]
}

interface IgvSession {
    sampleNameViewportWidth?: number
    genome?: string
    locus?: string
    tracks?: any[]
}

async function translateSession(juiceboxSession: JuiceboxSession): Promise<IgvSession> {

    const jbBrowser: JuiceboxBrowser = juiceboxSession.browsers[0]
    const igvSession: IgvSession = {}

    const hicFile = new HicFile({url: jbBrowser.url})
    await hicFile.readHeaderAndFooter()
    //`${this.chr1},${this.chr2},${this.zoom},${this.x},${this.y},${this.width},${this.height},${this.pixelSize}`


    igvSession.sampleNameViewportWidth = 20
    igvSession.genome = "hg38"  // TODO -- determine from hicfile

    const stateTokens: string[] = jbBrowser.state.split(",")
    const binSize: number = hicFile.bpResolutions[Number.parseInt(stateTokens[2])]
    const screenWidth: number = 1700  // Approximate guess
    const chrIdx: number = Number.parseInt(stateTokens[0])
    const start: number = Math.floor(Number.parseFloat(stateTokens[3]) * binSize) //- 100
    const end: number = start + Math.floor(screenWidth * binSize) //+ 100
    igvSession.locus = `${hicFile.chromosomes[chrIdx].name}:${start}-${end}`


    igvSession.tracks = (jbBrowser.tracks || []).filter((t: any) => !(t.format === "refgene" || t.name === "cellType"))

    igvSession.tracks.push({
        type: "shoebox",
        url: jbBrowser.url,
        name: jbBrowser.name,
        colorScale: jbBrowser.colorScale,
        _hicFile: hicFile
    })

    return igvSession

}


export {translateSession}
