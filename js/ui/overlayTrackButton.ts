import NavbarButton from "./navbarButton.js"
import {overlayTrackImage, overlayTrackImageHover} from "./navbarIcons/overlayTrack.js"
import {buttonLabel} from "./navbarIcons/buttonLabel.js"
import MergedTrack from "../feature/mergedTrack.js"


class OverlayTrackButton extends NavbarButton {

    boundMouseClickHandler: () => void

    constructor(parent: HTMLElement, browser: any) {

        super(parent, browser, 'Overlay Tracks', buttonLabel, overlayTrackImage, overlayTrackImageHover, false)

        this.button.addEventListener('mouseenter', () => this.setState(true))
        this.button.addEventListener('mouseleave', () => this.setState(false))

        const mouseClickHandler = (): void => {
            this.setVisibility(false)
            this.trackOverlayClickHandler()
        }

        this.boundMouseClickHandler = mouseClickHandler.bind(this)

        this.button.addEventListener('click', this.boundMouseClickHandler)

        this.setVisibility(true)

    }

    async trackOverlayClickHandler(): Promise<void> {

        if (true === isOverlayTrackCriteriaMet(this.browser)) {

            const tracks = this.browser.getSelectedTrackViews().map(({track}: { track: any }) => track)
            for (const track of tracks) {
                track.selected = false
            }

            // Flatten any merged tracks.  Must do this before their removal
            const flattenedTracks: any[] = []
            for (let t of tracks) {
                if ("merged" === t.type) {
                    flattenedTracks.push(...t.tracks)
                } else {
                    flattenedTracks.push(t)
                }
            }

            const config =
                {
                    name: 'Overlay',
                    type: 'merged',
                    autoscale: false,
                    alpha: 0.5, //fudge * (1.0/tracks.length),
                    height: Math.max(...tracks.map(({height}: { height: number }) => height)),
                    order: Math.min(...tracks.map(({order}: { order: number }) => order))
                }

            const mergedTrack = new MergedTrack(config, this.browser, flattenedTracks)

            for (const track of tracks) {
                const idx = this.browser.trackViews.indexOf(track.trackView)
                this.browser.trackViews.splice(idx, 1)
                track.trackView.dispose()
            }

            await this.browser.addTrack(mergedTrack)
            await mergedTrack.trackView.updateViews()
            this.browser.reorderTracks()
        }
    }
}

function isOverlayTrackCriteriaMet(browser: any): boolean {

    const selected = browser.getSelectedTrackViews()

    if (selected && selected.length > 1) {

        const criteriaSet = new Set(['wig', 'merged'])

        const list = selected.filter(({track}: { track: any }) => criteriaSet.has(track.type))

        return list.length > 1

    } else {
        return false
    }

}

export {isOverlayTrackCriteriaMet}
export default OverlayTrackButton
