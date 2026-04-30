import { MODEL_FOR_FEATURE, type AiFeature, type ModelInfo } from "../types/audio";

/**
 * Look up the model that backs a given AI feature in a list of model
 * descriptors. Returns `undefined` when the feature has no entry yet.
 */
export function modelForFeature(
  models: ModelInfo[],
  feature: AiFeature
): ModelInfo | undefined {
  const id = MODEL_FOR_FEATURE[feature];
  return models.find((m) => m.id === id);
}

/** True if the model exists *and* is fully installed on disk. */
export function isFeatureReady(
  models: ModelInfo[],
  feature: AiFeature
): boolean {
  return modelForFeature(models, feature)?.status === "installed";
}

/** Aggregate counts for the "AI badge" in the header. */
export function modelInstallCounts(models: ModelInfo[]) {
  return {
    installed: models.filter((m) => m.status === "installed").length,
    total: models.length,
  };
}
