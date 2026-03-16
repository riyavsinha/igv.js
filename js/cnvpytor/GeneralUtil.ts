
interface BinRecord {
    binScore: number
    [key: string]: unknown
}

class GetFit {
    allBins: Record<string, BinRecord[]>

    /**
     * Creates an instance of GetFit.
     * @param {Object} allBins - An object containing all the bins with their respective data.
     */
    constructor(allBins: Record<string, BinRecord[]>) {
        this.allBins = allBins // Stores all bins data
    }

    /**
     * Extracts bin scores greater than zero from all bins.
     * @returns {Array} An array of bin scores.
     */

    getValues(): number[] {
        const bins = Object.values(this.allBins).reduce(
            (binResult: number[], bin: BinRecord[]) => { return binResult.concat(bin.filter((a: BinRecord) => a.binScore > 0).map((a: BinRecord) => a.binScore)) }, [])
        return bins
    }

    /**
     * Calculates the mean of the given data.
     * @param {Array} data - The data array to calculate the mean from.
     * @returns {number} The mean value of the data.
     */
    getMean(data: number[]): number {
        return (data.reduce(function (a, b) { return a + b; }) / data.length);
    }

    fit_data(): number[] {
        let rd_list = this.getValues()
        let distParmas = getDistParams(rd_list)
        return distParmas
    }


    histogram(data: number[], bins: number[]): number[] {
        const step = bins[1] - bins[0];
        const hist_bins: Record<number, { count: number }> = {};

        data.forEach((value) => {
            bins.forEach((bin_value) => {
                if (!hist_bins[bin_value]) {
                    hist_bins[bin_value] = { count: 0 };
                }
                if (bin_value <= value && value < bin_value + step) {
                    hist_bins[bin_value].count++;
                    return false;
                }
            });
        });
        const dist_p: number[] = []
        Object.values(hist_bins).forEach((bin) => { dist_p.push(bin.count); });
        return dist_p
    }

}


function range_function(start: number, stop: number, step: number): number[] {
    const data_array = Array(Math.ceil((stop - start) / step))
        .fill(start)
        .map((x, y) => x + y * step);
    return data_array;
}


function Gaussian([a, x0, sigma]: [number, number, number]) {
    return (x: number) =>
        (a * Math.exp(-Math.pow(x - x0, 2) / (2 * Math.pow(sigma, 2)))) / (Math.sqrt(2 * Math.PI) * sigma);
}

function filterOutliers(someArray: number[]): number[] {

    if (someArray.length < 4)
        return someArray;

    let values: number[], q1: number, q3: number, iqr: number, maxValue: number, minValue: number;

    values = someArray.slice().sort((a, b) => a - b); //copy array fast and sort

    if ((values.length / 4) % 1 === 0) { //find quartiles
        q1 = 1 / 2 * (values[(values.length / 4)] + values[(values.length / 4) + 1]);
        q3 = 1 / 2 * (values[(values.length * (3 / 4))] + values[(values.length * (3 / 4)) + 1]);
    } else {
        q1 = values[Math.floor(values.length / 4 + 1)];
        q3 = values[Math.ceil(values.length * (3 / 4) + 1)];
    }

    iqr = q3 - q1;
    maxValue = q3 + iqr * 1.5;
    minValue = q1 - iqr * 1.5;

    return values.filter((x) => (x >= minValue) && (x <= maxValue));
}

function getDistParams(bins: number[]): number[] {
    let filteredBins = filterOutliers(bins)
    const n = filteredBins.length
    const mean = filteredBins.reduce((a, b) => a + b) / n
    const std = Math.sqrt(filteredBins.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / n)
    return [mean, std]
}

function linspace(a: number, b: number, n?: number): number[] {
    if (typeof n === "undefined") n = Math.max(Math.round(b - a) + 1, 1);
    if (n < 2) {
        return n === 1 ? [a] : [];
    }
    var ret: number[] = Array(n);
    n--;
    for (let i = n; i >= 0; i--) {
        ret[i] = (i * b + (n - i) * a) / n;
    }
    return ret;
}

export function histogram2d(data1: number[], data2: number[], binsX: number, binsY: number): { data: number[][] } {
    // Calculate bin sizes
    const minX = Math.min(...data1);
    const maxX = Math.max(...data1);
    const minY = Math.min(...data2);
    const maxY = Math.max(...data2);
    const binSizeX = (maxX - minX) / binsX;
    const binSizeY = (maxY - minY) / binsY;

    // Create the histogram array
    const histogram = { data: Array(binsX).fill(null).map(() => Array(binsY).fill(0) as number[]) };

    // Populate the histogram
    for (let i = 0; i < data1.length; i++) {
      const xBin = Math.floor((data1[i] - minX) / binSizeX);
      const yBin = Math.floor((data2[i] - minY) / binSizeY);
      histogram.data[xBin][yBin]++;
    }

    return histogram;
  }

export default { range_function, getDistParams, linspace, GetFit, filterOutliers };
