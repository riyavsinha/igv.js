/**
 * Registry for track class references used in track type conversion.
 * This breaks the circular dependency between VariantTrack and CNVPytorTrack.
 */
const trackClasses: Record<string, unknown> = {}

export default trackClasses

