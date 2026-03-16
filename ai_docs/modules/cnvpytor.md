# CNVpytor Module

## Purpose

The CNVpytor module implements copy number variation (CNV) detection and visualization within igv.js. It provides two independent data pipelines: one that reads pre-computed signals from HDF5-based `.pytor` files (the native output format of the CNVpytor tool), and another that computes CNV calls on-the-fly from VCF variant files. Both pipelines produce read depth and B-allele frequency (BAF) signals that are rendered as overlaid quantitative tracks.

## Genomic Context

Copy number variations are structural alterations where segments of the genome are duplicated or deleted relative to a reference. Detecting CNVs is critical for cancer genomics, rare disease diagnosis, and population genetics. CNVpytor (the standalone Python tool) bins the genome into fixed-size windows, counts read depth per bin, applies GC-content correction to remove sequencing bias, and uses statistical methods (mean-shift segmentation, likelihood-based 2D calling) to identify regions with abnormal copy number. The igv.js module re-implements key parts of this analysis in JavaScript, allowing CNV visualization directly in the browser without server-side computation.

The module handles two signal types:
- **Read Depth (RD)**: The number of aligned reads per genomic bin, normalized and GC-corrected, which reflects copy number (CN=2 is diploid normal).
- **B-Allele Frequency (BAF)**: The allelic ratio at heterozygous SNP sites, which helps distinguish copy-neutral loss of heterozygosity (LOH) from true deletions/duplications and enables mosaic event detection.

## Key Classes & Files

### `cnvpytor/cnvpytorTrack.ts`
The main track class (`CNVPytorTrack`) that extends `TrackBase`. Acts as a composite "merged track" that creates and manages multiple child wig tracks (RD raw, RD GC-corrected, CNV calls, BAF1, BAF2). Key responsibilities:
- Supports two input formats: HDF5 `.pytor` files (via `HDF5IndexedReader`) and VCF files (via `CNVpytorVCF`).
- Provides a rich context menu for selecting bin sizes, signal types (`rd_snp`, `rd`, `snp`, `cnh`), and CNV callers (`ReadDepth`, `2D`).
- Implements custom `draw()` that delegates to child tracks and adds guide lines (e.g., CN=2 reference line).
- Implements `paintAxis()` for the Y-axis with special handling for BAF (negative values displayed as positive).
- Supports autoscaling and manual scale configuration, log scale, and axis flipping.
- Lazy-loads chromosome data: tracks which chromosomes have been fetched per bin size and fetches new ones on demand in `getFeatures()`.
- Can convert back to a `VariantTrack` if it was originally created from one (via `convertToVariant()`).

### `cnvpytor/HDF5IndexedReader.ts`
Reads pre-computed CNVpytor data from HDF5 `.pytor` files using the `hdf5-indexed-reader` library. Contains:
- `HDF5Reader` -- Main reader class that opens the HDF5 file, discovers available bin sizes and signal types by parsing dataset keys, and extracts wig-formatted data for each chromosome. Reads raw RD, GC-corrected RD, partition/segmentation calls, mosaic 2D calls, BAF likelihood signals, and RD statistics.
- `SignalNames` -- Maps logical signal names (e.g., `raw_RD`, `gc_RD`, `baf`) to the actual HDF5 dataset key naming convention (e.g., `his_rd_p_chr1_100000`).
- `ParseSignals` -- Parses HDF5 keys using regex to discover which bin sizes and signal types are available in the file.
- Helper functions like `decode_segments()` for unpacking segment boundary arrays and `create_nested_array()` for reshaping flat arrays.

### `cnvpytor/cnvpytorVCF.ts`
Computes CNV signals from VCF variant data (`CNVpytorVCF` class). This is the on-the-fly analysis pipeline:
- Parses variants from VCF to extract per-bin read depth (from the `DP` INFO field) and heterozygous SNP allele depths (from the `AD` field).
- Bins variants into a fixed row bin size (10,000 bp), then adjusts to the user-specified bin size by aggregating.
- Computes BAF likelihood scores using the beta distribution across a 100-point grid for each bin.
- Delegates CNV calling to either `MeanShiftCaller` (ReadDepth caller) or `CombinedCaller` (2D caller).
- Returns arrays of wig features for RD (raw, GC-corrected, segmented) and BAF signals.

### `cnvpytor/baseCNVpytorVCF.ts`
Base class for the CNV callers, extending `FetchGCInfo`. Provides shared functionality:
- `FitingMethod` -- Fits a Gaussian/normal distribution to read depth histograms using the Levenberg-Marquardt algorithm (via vendored `lm-esm.js`) to determine global mean and standard deviation.
- `FetchGCInfo` -- Fetches GC content data from a remote JSON index (`https://storage.googleapis.com/cnvpytor_data/gcInfoData/GCinfo.json`) for the reference genome and bin size, then loads per-bin GC percentages.
- `baseCNVpytorVCF` -- Applies GC correction by computing mean RD per GC percentage bucket and adjusting bin scores accordingly. Also provides `formatDataStructure()` and `formatDataStructure_BAF()` to convert internal wig feature dictionaries into flat arrays suitable for track rendering.

