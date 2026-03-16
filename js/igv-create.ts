import {GoogleAuth, igvxhr} from '../node_modules/igv-utils/src/index.js'
import Browser from "./browser.js"
import GenomeUtils from "./genome/genomeUtils.js"
import InputDialog  from "./ui/components/inputDialog.js"
import createWebSocketClient from "./websocket/websocketClient.js"
import {setDefaults} from "./util/defaultOptions.js"
import type {BrowserConfig, SessionObject, TrackConfig} from "./types/config"
import type {Track} from "./types/ui"

let allBrowsers: Browser[] = []

/**
 * Create an igv.browser instance.  This object defines the public API for interacting with the genome browser.
 *
 * @param parentDiv - DOM tree root
 * @param config - configuration options.
 *
 */
async function createBrowser(parentDiv: HTMLElement, config: BrowserConfig): Promise<Browser> {

    if (undefined === config) config = {} as BrowserConfig

    // Initialize pre-defined genomes.  The genome list is shared among all browser instances
    if (!GenomeUtils.KNOWN_GENOMES) {
        await GenomeUtils.initializeGenomes(config)
    }

    setDefaults(config)

    if (config.queryParametersSupported) {
        extractQuery(config)
    }
    if (config.apiKey) {
        igvxhr.setApiKey(config.apiKey)
    }
    if (config.oauthToken) {
        igvxhr.setOauthToken(config.oauthToken as string)
    }
    if (config.clientId && (!GoogleAuth.isInitialized())) {
        await GoogleAuth.init({
            client_id: config.clientId,
            apiKey: config.apiKey,
            scope: 'https://www.googleapis.com/auth/userinfo.profile'
        })
    }

    // A very obscure and undocumented option unlikely to be needed by anyone but us.
    if(config.formEmbedMode) {
        InputDialog.FORM_EMBED_MODE = true
    }

    // Create browser
    const browser = new Browser(config, parentDiv)
    allBrowsers.push(browser)

    const sessionURL = config.sessionURL || config.session || config.hubURL
    if (sessionURL) {
        await browser.loadSession({
            url: sessionURL as string
        })
    } else {
        await browser.loadSessionObject(config as unknown as SessionObject)
    }

    browser.navbar.navbarDidResize()

    if(config.enableWebSocket) {
        const host = (config.webSocketHost as string) || "localhost"
        const port = (config.webSocketPort as number) || 60141
        createWebSocketClient(host, port, browser)
    }

    return browser
}

function removeBrowser(browser: Browser): void {
    browser.dispose()
    browser.root.remove()
    allBrowsers = allBrowsers.filter(item => item !== browser)
}

function removeAllBrowsers(): void {
    for (let browser of allBrowsers) {
        browser.dispose()
        browser.root.remove()
    }
    allBrowsers = []
}

function getAllBrowsers(): Browser[] {
    return allBrowsers
}

/**
 * This function provided so clients can inform igv of a visibility change, typically when an igv instance is
 * made visible from a tab, accordion, or similar widget.
 */
async function visibilityChange(): Promise<void> {
    for (let browser of allBrowsers) {
        await browser.visibilityChange()
    }
}



function extractQuery(config: BrowserConfig): Record<string, string> {

    var i1: number, i2: number, i: number, j: number, s: string, query: Record<string, string>, tokens: string[], uri: string, key: string, value: string

    uri = window.location.href

    query = {}
    i1 = uri.indexOf("?")
    i2 = uri.lastIndexOf("#")

    let files: string[] | undefined
    let indexURLs: string[] | undefined
    let names: string[] | undefined
    if (i1 >= 0) {
        if (i2 < 0) i2 = uri.length
        for (i = i1 + 1; i < i2;) {
            j = uri.indexOf("&", i)
            if (j < 0) j = i2

            s = uri.substring(i, j)
            tokens = s.split("=", 2)

            if (tokens.length === 2) {
                key = tokens[0]
                value = decodeURIComponent(tokens[1])

                if ('file' === key) {
                    // IGV desktop style file parameter
                    files = value.split(',')
                } else if ('index' === key) {
                    // IGV desktop style index parameter
                    indexURLs = value.split(',')
                } else if ('name' === key) {
                    // IGV desktop style index parameter
                    names = value.split(',')
                } else if ('genome' === key) {
                    if ((value.startsWith("https://") || value.startsWith("http://")) && !value.endsWith(".json")) {
                        // IGV desktop compatibility -- assuming url to fasta
                        config['reference'] = {
                            fastaURL: value,
                            indexURL: value + ".fai"
                        }
                    } else {
                        config[key] = value
                        config['reference'] = undefined
                    }
                } else {
                    if ('reference' === key) {
                        config['genome'] = undefined   // Can specify either reference or genome, not both
                    }
                    config[key] = value
                }
                i = j + 1
            } else {
                i++
            }
        }
    }

    if (files) {
        if (!config.tracks)
            config.tracks = []
        for (let i = 0; i < files.length; i++) {

            if (files[i].endsWith(".xml") || files[i].endsWith(".json")) {
                config.sessionURL = files[i]
                break
            }

            const trackConfig: TrackConfig = {url: files[i]}
            if (indexURLs && indexURLs.length > i) {
                trackConfig.indexURL = indexURLs[i]
            }
            if (names && names.length > i) {
                trackConfig.name = names[i]
            }
            config.tracks.push(trackConfig)
        }
    }

    return query
}


async function createTrack(config: TrackConfig, browser: Browser): Promise<Track | undefined> {
    return await Browser.prototype.createTrack.call(browser, config)
}



export {createTrack, createBrowser, removeBrowser, removeAllBrowsers, getAllBrowsers, visibilityChange, setDefaults}
