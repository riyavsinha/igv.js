import * as DOMUtils from "./ui/utils/dom-utils.js"
import AlertDialog from "./ui/components/alertDialog.js"
import SequenceTrack from "./sequenceTrack.js"

class Viewport {

    guid: string
    trackView: any
    referenceFrame: any
    browser: any
    viewportElement: HTMLDivElement
    alert: any
    contentTop: number
    contentHeight: number
    messageDiv: HTMLDivElement | undefined
    // cachedFeatures defined by subclasses (TrackViewport defines as accessor)

    constructor(trackView: any, viewportColumn: HTMLElement, referenceFrame: any, width: number) {
        this.guid = DOMUtils.guid()
        this.trackView = trackView;
        this.referenceFrame = referenceFrame;

        this.browser = trackView.browser;

        this.viewportElement = document.createElement('div');
        this.viewportElement.className = 'igv-viewport';
        viewportColumn.appendChild(this.viewportElement);

        if (trackView.track.height) {
            this.setHeight(trackView.track.height);
        }

        // Associate the track type with the viewport element using data attribute
        const trackType = trackView.track.type || 'untyped';
        this.viewportElement.setAttribute('data-track-type', trackType);

        // Create an alert dialog for the sequence track to copy ref sequence to.
        if (trackView.track instanceof SequenceTrack) {
            this.alert = new AlertDialog(this.viewportElement);
        }

        this.contentTop = 0;
        this.contentHeight = this.viewportElement.clientHeight;

        this.setWidth(width);

        this.initializationHelper();
    }

    initializationHelper(): void {}

    showMessage(message: string): void {
        if (!this.messageDiv) {
            this.messageDiv = document.createElement('div');
            this.messageDiv.className = 'igv-viewport-message';
            this.viewportElement.appendChild(this.messageDiv);
        }
        this.messageDiv.textContent = message;
        this.messageDiv.style.display = 'inline-block';
    }

    hideMessage(): void {
        if (this.messageDiv) {
            this.messageDiv.style.display = 'none';
        }
    }

    setTrackLabel(label: string): void {}

    startSpinner(): void {}

    stopSpinner(): void {}

    checkZoomIn(): boolean {
        return true;
    }

    shift(): void {}

    setTop(contentTop: number): void {
        this.contentTop = contentTop;
    }

    async loadFeatures(): Promise<any> {
        return undefined;
    }

    clearCache(): void {}

    repaint(): void {}

    draw(drawConfiguration: any, features: any, roiFeatures: any): void {
        console.log('Viewport - draw(drawConfiguration, features, roiFeatures)');
    }

    checkContentHeight(features: any): void {
        const track = this.trackView.track;
        features = features || (this as any).cachedFeatures;
        if (track.displayMode === 'FILL') {
            this.setContentHeight(this.viewportElement.clientHeight);
        } else if (typeof track.computePixelHeight === 'function') {
            if (features && features.length > 0) {
                const requiredContentHeight = track.computePixelHeight(features, this.referenceFrame.bpPerPixel);
                if (requiredContentHeight !== this.contentHeight) {
                    this.setContentHeight(requiredContentHeight);
                }
            }
        }
    }

    getContentHeight(): number {
        return this.contentHeight;
    }

    setContentHeight(contentHeight: number): void {
        this.contentHeight = contentHeight;
    }

    isLoading(): boolean {
        return false;
    }

    saveSVG(): void {}

    isVisible(): boolean {
        return this.viewportElement.clientWidth > 0;
    }

    setWidth(width: number): void {
        this.viewportElement.style.width = `${width}px`;
    }

    getWidth(): number {
        return this.viewportElement.clientWidth;
    }

    setHeight(height: number): void {
        this.viewportElement.style.height = `${height}px`;
    }

    getContentTop(): number {
        return this.contentTop;
    }

    containsPosition(chr: string, position: number): void {
        console.log('Viewport - containsPosition(chr, position)');
    }

    addMouseHandlers(): void {}

    dispose(): void {
        this.viewportElement.remove();

        // Nullify all properties to free memory
        for (const key in this) {
            if (this.hasOwnProperty(key)) {
                (this as any)[key] = undefined;
            }
        }
    }
}

export default Viewport;