### `cnvpytor/MeanShiftUtil.ts`
Implements the mean-shift segmentation algorithm for CNV calling (`MeanShiftCaller` class, extending `baseCNVpytorVCF`). The algorithm:
1. Computes an adaptive bandwidth based on local read depth signal strength.
2. Iterates through multiple bin band scales (2, 3, 4, ..., 128) to detect segment boundaries at different resolutions.
3. At each scale, computes a gradient vector for each bin by comparing it to neighbors within a Gaussian kernel window.
4. Identifies segment borders where the gradient changes sign (zero crossings).
5. Validates segments using Student's t-tests (1-sample against global mean, 2-sample against neighboring segments) with genome-size-corrected p-value thresholds.
6. After partitioning, performs CNV calling by classifying segments as deletions (below mean - delta) or duplications (above mean + delta), with E-value adjustment.

Also exports `Partition` class (an older/alternative implementation) and `DataStat` helper class for computing mean/std of data arrays.

### `cnvpytor/CombinedCaller.ts`
Implements the 2D (combined RD + BAF) CNV caller (`CombinedCaller` class, extending `baseCNVpytorVCF`). The `call_2d()` method:
1. Applies GC correction, then segments bins using a greedy overlap-merging strategy that considers both RD level overlap (Gaussian approximation) and BAF likelihood overlap.
2. Iteratively merges adjacent segments whose combined RD and BAF overlap exceeds a threshold, using `normal_overlap_approx()` and `likelihood_overlap()`.
3. Performs a second pass merging non-adjacent but nearby segments with similar profiles.
4. In the third stage, evaluates each segment against a grid of possible copy number states (CN=0..10) and haplotype configurations (h1, h2), computing likelihoods from both RD level and BAF profile to determine the most likely CNV genotype.

Supporting math functions: `normal()`, `normal_overlap_approx()`, `normal_merge()`, `likelihood_of_baf()`, `likelihood_baf_pval()`.

### `cnvpytor/GeneralUtil.ts`
Statistical and array utility functions used across the module:
- `GetFit` -- Extracts bin scores from all chromosomes and computes distribution parameters (mean, std) using outlier filtering (IQR method).
- `range_function()`, `linspace()` -- Array generation utilities.
- `Gaussian()` -- Returns a Gaussian function for given parameters.
- `filterOutliers()` -- IQR-based outlier removal.
- `getDistParams()` -- Computes mean and standard deviation after outlier filtering.
- `histogram2d()` -- Computes a 2D histogram (used for RD vs. BAF joint analysis).

### `cnvpytor/t_dist.ts`
Statistical functions for hypothesis testing:
- `TdistributionCDF()` -- Cumulative distribution function for Student's t-distribution, implemented using the incomplete beta function.
- `incompbeta()`, `contfractbeta()` -- Incomplete beta function evaluation using continued fraction expansion (translated from Numerical Recipes in C).
- `gamma()`, `lgamma()` -- Gamma function and its natural log, using Lanczos approximation for non-integers.
- `t_test_1_sample()` -- One-sample t-test (segment mean vs. global mean).
- `t_test_2_samples()` -- Two-sample t-test (comparing adjacent segments), using Welch's approximation for degrees of freedom.

## Data Flow

### HDF5 (.pytor) Pipeline
1. `CNVPytorTrack.postInit()` creates an `HDF5IndexedReader` with the file config.
2. `HDF5IndexedReader.get_rd_signal()` opens the HDF5 file, discovers available bin sizes and chromosomes, reads RD statistics, and extracts per-chromosome signals (raw RD, GC-corrected RD, partition calls, mosaic 2D calls, BAF).
3. Signals are normalized by dividing by the RD statistic mean and multiplying by 2 (to center on CN=2).
4. The track creates child wig tracks for each signal type and renders them overlaid.

### VCF Pipeline
1. `CNVPytorTrack.postInit()` loads all variants via `FeatureSource`, then creates a `CNVpytorVCF` instance.
2. `CNVpytorVCF.read_rd_baf()` bins variants, computes per-bin RD and BAF likelihoods.
3. The binned data is passed to either `MeanShiftCaller.callMeanshift()` or `CombinedCaller.call_2d()`.
4. The caller applies GC correction (fetching GC data remotely), fits a normal distribution to determine global mean/std, performs segmentation, and returns wig feature arrays.
5. The track creates child wig tracks and renders them.

### Rendering
- `CNVPytorTrack.getFeatures()` delegates to each child track's `getFeatures()`, returning an array of feature arrays.
- `CNVPytorTrack.draw()` iterates child tracks, passing each its corresponding feature array, and draws guide lines.
- The context menu allows switching bin sizes (triggering re-fetch/re-compute), signal types, and callers at runtime.

## Dependencies

### Depends on
- `hdf5-indexed-reader` (npm package) -- For reading HDF5 `.pytor` files.
- `vendor/lm-esm.js` -- Levenberg-Marquardt least-squares fitting for Gaussian curve fitting.
- `trackBase.js` -- Base class for `CNVPytorTrack`.
- `feature/featureSource.js` -- Used for loading VCF variants.
- `igv-canvas.js` (`IGVGraphics`) -- For drawing guide lines and axis labels.
- `igv-icons.js` (`createCheckbox`) -- For context menu checkbox items.
- `igv-utils` (`igvxhr`, `BGZip`, `StringUtils`) -- For HTTP requests, data loading (GC content files).
- `variant/variant.js` -- `Variant` type for VCF input.
- `browser.js` -- For creating child tracks, accessing genome info, reference frames.
- `util/trackClassRegistry.js` -- Registers `CNVPytorTrack` for variant track conversion.

### Depended on by
- `VariantTrack` can convert itself to a `CNVPytorTrack` via `convertToPytor()`, and the reverse conversion is supported via `convertToVariant()`.
- The track class registry maps `type: "cnvpytor"` to this track for config-based track creation.
