import {loadGenbank} from "./genbankParser"
import StaticFeatureSource from "../feature/staticFeatureSource.js"
import BaseFeatureSource from "../feature/baseFeatureSource"

interface GenbankConfig {
    url: string;
    genome?: any;
    [key: string]: any;
}

interface FeatureQueryParams {
    chr: string;
    start: number;
    end: number;
    bpPerPixel?: number;
    visibilityWindow?: number;
}

class GenbankFeatureSource extends BaseFeatureSource {

    config: GenbankConfig;
    searchable: boolean;
    featureSource: any;

    constructor(config: GenbankConfig, genome: any) {
        super(genome)
        this.config = config
        this.searchable = true
    }

    // Feature source interface
    async getFeatures({chr, start, end, bpPerPixel, visibilityWindow}: FeatureQueryParams): Promise<any[]> {
        if(!this.featureSource) {
            const gbk: any = await loadGenbank(this.config.url)
            this.featureSource = new StaticFeatureSource({
                genome: this.config.genome,
                features: gbk.features,
                searchableFields: ['gene', 'db_xref', 'locus_tag', 'transcript_id']
            }, undefined)

        }
        return this.featureSource.getFeatures({chr, start, end})
    }
    supportsWholeGenome(): boolean {
        return false
    }

    search(term: string): any {
        return this.featureSource.search(term)
    }
}

export default GenbankFeatureSource
