import { describe, expect, it } from "vitest";
import type { ModelInfo, ModelStatus } from "../types/audio";
import { isFeatureReady, modelForFeature, modelInstallCounts } from "./models";

function model(id: string, status: ModelStatus): ModelInfo {
  return {
    id,
    name: id,
    purpose: "",
    url: "",
    filename: `${id}.onnx`,
    size_bytes: 1_000_000,
    sha256: null,
    license: "MIT",
    status,
    local_path: null,
    on_disk_bytes: null,
  };
}

describe("modelForFeature", () => {
  it("returns the model that backs the feature id", () => {
    const list = [model("rnnoise", "installed"), model("demucs-htdemucs", "notinstalled")];
    expect(modelForFeature(list, "clean")?.id).toBe("rnnoise");
    expect(modelForFeature(list, "split")?.id).toBe("demucs-htdemucs");
  });

  it("returns undefined when the model is missing from the list", () => {
    expect(modelForFeature([], "clean")).toBeUndefined();
  });
});

describe("isFeatureReady", () => {
  it("requires the matching model to be installed", () => {
    expect(isFeatureReady([model("rnnoise", "installed")], "clean")).toBe(true);
    expect(isFeatureReady([model("rnnoise", "downloading")], "clean")).toBe(false);
    expect(isFeatureReady([model("rnnoise", "notinstalled")], "clean")).toBe(false);
    expect(isFeatureReady([model("rnnoise", "corrupted")], "clean")).toBe(false);
  });

  it("returns false when the feature's model is not in the list", () => {
    expect(isFeatureReady([model("demucs-htdemucs", "installed")], "clean")).toBe(false);
  });
});

describe("modelInstallCounts", () => {
  it("counts only installed entries", () => {
    const list = [
      model("a", "installed"),
      model("b", "installed"),
      model("c", "downloading"),
      model("d", "notinstalled"),
    ];
    expect(modelInstallCounts(list)).toEqual({ installed: 2, total: 4 });
  });

  it("handles an empty list", () => {
    expect(modelInstallCounts([])).toEqual({ installed: 0, total: 0 });
  });
});
