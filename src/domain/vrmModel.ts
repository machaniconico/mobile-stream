import type { VRMSource } from "./scene";

export type VrmModelAssetStatus = "pass" | "warn" | "fail";

export interface VrmModelAssetIssue {
  code: string;
  severity: VrmModelAssetStatus;
  message: string;
}

export interface VrmModelAssetReport {
  status: VrmModelAssetStatus;
  modelUri: string;
  issueCount: number;
  issues: VrmModelAssetIssue[];
  summary: string;
}

export interface VrmGlbHeaderReport {
  status: VrmModelAssetStatus;
  version: number | null;
  declaredLength: number;
  jsonChunkLength: number;
  binaryChunkCount: number;
  vrmExtensionVersion: "1.0" | "0.x" | null;
  requiredExtensionCount: number;
  usedExtensionCount: number;
  unsupportedRequiredExtensionCount: number;
  unsupportedRequiredExtensions: string[];
  humanoidBoneCount: number;
  expressionCount: number;
  bufferUriCount: number;
  imageCount: number;
  imageUriCount: number;
  externalImageUriCount: number;
  dataImageUriCount: number;
  unsupportedImageMimeCount: number;
  meshCount: number;
  meshPrimitiveCount: number;
  skinnedMeshPrimitiveCount: number;
  materialCount: number;
  textureCount: number;
  issueCount: number;
  issues: VrmModelAssetIssue[];
  summary: string;
}

const maxModelUriLength = 1000;
const localFileSchemes = new Set(["file", "content"]);
const remoteOrInlineSchemes = new Set(["http", "https", "data"]);
const glbMagic = 0x46546c67;
const glbJsonChunkType = 0x4e4f534a;
const glbBinChunkType = 0x004e4942;
const mobileVrmMaxBytes = 80 * 1024 * 1024;
const mobileVrmMaxMeshPrimitives = 64;
const mobileVrmMaxSkinnedMeshPrimitives = 48;
const mobileVrmMaxMaterials = 64;
const mobileVrmMaxTextures = 48;
const mobileVrmMaxImages = 48;
const recognizedRequiredExtensions = new Set([
  "VRM",
  "VRMC_vrm",
  "VRMC_materials_mtoon",
  "KHR_materials_unlit",
  "KHR_texture_transform",
  "KHR_materials_emissive_strength"
]);

export const normalizeVrmModelUri = (value: unknown): string => {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/[\r\n\t]/g, "").trim().slice(0, maxModelUriLength);
};

export const createVrmModelAssetReport = (
  source: Pick<VRMSource, "name" | "modelUri">
): VrmModelAssetReport => {
  const modelUri = normalizeVrmModelUri(source.modelUri);
  const issues: VrmModelAssetIssue[] = [];

  if (!modelUri) {
    issues.push({
      code: "vrm-model-missing",
      severity: "warn",
      message: `${source.name} has no VRM/GLB model URI.`
    });
  } else {
    const scheme = uriScheme(modelUri);
    if (scheme && remoteOrInlineSchemes.has(scheme)) {
      issues.push({
        code: "vrm-model-remote",
        severity: "warn",
        message: `${source.name} uses a ${scheme} VRM URI; production mobile rendering needs a local VRM package.`
      });
    } else if (scheme && !localFileSchemes.has(scheme)) {
      issues.push({
        code: "vrm-model-unsupported-uri",
        severity: "warn",
        message: `${source.name} uses an unsupported ${scheme} VRM URI.`
      });
    } else if (!scheme && !modelUri.startsWith("/")) {
      issues.push({
        code: "vrm-model-relative",
        severity: "warn",
        message: `${source.name} uses a relative VRM path that may not resolve inside the native renderer.`
      });
    } else if (!looksLikeVrmOrGlb(modelUri)) {
      issues.push({
        code: "vrm-model-extension",
        severity: "warn",
        message: `${source.name} model URI should point to a .vrm or .glb file.`
      });
    }
  }

  const status = statusFromIssues(issues);
  return {
    status,
    modelUri,
    issueCount: issues.length,
    issues,
    summary:
      status === "pass"
        ? `${source.name} has a local VRM/GLB model URI.`
        : `${source.name} VRM model package needs review before native rendering.`
  };
};

