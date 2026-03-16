interface TrackConfig {
    url?: string
    indexURL?: string
    order?: number
    name?: string
    color?: string
    altColor?: string
    height?: number
    autoscale?: boolean
    autoscaleGroup?: string
    windowFunction?: string
    visibilityWindow?: string
    indexed?: boolean
    normalize?: boolean
    min?: number
    max?: number
    logScale?: boolean
    type?: string
    tracks?: TrackConfig[]
    [key: string]: any
}

class XMLSession {

    genome?: string
    reference?: { fastaURL: string; id?: string }
    locus?: string
    tracks: TrackConfig[]

    constructor(xmlString: string, knownGenomes: Record<string, any>) {

        const parser = new DOMParser()
        const xmlDoc: Document = parser.parseFromString(xmlString, "text/xml")

        this.processRootNode(xmlDoc, knownGenomes)

        const resourceElements: HTMLCollectionOf<Element> = xmlDoc.getElementsByTagName("Resource")
        const trackElements: HTMLCollectionOf<Element> = xmlDoc.getElementsByTagName("Track")
        const hasTrackElements: boolean = trackElements && trackElements.length > 0

        const tracks: TrackConfig[] = []
        this.tracks = tracks

        const resourceMap: Map<string, TrackConfig> = new Map()
        Array.from(resourceElements).forEach(function (r: Element, idx: number) {
            var config: TrackConfig = {
                url: r.getAttribute("path")!,
                indexURL: r.getAttribute("index")!,
                order: idx
            }
            resourceMap.set(config.url!, config)
            if (!hasTrackElements) {
                tracks.push(config)
            }
        })

        // Check for optional Track section
        if (hasTrackElements) {

            Array.from(trackElements).forEach(function (track: Element) {

                const subtracks: HTMLCollectionOf<Element> = track.getElementsByTagName("Track")

                if (subtracks && subtracks.length > 0) {

                    const mergedTrack: TrackConfig = {
                        type: 'merged',
                        tracks: []
                    }
                    extractTrackAttributes(track, mergedTrack)

                    tracks.push(mergedTrack)

                    Array.from(subtracks).forEach(function (t: any) {
                        t.processed = true
                        const id: string | null = t.getAttribute("id")
                        const config: TrackConfig | undefined = resourceMap.get(id!)
                        if (config) {
                            mergedTrack.tracks!.push(config)
                            extractTrackAttributes(t, config)
                            config.autoscale = false
                            mergedTrack.height = config.height

                            // Add alpha for merged track colors.  Alpha is not recorded by IGV desktop in XML session
                            //const color = t.getAttribute("color");
                            //if (color) {
                            //    config.color = "rgba(" + color + ",0.5)";
                            //}
                        }
                    })
                } else if (!(track as any).processed) {

                    const id: string | null = track.getAttribute("id")
                    const res: TrackConfig | undefined = resourceMap.get(id!)
                    if (res) {
                        tracks.push(res)
                        extractTrackAttributes(track, res)
                    }

                }
            })
        }
    }

    processRootNode(xmlDoc: Document, knownGenomes: Record<string, any>): void {

        const elements: HTMLCollectionOf<Element> = xmlDoc.getElementsByTagName("Session")
        if (!elements || elements.length === 0) {
            //TODO throw error
        }
        const session: Element = elements.item(0)!
        const genome: string | null = session.getAttribute("genome")
        const locus: string | null = session.getAttribute("locus")
        const ucscID: string | null = session.getAttribute("ucscID")

        if (knownGenomes && knownGenomes.hasOwnProperty(genome!)) {
            this.genome = genome!

        } else {
            this.reference = {
                fastaURL: genome!
            }
            if (ucscID) {
                this.reference.id = ucscID
            }
        }
        if (locus) {
            this.locus = locus
        }
    }

}


function extractTrackAttributes(track: Element, config: TrackConfig): void {


    config.name = track.getAttribute("name")!

    const color: string | null = track.getAttribute("color")
    if (color) {
        config.color = "rgb(" + color + ")"
    }

    const altColor: string | null = track.getAttribute("altColor")
    if (color) {
        config.altColor = "rgb(" + altColor + ")"
    }

    const height: string | null = track.getAttribute("height")
    if (height) {
        config.height = parseInt(height)
    }

    const autoScale: string | null = track.getAttribute("autoScale")
    if (autoScale) {
        config.autoscale = (autoScale === "true")
    }

    const autoscaleGroup: string | null = track.getAttribute("autoscaleGroup")
    if (autoscaleGroup) {
        config.autoscaleGroup = autoscaleGroup
    }

    const windowFunction: string | null = track.getAttribute("windowFunction")
    if (windowFunction) {
        config.windowFunction = windowFunction
    }
    const visWindow: string | null = track.getAttribute("visibilityWindow") || track.getAttribute("featureVisibilityWindow")
    if (visWindow) {
        config.visibilityWindow = visWindow
    }

    const indexed: string | null = track.getAttribute("indexed")
    if (indexed) {
        config.indexed = (indexed === "true")
    }

    const normalize: string | null = track.getAttribute("normalize")
    if (normalize) {
        config.normalize = normalize === "true"
    }

    const dataRangeCltn: HTMLCollectionOf<Element> = track.getElementsByTagName("DataRange")
    if (dataRangeCltn.length > 0) {
        const dataRange: Element = dataRangeCltn.item(0)!
        config.min = Number(dataRange.getAttribute("minimum"))
        config.max = Number(dataRange.getAttribute("maximum"))
        config.logScale = dataRange.getAttribute("type") === "LOG"
    }
}

export default XMLSession
