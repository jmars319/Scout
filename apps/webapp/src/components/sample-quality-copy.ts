import type { MarketSampleQuality } from "@scout/domain";

export function describeSampleQuality(sampleQuality?: MarketSampleQuality): string {
  if (!sampleQuality) {
    return "In Progress";
  }

  if (sampleQuality === "strong_sample") {
    return "High Confidence";
  }

  if (sampleQuality === "adequate_sample") {
    return "Usable Sample";
  }

  if (sampleQuality === "partial_sample") {
    return "Limited Confidence";
  }

  return "Low Confidence";
}

export function describeSampleQualityMeaning(sampleQuality: MarketSampleQuality): string {
  if (sampleQuality === "strong_sample") {
    return "Scout found enough clean live results to treat this market snapshot as reliable.";
  }

  if (sampleQuality === "adequate_sample") {
    return "Scout found a usable market snapshot, with some normal search-result noise.";
  }

  if (sampleQuality === "partial_sample") {
    return "Scout found useful leads, but provider issues or noisy results make the market snapshot incomplete.";
  }

  return "Scout found too little clean evidence to treat this market snapshot as dependable.";
}

export function toneForSampleQuality(
  sampleQuality: MarketSampleQuality
): "neutral" | "good" | "warn" | "danger" {
  if (sampleQuality === "strong_sample") {
    return "good";
  }

  if (sampleQuality === "adequate_sample") {
    return "neutral";
  }

  if (sampleQuality === "partial_sample") {
    return "warn";
  }

  return "danger";
}