export const createVrmGlbHeaderReport = (value: ArrayBuffer | ArrayLike<number>): VrmGlbHeaderReport => {
  const bytes = bytesFrom(value);
  const issues: VrmModelAssetIssue[] = [];
  if (bytes.byteLength < 20) {
    return glbReport({
      issues: [
        {
          code: "vrm-glb-too-small",
          severity: "fail",
          message: "VRM file must be a binary glTF 2.0 GLB with a JSON chunk."
        }
      ]
    });
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const binaryChunkCount = countGlbChunks(view, bytes.byteLength, glbBinChunkType);
  const magic = view.getUint32(0, true);
  if (magic !== glbMagic) {
    return glbReport({
      issues: [
        {
          code: "vrm-glb-magic",
          severity: "fail",
          message: "VRM file must start with the binary glTF GLB magic header."
        }
      ]
    });
  }

  const version = view.getUint32(4, true);
  const declaredLength = view.getUint32(8, true);
  if (version !== 2) {
    issues.push({
      code: "vrm-glb-version",
      severity: "fail",
      message: "VRM mobile rendering requires binary glTF 2.0 GLB files."
    });
  }
  if (declaredLength !== bytes.byteLength) {
    issues.push({
      code: "vrm-glb-length-mismatch",
      severity: "fail",
      message: "GLB declared length does not match the file length."
    });
  } else if (declaredLength > mobileVrmMaxBytes) {
    issues.push({
      code: "vrm-glb-size-large",
      severity: "warn",
      message: "VRM file is large for mobile live compositing; validate frame time and memory pressure on physical devices."
    });
  }

  const jsonChunkLength = view.getUint32(12, true);
  const jsonChunkType = view.getUint32(16, true);
  if (jsonChunkType !== glbJsonChunkType) {
    issues.push({
      code: "vrm-glb-json-chunk-missing",
      severity: "fail",
      message: "GLB first chunk must be the JSON chunk."
    });
  }

  const jsonStart = 20;
  const jsonEnd = jsonStart + jsonChunkLength;
  if (jsonChunkLength <= 0 || jsonEnd > bytes.byteLength) {
    return glbReport({
      version,
      declaredLength,
      jsonChunkLength,
      issues: [
        ...issues,
        {
          code: "vrm-glb-json-chunk-length",
          severity: "fail",
          message: "GLB JSON chunk length is invalid."
        }
      ]
    });
  }

  const parsed = parseJsonChunk(bytes.slice(jsonStart, jsonEnd));
  if (!isRecord(parsed)) {
    return glbReport({
      version,
      declaredLength,
      jsonChunkLength,
      issues: [
        ...issues,
        {
          code: "vrm-glb-json-invalid",
          severity: "fail",
          message: "GLB JSON chunk must be valid JSON."
        }
      ]
    });
  }

  const extensionsUsed = stringArray(parsed.extensionsUsed);
  const extensionsRequired = stringArray(parsed.extensionsRequired);
  const unsupportedRequiredExtensions = extensionsRequired.filter(
    (extension) => !recognizedRequiredExtensions.has(extension)
  );
  if (unsupportedRequiredExtensions.length > 0) {
    issues.push({
      code: "vrm-required-extension-unsupported",
      severity: "fail",
      message: `VRM model requires unsupported glTF extension${unsupportedRequiredExtensions.length === 1 ? "" : "s"}: ${unsupportedRequiredExtensions.join(", ")}.`
    });
  }

  const extensions = isRecord(parsed.extensions) ? parsed.extensions : {};
  const vrm1 = isRecord(extensions.VRMC_vrm) ? extensions.VRMC_vrm : null;
  const vrm0 = isRecord(extensions.VRM) ? extensions.VRM : null;
  const vrmExtensionVersion = vrm1 ? "1.0" : vrm0 ? "0.x" : null;

  if (!vrmExtensionVersion && !extensionsUsed.includes("VRMC_vrm") && !extensionsUsed.includes("VRM")) {
    issues.push({
      code: "vrm-extension-missing",
      severity: "fail",
      message: "GLB does not declare a VRM extension."
    });
  }

  const humanoidBoneCount = countHumanoidBones(vrm1, vrm0);
  if (vrmExtensionVersion && humanoidBoneCount === 0) {
    issues.push({
      code: "vrm-humanoid-missing",
      severity: "warn",
      message: "VRM extension does not declare humanoid bone mappings."
    });
  }

  const expressionCount = countExpressions(vrm1, vrm0);
  if (vrmExtensionVersion && expressionCount === 0) {
    issues.push({
      code: "vrm-expressions-missing",
      severity: "warn",
      message: "VRM extension does not declare expressions or blendshape groups."
    });
  }

  const buffers = recordArray(parsed.buffers);
  const bufferUriCount = buffers.filter((buffer) => trimmedString(buffer.uri).length > 0).length;
  if (bufferUriCount > 0) {
    issues.push({
      code: "vrm-buffer-uri",
      severity: "fail",
      message: "VRM mobile rendering requires self-contained GLB binary buffers, not external or inline buffer URIs."
    });
  }
  if (buffers.length > 0 && bufferUriCount < buffers.length && binaryChunkCount === 0) {
    issues.push({
      code: "vrm-glb-bin-chunk-missing",
      severity: "fail",
      message: "VRM GLB declares binary buffers but does not include a BIN chunk."
    });
  }

  const images = recordArray(parsed.images);
  const imageUris = images.map((image) => trimmedString(image.uri)).filter((uri) => uri.length > 0);
  const dataImageUriCount = imageUris.filter(isDataUri).length;
  const externalImageUriCount = imageUris.length - dataImageUriCount;
  const unsupportedImageMimeCount = images.filter(hasUnsupportedImageMimeOrUri).length;
  const meshes = recordArray(parsed.meshes);
  const meshPrimitiveCounts = meshes.map((mesh) => recordArray(mesh.primitives).length);
  const meshPrimitiveCount = meshPrimitiveCounts.reduce((total, count) => total + count, 0);
  const skinnedMeshPrimitiveCount = countSkinnedMeshPrimitives(parsed.nodes, meshPrimitiveCounts);
  const materialCount = recordArray(parsed.materials).length;
  const textureCount = recordArray(parsed.textures).length;
  if (externalImageUriCount > 0) {
    issues.push({
      code: "vrm-image-external-uri",
      severity: "warn",
      message: "VRM image textures should be embedded in the GLB for native mobile rendering."
    });
  }
  if (unsupportedImageMimeCount > 0) {
    issues.push({
      code: "vrm-image-mime-unsupported",
      severity: "warn",
      message: "VRM image textures must be PNG or JPEG for the native renderer compatibility path."
    });
  }
  if (meshPrimitiveCount > mobileVrmMaxMeshPrimitives) {
    issues.push({
      code: "vrm-mesh-primitive-budget",
      severity: "warn",
      message: `VRM model has ${meshPrimitiveCount} mesh primitives; reduce mesh splits/material slots before mobile physical validation.`
    });
  }
  if (skinnedMeshPrimitiveCount > mobileVrmMaxSkinnedMeshPrimitives) {
    issues.push({
      code: "vrm-skinned-mesh-budget",
      severity: "warn",
      message: `VRM model has ${skinnedMeshPrimitiveCount} skinned mesh primitives; validate avatar frame time on target devices.`
    });
  }
  if (materialCount > mobileVrmMaxMaterials) {
    issues.push({
      code: "vrm-material-budget",
      severity: "warn",
      message: `VRM model has ${materialCount} materials; reduce material count for mobile live compositing stability.`
    });
  }
  if (textureCount > mobileVrmMaxTextures || images.length > mobileVrmMaxImages) {
    issues.push({
      code: "vrm-texture-budget",
      severity: "warn",
      message: `VRM model has ${textureCount} textures and ${images.length} images; reduce texture count before release validation.`
    });
  }

  return glbReport({
    version,
    declaredLength,
    jsonChunkLength,
    binaryChunkCount,
    vrmExtensionVersion,
    requiredExtensionCount: extensionsRequired.length,
    usedExtensionCount: extensionsUsed.length,
    unsupportedRequiredExtensionCount: unsupportedRequiredExtensions.length,
    unsupportedRequiredExtensions,
    humanoidBoneCount,
    expressionCount,
    bufferUriCount,
    imageCount: images.length,
    imageUriCount: imageUris.length,
    externalImageUriCount,
    dataImageUriCount,
    unsupportedImageMimeCount,
    meshCount: meshes.length,
    meshPrimitiveCount,
    skinnedMeshPrimitiveCount,
    materialCount,
    textureCount,
    issues
  });
};

const glbReport = ({
  version = null,
  declaredLength = 0,
  jsonChunkLength = 0,
  binaryChunkCount = 0,
  vrmExtensionVersion = null,
  requiredExtensionCount = 0,
  usedExtensionCount = 0,
  unsupportedRequiredExtensionCount = 0,
  unsupportedRequiredExtensions = [],
  humanoidBoneCount = 0,
  expressionCount = 0,
  bufferUriCount = 0,
  imageCount = 0,
  imageUriCount = 0,
  externalImageUriCount = 0,
  dataImageUriCount = 0,
  unsupportedImageMimeCount = 0,
  meshCount = 0,
  meshPrimitiveCount = 0,
  skinnedMeshPrimitiveCount = 0,
  materialCount = 0,
  textureCount = 0,
  issues
}: Partial<Omit<VrmGlbHeaderReport, "status" | "summary" | "issueCount">> & {
  issues: VrmModelAssetIssue[];
}): VrmGlbHeaderReport => {
  const status = statusFromIssues(issues);
  return {
    status,
    version,
    declaredLength,
    jsonChunkLength,
    binaryChunkCount,
    vrmExtensionVersion,
    requiredExtensionCount,
    usedExtensionCount,
    unsupportedRequiredExtensionCount,
    unsupportedRequiredExtensions,
    humanoidBoneCount,
    expressionCount,
    bufferUriCount,
    imageCount,
    imageUriCount,
    externalImageUriCount,
    dataImageUriCount,
    unsupportedImageMimeCount,
    meshCount,
    meshPrimitiveCount,
    skinnedMeshPrimitiveCount,
    materialCount,
    textureCount,
    issueCount: issues.length,
    issues,
    summary:
      status === "pass"
        ? `VRM GLB header is ready: VRM ${vrmExtensionVersion}, ${humanoidBoneCount} humanoid bone${humanoidBoneCount === 1 ? "" : "s"}, ${expressionCount} expression${expressionCount === 1 ? "" : "s"}, ${meshPrimitiveCount} mesh primitive${meshPrimitiveCount === 1 ? "" : "s"}, ${imageCount} image${imageCount === 1 ? "" : "s"}.`
        : `VRM GLB header needs review: ${issues.length} issue${issues.length === 1 ? "" : "s"}.`
  };
};

const countGlbChunks = (view: DataView, byteLength: number, chunkType: number): number => {
  let count = 0;
  for (let offset = 12; offset + 8 <= byteLength; ) {
    const chunkLength = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    if (type === chunkType) {
      count += 1;
    }
    const nextOffset = offset + 8 + align4(chunkLength);
    if (nextOffset <= offset || nextOffset > byteLength) {
      break;
    }
    offset = nextOffset;
  }
  return count;
};

const bytesFrom = (value: ArrayBuffer | ArrayLike<number>): Uint8Array =>
  value instanceof ArrayBuffer ? new Uint8Array(value) : Uint8Array.from(value);

const parseJsonChunk = (bytes: Uint8Array): unknown => {
  try {
    return JSON.parse(decodeUtf8(bytes).replace(/\0+$/g, "").trim());
  } catch {
    return null;
  }
};

const decodeUtf8 = (bytes: Uint8Array): string => {
  let output = "";
  for (let index = 0; index < bytes.length; index += 1) {
    const first = bytes[index] ?? 0;
    if (first < 0x80) {
      output += String.fromCharCode(first);
    } else if (first >= 0xc0 && first < 0xe0 && index + 1 < bytes.length) {
      const second = bytes[(index += 1)] ?? 0;
      output += String.fromCharCode(((first & 0x1f) << 6) | (second & 0x3f));
    } else if (first >= 0xe0 && first < 0xf0 && index + 2 < bytes.length) {
      const second = bytes[(index += 1)] ?? 0;
      const third = bytes[(index += 1)] ?? 0;
      output += String.fromCharCode(((first & 0x0f) << 12) | ((second & 0x3f) << 6) | (third & 0x3f));
    } else if (first >= 0xf0 && first < 0xf8 && index + 3 < bytes.length) {
      const second = bytes[(index += 1)] ?? 0;
      const third = bytes[(index += 1)] ?? 0;
      const fourth = bytes[(index += 1)] ?? 0;
      const codePoint =
        ((first & 0x07) << 18) |
        ((second & 0x3f) << 12) |
        ((third & 0x3f) << 6) |
        (fourth & 0x3f);
      output += String.fromCodePoint(codePoint);
    }
  }
  return output;
};

const stringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

const recordArray = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const trimmedString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const isDataUri = (uri: string): boolean => uri.toLowerCase().startsWith("data:");

const hasUnsupportedImageMimeOrUri = (image: Record<string, unknown>): boolean => {
  const mimeType = trimmedString(image.mimeType).toLowerCase();
  const uri = trimmedString(image.uri).toLowerCase();
  const supportedMime = mimeType === "image/png" || mimeType === "image/jpeg";
  const supportedUri =
    uri.endsWith(".png") ||
    uri.endsWith(".jpg") ||
    uri.endsWith(".jpeg") ||
    uri.startsWith("data:image/png") ||
    uri.startsWith("data:image/jpeg");
  return !supportedMime && !supportedUri;
};

const uriScheme = (uri: string): string | null => {
  const match = uri.match(/^([a-z][a-z0-9+.-]*):/i);
  return match ? match[1].toLowerCase() : null;
};

const looksLikeVrmOrGlb = (uri: string): boolean => {
  const clean = uri.split(/[?#]/, 1)[0]?.toLowerCase() ?? "";
  return clean.endsWith(".vrm") || clean.endsWith(".glb");
};

const countHumanoidBones = (vrm1: Record<string, unknown> | null, vrm0: Record<string, unknown> | null): number => {
  if (vrm1) {
    const humanoid = isRecord(vrm1.humanoid) ? vrm1.humanoid : null;
    const humanBones = isRecord(humanoid?.humanBones) ? humanoid.humanBones : null;
    return humanBones ? Object.keys(humanBones).length : 0;
  }
  if (vrm0) {
    const humanoid = isRecord(vrm0.humanoid) ? vrm0.humanoid : null;
    const humanBones = Array.isArray(humanoid?.humanBones) ? humanoid.humanBones : [];
    return humanBones.length;
  }
  return 0;
};

const countExpressions = (vrm1: Record<string, unknown> | null, vrm0: Record<string, unknown> | null): number => {
  if (vrm1) {
    const expressions = isRecord(vrm1.expressions) ? vrm1.expressions : null;
    const preset = isRecord(expressions?.preset) ? Object.keys(expressions.preset).length : 0;
    const custom = isRecord(expressions?.custom) ? Object.keys(expressions.custom).length : 0;
    return preset + custom;
  }
  if (vrm0) {
    const blendShapeMaster = isRecord(vrm0.blendShapeMaster) ? vrm0.blendShapeMaster : null;
    const blendShapeGroups = Array.isArray(blendShapeMaster?.blendShapeGroups) ? blendShapeMaster.blendShapeGroups : [];
    return blendShapeGroups.length;
  }
  return 0;
};

const countSkinnedMeshPrimitives = (nodesValue: unknown, meshPrimitiveCounts: number[]): number =>
  recordArray(nodesValue).reduce((total, node) => {
    const meshIndex = integerValue(node.mesh);
    if (meshIndex === null || integerValue(node.skin) === null) {
      return total;
    }
    return total + (meshPrimitiveCounts[meshIndex] ?? 0);
  }, 0);

const integerValue = (value: unknown): number | null =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;

const align4 = (value: number): number => Math.ceil(value / 4) * 4;

const statusFromIssues = (issues: VrmModelAssetIssue[]): VrmModelAssetStatus => {
  if (issues.some((issue) => issue.severity === "fail")) {
    return "fail";
  }
  if (issues.length > 0) {
    return "warn";
  }
  return "pass";
};
