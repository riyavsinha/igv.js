import type Browser from "../browser.js"
import type TrackView from "../trackView.js"
import type {Track, MenuItem} from "../types/ui"
import * as DOMUtils from "./utils/dom-utils.js"
import Panel from "./components/panel.js"
import Dialog from "./components/dialog.js"
import {colorPalettes} from "../util/colorPalletes.js"

const colorPickerTrackTypeSet: Set<string> = new Set(['bedtype', 'alignment', 'annotation', 'variant', 'wig', 'interact', 'shoebox'])

const vizWindowTypes: Set<string> = new Set(['alignment', 'annotation', 'variant', 'eqtl', 'qtl', 'snp', 'shoebox', 'wig'])

const multiTrackSelectExclusionTypes: Set<string> = new Set(['sequence', 'ruler', 'ideogram'])

const autoScaleGroupColorHash: Record<string, string> =
    {}

class MenuUtils {

    browser: Browser
    dialog!: Dialog

    constructor(browser: Browser) {
        this.browser = browser
        this.initialize()
    }

    initialize(): void {

        const panel = new Panel()
        panel.add('...')

        const config =
            {
                parent: this.browser.root,
                content: panel
            }

        this.dialog = new Dialog(config)
        this.browser.root.appendChild(this.dialog.elem)
        DOMUtils.hide(this.dialog.elem)
    }

    trackMenuItemList(trackView: TrackView): (string | MenuItem)[] {

        const list: (string | MenuItem)[] = []

        if (trackView.track.config?.type !== 'sequence') {
            list.push(trackHeightMenuItem())
        }

        if (true === didMultiSelect(trackView)) {
            list.push(...this.multiSelectMenuItems(trackView))
        } else {
            if (trackView.track.config?.type !== 'sequence') {
                list.push(trackRenameMenuItem())
            }
            list.push(...this.defaultMenuItems(trackView))
        }

        if (trackView.track.removable !== false) {
            list.push('<hr/>')
            list.push(trackRemovalMenuItem(trackView))
        }

        return list
    }

    defaultMenuItems(trackView: TrackView): (string | MenuItem)[] {

        const list: (string | MenuItem)[] = []

        if (canShowColorPicker(trackView.track)) {

            list.push('<hr/>')
            list.push(colorPickerMenuItem(trackView, "Set track color", "color"))
            list.push(unsetColorMenuItem(trackView, "Unset track color"))

            if (trackView.track.config?.type === 'wig' || trackView.track.config?.type === 'annotation') {
                list.push(colorPickerMenuItem(trackView, "Set alt color", "altColor"))
                list.push(unsetAltColorMenuItem(trackView, "Unset alt color"))
            }

        }

        if (trackView.track.menuItemList) {
            list.push(...trackView.track.menuItemList())
        }

        if (isVisibilityWindowType(trackView)) {
            list.push('<hr/>')
            list.push(visibilityWindowMenuItem(trackView.track.type!))
        }

        return list
    }

    multiSelectMenuItems(trackView: TrackView): (string | MenuItem)[] {

        const list: (string | MenuItem)[] = []

        const selected = trackView.browser.getSelectedTrackViews()
        const isSingleTrackType: boolean = didSelectSingleTrackType(selected.map(({track}: {track: Track}) => track.type as string))

        if (true === isSingleTrackType) {

            list.push(...this.defaultMenuItems(trackView))

            if ('wig' === trackView.track.type) {

                list.push('<hr/>')
                list.push(groupAutoScaleMenuItem())
            }

        } else {

            if (canShowColorPicker(trackView.track)) {

                list.push('<hr/>')
                list.push(colorPickerMenuItem(trackView, "Set track color", "color"))
                list.push(unsetColorMenuItem(trackView, "Unset track color"))

                if (trackView.track.config?.type === 'wig' || trackView.track.config?.type === 'annotation') {
                    list.push(colorPickerMenuItem(trackView, "Set alt color", "altColor"))
                    list.push(unsetAltColorMenuItem(trackView, "Unset alt color"))
                }

            }

        }

        return list

    }

}

function didMultiSelect(trackView: TrackView): boolean {
    const selected = trackView.browser.getSelectedTrackViews()
    return selected && selected.length > 1 && new Set(selected).has(trackView)
}

function isVisibilityWindowType(trackView: TrackView): boolean {
    const track = trackView.track
    const hasVizWindow: boolean = !!(track && track.config && track.config.visibilityWindow !== undefined)
    return hasVizWindow || !!(track && track.type && vizWindowTypes.has(track.type))
}

function groupAutoScaleMenuItem(): MenuItem {

    const element: HTMLElement = document.createElement('div');
    element.textContent = 'Group autoscale';

    function click(this: Track, e?: Event): void {

        const colorPalette = colorPalettes['Dark2'];
        const randomIndex: number = Math.floor(Math.random() * colorPalette.length);

        const autoScaleGroupID: string = `auto-scale-group-${DOMUtils.guid()}`;
        autoScaleGroupColorHash[autoScaleGroupID] = colorPalette[randomIndex];

        const multiSelectedTrackViews = this.browser.getSelectedTrackViews();
        for (const {track} of multiSelectedTrackViews) {
            track.autoscaleGroup = autoScaleGroupID;
        }

        this.browser.updateViews();
    }

    return {element, doAllMultiSelectedTracks: true, click};

}

