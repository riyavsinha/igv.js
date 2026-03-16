import {openH5File} from "../../node_modules/hdf5-indexed-reader/dist/hdf5-indexed-reader.esm.js"
import {buildOptions} from "../util/igvUtils.js"


class SignalNames {
    chrom: string
    signal_bin_size: number
    signals: Record<string, string>

    /**
     *
     * @param {string} chrom - chromosome name
     * @param {integer} bin_size - bin size
     */
    constructor(chrom: string, bin_size: number) {
        this.chrom = chrom
        this.signal_bin_size = bin_size

        let rd_flag = ""
        this.signals = {
            'raw_RD': `his_rd_p_${this.chrom}_${this.signal_bin_size}${rd_flag}`,
            'gc_RD': `his_rd_p_${this.chrom}_${this.signal_bin_size}_GC`,
            'gc_partition' : `his_rd_p_${this.chrom}_${this.signal_bin_size}_partition_GC_merge`,
            'baf': `snp_likelihood_${this.chrom}_${this.signal_bin_size}_mask`,
            'baf_i1': `snp_i1_${this.chrom}_${this.signal_bin_size}_mask`,
            'Mosaic_segments' : `his_rd_p_${this.chrom}_${this.signal_bin_size}_partition_GC_mosaic_segments_2d`,
            'Mosaic_calls': `his_rd_p_${this.chrom}_${this.signal_bin_size}_partition_GC_mosaic_call_2d`
        }
    }
}


interface WigRecord {
    chr: string
    start: number
    end: number
    value: number
}

interface HDF5Dataset {
    value: unknown
    to_array(): Promise<unknown[]>
}

interface HDF5File {
    keys: string[]
    get(key: string): Promise<HDF5Dataset>
}

class HDF5Reader {
    config: Record<string, unknown>
    bin_size: number
    h5_obj: HDF5File | undefined
    pytorKeys: string[]
    availableBins: number[]
    callers: string[]

    /**
     *
     * @param {string} h5_file - path for the pytor file
     * @param {integer} bin_size - bin size
     */
    constructor(config: Record<string, unknown>, bin_size: number = 100000) {

        this.config = config;
        this.bin_size = bin_size;
        this.h5_obj = undefined
        this.pytorKeys = [];
        this.availableBins = [];
        this.callers = [];
    }
    
    async fetch(): Promise<HDF5File> {

        if(!this.h5_obj) {
            const options = Object.assign(this.config,  {fetchSize: 1000000, maxSize: 200000000})
            this.h5_obj = await openH5File(options) as HDF5File
        }
        return this.h5_obj
    }

    /**
     *
     * @returns - a list of keys of the pytor file
     */
    async get_keys(){
        let h5_obj = await this.fetch();
        return h5_obj.keys
    }

    async get_rd_signal(bin_size: number = this.bin_size, chrom?: string[]): Promise<Record<number, Record<string, WigRecord[]>>> {
        // Fetch the pytor file and get keys
        const h5Obj = await this.fetch();
        this.pytorKeys = h5Obj.keys;

        // get available bin sizes
        const signalBin = new ParseSignals(this.pytorKeys);
        this.availableBins = signalBin.getAllBins();
        
        // check if the user provided bin is available, else set the last bin_size
        if(! this.availableBins.includes(bin_size)){
            bin_size = this.availableBins[this.availableBins.length - 1];    
        }
        
        // get rd chromosomes and rd stat
        const rdChromosomes = await this.getChromosomes(chrom);

        let rd_stat = await this.rd_stat(bin_size)

        // prepare wig formatted file for all chromosome
        const wigFeatures = await this.getWigFeatures(rdChromosomes, bin_size, rd_stat!);

        this.setCallers(wigFeatures);
        return { [bin_size]: wigFeatures };
    }

