import type Browser from "../browser.js"
import type {Track} from "../types/ui.js"

interface IncomingMessage {
    uniqueID: string
    type: string
    args: Record<string, string>
}

interface ReturnMessage {
    uniqueID: string
    status: string
    message?: string
    data?: unknown
}

export default async function handleMessage(json: IncomingMessage, browser: Browser): Promise<ReturnMessage> {

    const returnMsg: ReturnMessage = {uniqueID: json.uniqueID, status: 'ok'}

    try {
        let tracks: Track[]
        const {type, args} = json
        switch (type.toLowerCase()) {

            case "goto":
            case "search":
                const term: string = args.locus || args.term
                const found: boolean = await browser.search(term)
                if (found) {
                    returnMsg.message = `Locus ${term} found and navigated to successfully`
                } else {
                    returnMsg.message = `Locus ${term} not found`
                    returnMsg.status = 'warning'
                }
                break

            case "currentloci":
                returnMsg.data = browser.currentLoci()
                returnMsg.message = `Retrieved current loci successfully`
                break

            case "visibilityChange":
                await browser.visibilityChange()
                returnMsg.message = `Visibility change processed successfully`
                break

            case "tojson":
                returnMsg.data = browser.toJSON()
                returnMsg.message = `Session serialized to JSON successfully`
                break

            case "compressedsession":
                returnMsg.data = browser.compressedSession()
                returnMsg.message = `Session serialized and compressed successfully`
                break

            case "tosvg":
                returnMsg.data = browser.toSVG()
                returnMsg.message = `Session exported to SVG successfully`
                break

            case "removetrackbyname": {
                let {trackName} = args
                if(trackName) {
                    tracks = browser.findTracks((t: Track) => trackName ? t.name === trackName : true)
                    if (tracks) {
                        tracks.forEach((t: Track) => browser.removeTrack(t))
                        returnMsg.message = `Removed track(s) ${trackName} for ${tracks.length} track(s)`
                    } else {
                        returnMsg.message = `No tracks found matching name ${trackName}`
                        returnMsg.status = 'warning'
                    }
                } else {
                    returnMsg.message = `No track name provided`
                    returnMsg.status = 'warning'
                }
                break
            }

            case "loadsampleinfo": {
                browser.loadSampleInfo(args)
                returnMsg.message = `Sample info loaded successfully`
                break
            }

            case "discardsampleinfo":
                browser.discardSampleInfo()
                returnMsg.message = `Sample info discarded successfully`
                break

            case "loadroi":
                browser.loadROI(args)
                returnMsg.message = `ROI loaded successfully`
                break

            case "clearrois":
                browser.clearROIs()
                returnMsg.message = `ROIs cleared successfully`
                break

            case "getuserdefinedrois":
                const rois: unknown[] = await browser.getUserDefinedROIs()
                returnMsg.data = rois
                returnMsg.message = `Retrieved ${rois.length} user-defined ROIs successfully`
                break

            case 'loadtrack': {
                const {url, indexURL} = args
                const track = await browser.loadTrack({url, indexURL})
                returnMsg.message = `Track ${track?.name} loaded successfully`
                break
            }

            case "genome":
                const id: string = args.id
                await browser.loadGenome(id)
                returnMsg.message = `Genome ${id} loaded successfully`
                break

            case "loadsession":
                const url: string = args.url
                await browser.loadSession({url})
                returnMsg.message = `Session loaded successfully from ${url}`
                break

            case "zoomin":
                await browser.zoomIn()
                returnMsg.message = `Zoomed in successfully`
                break

            case "zoomout":
                await browser.zoomOut()
                returnMsg.message = `Zoomed out successfully`
                break

            case "setcolor":

                let {color, trackName} = args

                if (color.includes(",") && !color.startsWith("rgb(")) {
                    // Convert "R,G,B" to "rgb(R,G,B)"
                    color = `rgb(${color})`
                }

                tracks = browser.findTracks((t: Track) => trackName ? t.name === trackName : true)
                if (tracks) {
                    tracks.forEach((t: Track) => t.color = color)
                    browser.repaintViews()
                    returnMsg.message = `Set color to ${color} for ${tracks.length} track(s)`
                } else {
                    returnMsg.message = `No tracks found matching name ${trackName}`
                    returnMsg.status = 'warning'
                }
                break

            case "renametrack":

                const {currentName, newName} = args

                tracks = browser.findTracks((t: Track) => currentName === t.name)
                if (tracks && tracks.length > 0) {
                    tracks.forEach((t: Track) => {
                        t.name = newName
                        browser.fireEvent('tracknamechange', [t])
                    })
                    returnMsg.message = `Renamed ${tracks.length} track(s) from ${currentName} to ${newName}`
                } else {
                    returnMsg.message = `No track found with name ${currentName}`
                    returnMsg.status = 'warning'
                }
                break

            default:
                returnMsg.message = `Unrecognized message type: ${type}`
                returnMsg.status = 'error'
        }
    } catch (err: unknown) {
        returnMsg.message = (err instanceof Error ? err.message : String(err))
        returnMsg.status = 'error'
    }

    return returnMsg
}