function visibilityWindowMenuItem(trackType: string): MenuItem {

    const element: HTMLElement = document.createElement('div');
    element.textContent = 'Set visibility window';

    function click(this: Track, e?: Event): void {

        const callback = () => {

            let value = this.browser.inputDialog.value;
            value = '' === value || undefined === value ? -1 : value.trim();

            this.visibilityWindow = Number.parseInt(value);
            this.config!.visibilityWindow = Number.parseInt(value);

            this.trackView!.updateViews!();
        };

        const label: string = 'wig' === trackType ?
            'Visibility window (bp). Enter 0 for whole chromosome, -1 for whole genome.' :
            'Visibility window (bp). Enter 0 for whole chromosome.';
        const config =
            {
                label,
                value: this.visibilityWindow,
                callback
            };
        this.browser.inputDialog.present(config, e);

    }

    return {element, click};

}

function trackRemovalMenuItem(trackView: TrackView): MenuItem {

    const str: string = trackView.track.selected ? 'Remove tracks' : 'Remove track';

    const element: HTMLElement = document.createElement('div');
    element.textContent = str;

    function trackRemovalHandler(this: Track, e?: Event): void {
        (this.trackView as TrackView).browser._removeTrack(this);
    }

    return {element, click: trackRemovalHandler, menuItemType: 'removeTrack'};

}

function colorPickerMenuItem(trackView: TrackView, label: string, option: string): MenuItem {

    const element: HTMLElement = document.createElement('div');
    element.textContent = label;

    function click(this: Track, event?: Event): void {
        trackView.presentColorPicker(option, event!);
    }

    return {element, click};
}

function unsetColorMenuItem(trackView: TrackView, label: string): MenuItem {

    const element: HTMLElement = document.createElement('div');
    element.textContent = label;

    return {
        element,
        click: () => {
            trackView.track.color = trackView.track._initialColor || trackView.track.constructor.defaultColor;
            trackView.repaintViews();
        }
    };
}

function unsetAltColorMenuItem(trackView: TrackView, label: string): MenuItem {

    const element: HTMLElement = document.createElement('div');
    element.textContent = label;

    return {
        element,
        click: () => {
            trackView.track.altColor = trackView.track._initialAltColor || trackView.track.constructor.defaultColor;
            trackView.repaintViews();
        }
    };
}

function trackRenameMenuItem(): MenuItem {

    const element: HTMLElement = document.createElement('div');
    element.textContent = 'Set track name';

    function click(this: Track, e?: Event): void {

        const callback = () => {
            let value = this.browser.inputDialog.value;
            value = ('' === value || undefined === value) ? 'untitled' : value.trim();
            this.name = value;
            this.browser.fireEvent('tracknamechange', [this])
        };

        const config =
            {
                label: 'Track Name',
                value: (getTrackLabelText(this) || 'unnamed'),
                callback
            };

        this.browser.inputDialog.present(config, e);

    }

    return {element, click};
}

function trackHeightMenuItem(): MenuItem {

    const element: HTMLElement = document.createElement('div');
    element.textContent = 'Set track height';

    function dialogHandler(this: Track, e?: Event): void {

        const callback = () => {

            if (this.browser.inputDialog.value !== undefined) {

                const number: number = parseInt(this.browser.inputDialog.value, 10)

                if (number > 0){

                    const tracks: Track[] = [];
                    const tv = this.trackView as TrackView
                    if (tv.track.selected) {
                        tracks.push(...(tv.browser.getSelectedTrackViews().map(({track}: {track: Track}) => track)));
                    } else {
                        tracks.push(this);
                    }

                    for (const track of tracks) {
                        const trackTv = track.trackView as TrackView
                        // Explicitly setting track height turns off autoHeight
                        trackTv.autoHeight = false;

                        // If explicitly setting the height adjust min or max, if necessary
                        if (track.minHeight !== undefined && track.minHeight > number) {
                            track.minHeight = number;
                        }
                        if (track.maxHeight !== undefined && track.maxHeight < number) {
                            track.minHeight = number;
                        }
                        trackTv.setTrackHeight(number, true);

                        trackTv.checkContentHeight!();
                        trackTv.repaintViews();
                    } // for (tracks)

                } // if ()

            } // if ()
        }

        const config =
            {
                label: 'Track Height',
                value: this.height,
                callback
            };

        this.browser.inputDialog.present(config, e);

    }

    return {element, dialog: dialogHandler};

}

function getTrackLabelText(track: Track): string {
    return track.name || ''
}

function canShowColorPicker(track: Track): boolean {
    return undefined === track.type || (colorPickerTrackTypeSet.has(track.type) && 'heatmap' !== track.graphType)
}

function didSelectSingleTrackType(types: string[]): boolean {
    const unique: string[] = [...new Set(types)]
    return 1 === unique.length
}

export {
    autoScaleGroupColorHash,
    canShowColorPicker,
    multiTrackSelectExclusionTypes,
    didSelectSingleTrackType
}

export default MenuUtils