    async getWigFeatures(rdChromosomes: string[], binSize: number, rdStat: number[]): Promise<Record<string, WigRecord[]>> {
        const wigFeatures: Record<string, WigRecord[]> = {
            RD_Raw: [],
            RD_Raw_gc_coor: [],
            ReadDepth: [],
            "2D": [],
            BAF1: [],
            BAF2: []
        };

        for (const chrom of rdChromosomes) {
            const signalNameObj = new SignalNames(chrom, binSize);

            wigFeatures.RD_Raw.push(...await this.get_chr_signal(chrom, binSize, signalNameObj.signals.raw_RD, rdStat));
            wigFeatures.RD_Raw_gc_coor.push(...await this.get_chr_signal(chrom, binSize, signalNameObj.signals.gc_RD, rdStat));
            wigFeatures.ReadDepth.push(...await this.get_chr_signal(chrom, binSize, signalNameObj.signals.gc_partition, rdStat));

            wigFeatures["2D"].push(...await this.rd_call_combined(chrom, binSize, rdStat, signalNameObj));

            const [baf1, baf2] = await this.getBafSignals(chrom, binSize, signalNameObj.signals.baf_i1);
            wigFeatures.BAF1.push(...baf1);
            wigFeatures.BAF2.push(...baf2);
        }

        return wigFeatures;
    }

    async getChromosomes(refChroms?: string[]): Promise<string[]> {
        // return chromosome names if they exists in the rd_chromosomes
        const rdChroms_obj = await this.h5_obj!.get("rd_chromosomes");
        const rdChroms = await rdChroms_obj.value as string[]
        if(!refChroms){
            return rdChroms
        }else{
            let refChromsSet = new Set(refChroms)
            return rdChroms.filter((item: string) => refChromsSet.has(item));

        }
    }

    setCallers(wigFeatures: Record<string, WigRecord[]>): void {
        this.callers = [];
        if (wigFeatures.ReadDepth.length) this.callers.push('ReadDepth');
        if (wigFeatures["2D"].length) this.callers.push('2D');
    }

    decode_segments(segments_arr: number[]): number[][] {
        let max = 2 ** 32 - 1
        let segments = []
        let l = []
        for (let x of segments_arr){
            if(x == max){
                segments.push(l)
                l = []
            } else{
                l.push(x)
            }
        }
        return segments
    }

    async rd_call_combined(chrom: string, bin_size: number, rd_stat: number[], signal_name_obj: SignalNames): Promise<WigRecord[]> {
        let chr_wig: WigRecord[] = [];

        let segments: number[][] | undefined
        let mosaic_call_segments = signal_name_obj.signals['Mosaic_segments']
        if (this.pytorKeys.includes(mosaic_call_segments)){
            const chrom_dataset = await this.h5_obj!.get(mosaic_call_segments)
            const t0 = Date.now()
            let chrom_data = await chrom_dataset.value as number[]
            segments = this.decode_segments(chrom_data)

        }

        let mosaic_calls = signal_name_obj.signals['Mosaic_calls']
        if (this.pytorKeys.includes(mosaic_calls) && segments){
            const segments_call_dataset = await this.h5_obj!.get(mosaic_calls)
            let segments_call = await segments_call_dataset.to_array() as number[][] //create_nested_array(value, shape)
            segments.forEach((ind_segment: number[], segment_idx: number) => {
                ind_segment.forEach((bin_value: number) =>{
                    chr_wig.push({chr:chrom, start: bin_value*bin_size, end: (bin_value+1) * bin_size, value: (segments_call[0][segment_idx]/rd_stat[4]) *2})
                })
            })
        }

        return chr_wig
        
    }
    
