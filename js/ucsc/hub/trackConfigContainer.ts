import type {TrackConfig} from "../../types/config.js"

class TrackConfigContainer {
        name: string
        priority: number
        label: string
        defaultOpen: boolean
        tracks: TrackConfig[]
        children: TrackConfigContainer[]

        constructor(name: string, label: string, priority: number, defaultOpen: boolean) {
            this.name = name;
            this.priority = priority;
            this.label = label;
            this.defaultOpen = defaultOpen;
            this.tracks = [];
            this.children = [];
        }

        isEmpty(): boolean {
            return this.tracks.length === 0 &&
                (!this.children || this.children.length === 0 || this.children.every(child => child.isEmpty()));
        }

        map(callback: (track: TrackConfig) => void): void {
            this.tracks.forEach(callback);
            this.children.forEach(child => child.map(callback));
        }

        findTracks(filter: (track: TrackConfig) => boolean): TrackConfig[] {
            const found: TrackConfig[] = [];
            this._find(found, filter);
            return found;
        }

        _find(found: TrackConfig[], filter: (track: TrackConfig) => boolean): void {
            this.tracks.forEach(track => {
                if (filter(track)) {
                    found.push(track);
                }
            });
            this.children.forEach(child => child._find(found, filter));
        }

        countTracks(): number {
            return this.tracks.length + this.children.reduce((count, child) => count + child.countTracks(), 0);
        }

        countSelectedTracks(): number {
            const selectedCount = this.tracks.filter(track => track.visible).length;
            return selectedCount + this.children.reduce((count, child) => count + child.countSelectedTracks(), 0);
        }

        trim(): void {
            this.children = this.children.filter(child => !child.isEmpty());
            this.children.forEach(child => child.trim());
        }

        setTrackVisibility(loadedTrackPaths: Set<string>): void {
            this.tracks.forEach(track => {
                track.visible = loadedTrackPaths.has(track.url as string);
            });
            this.children.forEach(child => child.setTrackVisibility(loadedTrackPaths));
        }
    }

    export default TrackConfigContainer;
