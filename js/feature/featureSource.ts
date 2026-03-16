import TextFeatureSource from "./textFeatureSource.js"
import BWSource from "../bigwig/bwSource"
import TDFSource from "../tdf/tdfSource"
import StaticFeatureSource from "./staticFeatureSource.js"
import GenbankFeatureSource from "../gbk/genbankFeatureSource.js"
import ListFeatureSource from "./listFeatureSource.js"
import HicSource from "../hic/hicSource"
import type {TrackConfig} from "../types/config"
import type {FeatureSource as IFeatureSource} from "../types/reader"

const bbFormats = new Set(['bigwig', 'bw', 'bigbed', 'bb', 'biginteract', 'biggenepred', 'bignarrowpeak'])

function FeatureSource(config: TrackConfig, genome: unknown): IFeatureSource {

    const format: string | undefined = config.format ? config.format.toLowerCase() : undefined

    if (config.features) {
        return new StaticFeatureSource(config as ConstructorParameters<typeof StaticFeatureSource>[0], genome)
    } else if (format && bbFormats.has(format)) {
        return new BWSource(config as ConstructorParameters<typeof BWSource>[0], genome as ConstructorParameters<typeof BWSource>[1])
    } else if ("tdf" === format) {
        return new TDFSource(config as ConstructorParameters<typeof TDFSource>[0], genome as ConstructorParameters<typeof TDFSource>[1])
    } else if ("gbk" === format) {
        return new GenbankFeatureSource(config as ConstructorParameters<typeof GenbankFeatureSource>[0], genome as ConstructorParameters<typeof GenbankFeatureSource>[1])
    } else if ("vcf.list" === format) {
        // This is a text file with two columns:   <chr>  <url to vcf>
        return new ListFeatureSource(config as ConstructorParameters<typeof ListFeatureSource>[0], genome as ConstructorParameters<typeof ListFeatureSource>[1], FeatureSource)
    } else if ("hic" === format) {
        return new HicSource(config as ConstructorParameters<typeof HicSource>[0], genome as ConstructorParameters<typeof HicSource>[1])
    } else {
        return new TextFeatureSource(config as ConstructorParameters<typeof TextFeatureSource>[0], genome as ConstructorParameters<typeof TextFeatureSource>[1])
    }
}

export default FeatureSource