    /**
     * returns a list for rd statistics information 
     * @param {integer} bin_size - bin_size 
     * @returns - array - read depth statistics array
     */
    async rd_stat(bin_size: number): Promise<number[] | undefined> {
    
        let rd_stat_signal =  `rd_stat_${bin_size}_auto`
        let rd_stat: number[] | undefined;
        if (this.pytorKeys.includes(rd_stat_signal)){
            const rd_stat_dataset = await this.h5_obj!.get(rd_stat_signal)
            rd_stat = await rd_stat_dataset.value as number[]
        }
        return rd_stat
    }

    
    async get_chr_signal(chrom: string, bin_size: number, signal_name: string, rd_stat: number[]): Promise<WigRecord[]> {
        /* return a list of dictionary for a chromosome */
        let chr_wig: WigRecord[] = [];

        if (this.pytorKeys.includes(signal_name)){
            const chrom_dataset = await this.h5_obj!.get(signal_name)

            let chrom_data = await chrom_dataset.value as number[]
            chrom_data.forEach((bin_value: number, bin_idx: number) => {
                chr_wig.push({chr:chrom, start: bin_idx*bin_size, end: (bin_idx+1) * bin_size, value: (bin_value/rd_stat[4]) *2})
            });
        }
        return chr_wig
    }


    async getBafSignals(chrom: string, binSize: number, signalName: string, scalingFactor: number = -1): Promise<[WigRecord[], WigRecord[]]> {
        const chrWig1: WigRecord[] = [];
        const chrWig2: WigRecord[] = [];

        if (this.pytorKeys.includes(signalName)) {
            const chromDataset = await this.h5_obj!.get(signalName);
            const chromData = await chromDataset.to_array() as number[];

            chromData.forEach((lh: number, binIdx: number) => {
                if (!isNaN(lh)) {
                    chrWig1.push({
                        chr: chrom,
                        start: binIdx * binSize,
                        end: (binIdx + 1) * binSize,
                        value: scalingFactor * (0.5 - lh)
                    });
                    if (lh !== 0.5) {
                        chrWig2.push({
                            chr: chrom,
                            start: binIdx * binSize,
                            end: (binIdx + 1) * binSize,
                            value: scalingFactor * (0.5 + lh)
                        });
                    }
                }
            });
        }
        return [chrWig1, chrWig2];
    }

}

class ParseSignals {
    signals: string[]

    /**
     * @param {string[]} signals - List of keys in pytor files.
     */
    constructor(signals: string[]) {
        this.signals = signals;
    }

    getAllBins(): number[] {
        const rdBins = this.getRdBins();
        const snpBins = this.getSnpBins();
        return [...new Set([...rdBins, ...snpBins])].sort((a, b) => a - b);;
    }

    getRdBins(): number[] {
        return this.extractBins(/^his_rd_p_(.*)_(\d+)$/);
    }

    getSnpBins(): number[] {
        return this.extractBins(/^snp_likelihood_(.*)_(\d+)_mask$/);
    }

    extractBins(regex: RegExp): number[] {
        return [...new Set(
            this.signals
                .map(val => val.match(regex))
                .filter(match => match !== null)
                .map(match => Number(match[2]))
        )];
    }
}

function fixString(strings: string[]): string[] {

    return strings.map(s => s.substr(0,s.indexOf('\0')))

}

// function to_array(value, shape) {
//     const { json_value, metadata } = this;
//     const { shape } = metadata;
//     if (!isIterable(json_value) || typeof json_value === "string") {
//         return json_value;
//     }
//     let nested = create_nested_array(json_value, shape);
//     return nested;
// }

function create_nested_array(value: number[], shape: number[]): unknown {
    // check that shapes match:
    const total_length = value.length;
    const dims_product = shape.reduce((previous, current) => (previous * current), 1);
    if (total_length !== dims_product) {
        console.warn(`shape product: ${dims_product} does not match length of flattened array: ${total_length}`);
    }
    // Get reshaped output:
    let output: unknown[] = value;
    const subdims = shape.slice(1).reverse();
    for (let dim of subdims) {
        // in each pass, replace input with array of slices of input
        const new_output = [];
        const { length } = output;
        let cursor = 0;
        while (cursor < length) {
            new_output.push(output.slice(cursor, cursor += dim));
        }
        output = new_output;
    }
    return output;
}



export default HDF5Reader
