import type { Live2DSource } from "./scene";

export type Live2DModelAssetStatus = "pass" | "warn" | "fail";

export interface Live2DModelAssetIssue {
  code: string;
  severity: Live2DModelAssetStatus;
  message: string;
}

export interface Live2DModelAssetReport {
  status: Live2DModelAssetStatus;
  modelJsonUri: string;
  issueCount: number;
  issues: Live2DModelAssetIssue[];
  summary: string;
}

export interface Live2DModel3ManifestReport {
  status: Live2DModelAssetStatus;
  version: number | null;
  mocPath: string;
  textureCount: number;
  unsupportedTextureCount: number;
  expressionCount: number;
  missingExpressionFileCount: number;
  motionGroupCount: number;
  motionFileCount: number;
  missingMotionFileCount: number;
  physicsPath: string;
  posePath: string;
  referencedFileCount: number;
  duplicateReferenceCount: number;
  issueCount: number;
  issues: Live2DModelAssetIssue[];
  summary: string;
}

const maxModelJsonUriLength = 1000;
const localFileSchemes = new Set(["file", "content"]);
const remoteOrInlineSchemes = new Set(["http", "https", "data"]);

export const normalizeLive2DModelJsonUri = (value: unknown): string => {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/[\r\n\t]/g, "").trim().slice(0, maxModelJsonUriLength);
};

export const createLive2DModelAssetReport = (
  source: Pick<Live2DSource, "name" | "modelJsonUri">
): Live2DModelAssetReport => {
  const modelJsonUri = normalizeLive2DModelJsonUri(source.modelJsonUri);
  const issues: Live2DModelAssetIssue[] = [];

  if (!modelJsonUri) {
    issues.push({
      code: "live2d-model-json-missing",
      severity: "warn",
      message: `${source.name} has no Cubism model3.json URI.`
    });
  } else {
    const scheme = uriScheme(modelJsonUri);
    if (scheme && remoteOrInlineSchemes.has(scheme)) {
      issues.push({
        code: "live2d-model-json-remote",
        severity: "warn",
        message: `${source.name} uses a ${scheme} model3.json URI; production mobile rendering needs a local model package.`
      });
    } else if (scheme && !localFileSchemes.has(scheme)) {
      issues.push({
        code: "live2d-model-json-unsupported-uri",
        severity: "warn",
        message: `${source.name} uses an unsupported ${scheme} model3.json URI.`
      });
    } else if (!scheme && !modelJsonUri.startsWith("/")) {
      issues.push({
        code: "live2d-model-json-relative",
        severity: "warn",
        message: `${source.name} uses a relative model3.json path that may not resolve inside the native renderer.`
      });
    }
  }

  const status = statusFromIssues(issues);
  return {
    status,
    modelJsonUri,
    issueCount: issues.length,
    issues,
    summary:
      status === "pass"
        ? `${source.name} has a local Cubism model3.json URI.`
        : `${source.name} Live2D model package needs review before native rendering.`
  };
};

export const createLive2DModel3ManifestReport = (value: unknown): Live2DModel3ManifestReport => {
  const parsed = typeof value === "string" ? parseJson(value) : value;
  const issues: Live2DModelAssetIssue[] = [];
  if (!isRecord(parsed)) {
    return manifestReport({
      issues: [
        {
          code: "live2d-model3-invalid-json",
          severity: "fail",
          message: "Cubism model3.json must be a JSON object."
        }
      ]
    });
  }

  const version = typeof parsed.Version === "number" && Number.isFinite(parsed.Version) ? parsed.Version : null;
  if (version === null) {
    issues.push({
      code: "live2d-model3-version-missing",
      severity: "warn",
      message: "Cubism model3.json is missing a numeric Version field."
    });
  } else if (version < 3) {
    issues.push({
      code: "live2d-model3-version-unsupported",
      severity: "warn",
      message: "Cubism model3.json Version should be 3 or newer for the native Cubism renderer path."
    });
  }

  const refs = isRecord(parsed.FileReferences) ? parsed.FileReferences : null;
  if (!refs) {
    return manifestReport({
      version,
      issues: [
        ...issues,
        {
          code: "live2d-model3-file-references-missing",
          severity: "fail",
          message: "Cubism model3.json is missing FileReferences."
        }
      ]
    });
  }

  const mocPath = typeof refs.Moc === "string" ? refs.Moc.trim() : "";
  if (!mocPath) {
    issues.push({
      code: "live2d-model3-moc-missing",
      severity: "fail",
      message: "Cubism model3.json is missing FileReferences.Moc."
    });
  } else if (!mocPath.toLowerCase().endsWith(".moc3")) {
    issues.push({
      code: "live2d-model3-moc-extension",
      severity: "warn",
      message: "FileReferences.Moc should point to a .moc3 file."
    });
  }

  const rawTextures = Array.isArray(refs.Textures) ? refs.Textures : [];
  const textures = rawTextures.filter((texture): texture is string => typeof texture === "string").map((texture) => texture.trim());
  const invalidTextureEntryCount = rawTextures.length - textures.length;
  if (textures.length === 0) {
    issues.push({
      code: "live2d-model3-textures-missing",
      severity: "fail",
      message: "Cubism model3.json must reference at least one texture."
    });
  }
  if (invalidTextureEntryCount > 0 || textures.some((texture) => texture.length === 0)) {
    issues.push({
      code: "live2d-model3-texture-entry-invalid",
      severity: "fail",
      message: "Cubism texture references must be non-empty strings."
    });
  }
  const unsupportedTextureCount = textures.filter((texture) => !hasSupportedTextureExtension(texture)).length;
  if (unsupportedTextureCount > 0) {
    issues.push({
      code: "live2d-model3-texture-extension",
      severity: "warn",
      message: "Cubism textures should be PNG or JPEG files for native mobile renderer compatibility."
    });
  }

  const expressions = Array.isArray(refs.Expressions)
    ? refs.Expressions.filter((expression): expression is Record<string, unknown> => isRecord(expression))
    : [];
  const missingExpressionFileCount = expressions.filter((expression) => !nonEmptyString(expression.File)).length;
  if (expressions.length === 0) {
    issues.push({
      code: "live2d-model3-expressions-missing",
      severity: "warn",
      message: "No Live2D expression files are declared for expression buttons."
    });
  } else if (missingExpressionFileCount > 0) {
    issues.push({
      code: "live2d-model3-expression-file-missing",
      severity: "warn",
      message: "One or more Live2D expressions are missing a File reference."
    });
  }

  const motionGroups = isRecord(refs.Motions) ? refs.Motions : {};
  const motionGroupEntries = Object.entries(motionGroups);
  let missingMotionFileCount = 0;
  const motionFiles = motionGroupEntries.flatMap(([, group]) =>
    Array.isArray(group)
      ? group
          .filter((motion): motion is Record<string, unknown> => isRecord(motion))
          .map((motion) => {
            const file = typeof motion.File === "string" ? motion.File.trim() : "";
            if (!file) {
              missingMotionFileCount += 1;
            }
            return file;
          })
          .filter(Boolean)
      : []
  );
  if (motionFiles.length === 0) {
    issues.push({
      code: "live2d-model3-motions-missing",
      severity: "warn",
      message: "No Live2D motion files are declared."
    });
  } else if (missingMotionFileCount > 0) {
    issues.push({
      code: "live2d-model3-motion-file-missing",
      severity: "warn",
      message: "One or more Live2D motions are missing a File reference."
    });
  }

  const physicsPath = typeof refs.Physics === "string" ? refs.Physics.trim() : "";
  const posePath = typeof refs.Pose === "string" ? refs.Pose.trim() : "";
  if (!physicsPath) {
    issues.push({
      code: "live2d-model3-physics-missing",
      severity: "warn",
      message: "No Live2D physics file is declared."
    });
  }

  const extensionChecks: Array<[string, string, readonly string[]]> = [
    ["Moc", mocPath, [".moc3"]],
    ...textures.map((texture) => ["Texture", texture, [".png", ".jpg", ".jpeg"]] as [string, string, readonly string[]]),
    ...expressions.map((expression) => [
      "Expression",
      typeof expression.File === "string" ? expression.File.trim() : "",
      [".exp3.json"]
    ] as [string, string, readonly string[]]),
    ...motionFiles.map((motion) => ["Motion", motion, [".motion3.json"]] as [string, string, readonly string[]]),
    ["Physics", physicsPath, [".physics3.json"]],
    ["Pose", posePath, [".pose3.json"]],
    ["UserData", typeof refs.UserData === "string" ? refs.UserData.trim() : "", [".userdata3.json"]],
    ["DisplayInfo", typeof refs.DisplayInfo === "string" ? refs.DisplayInfo.trim() : "", [".cdi3.json"]]
  ];
  for (const [label, path, expectedExtensions] of extensionChecks) {
    if (!path || label === "Texture" || label === "Moc") {
      continue;
    }
    if (!hasAnyExtension(path, expectedExtensions)) {
      issues.push({
        code: "live2d-model3-reference-extension",
        severity: "warn",
        message: `${label} reference "${path}" should end with ${expectedExtensions.join(" or ")}.`
      });
    }
  }

  const referencedFiles = [
    ["Moc", mocPath],
    ...textures.map((texture) => ["Texture", texture] as const),
    ...expressions.map((expression) => ["Expression", typeof expression.File === "string" ? expression.File : ""] as const),
    ...motionFiles.map((motion) => ["Motion", motion] as const),
    ["Physics", physicsPath],
    ["Pose", posePath],
    ["UserData", typeof refs.UserData === "string" ? refs.UserData : ""],
    ["DisplayInfo", typeof refs.DisplayInfo === "string" ? refs.DisplayInfo : ""]
  ];
  for (const [label, path] of referencedFiles) {
    if (!path) {
      continue;
    }
    const unsafeReason = unsafeModelReferenceReason(path);
    if (unsafeReason) {
      issues.push({
        code: "live2d-model3-unsafe-reference",
        severity: "fail",
        message: `${label} reference "${path}" ${unsafeReason}.`
      });
    }
  }
  const referencePaths = referencedFiles
    .map(([, path]) => path.trim())
    .filter(Boolean)
    .map((path) => path.replace(/\\/g, "/").toLowerCase());
  const duplicateReferenceCount = countDuplicateValues(referencePaths);
  if (duplicateReferenceCount > 0) {
    issues.push({
      code: "live2d-model3-duplicate-reference",
      severity: "warn",
      message: "Cubism model3.json references the same package file more than once."
    });
  }

  return manifestReport({
    version,
    mocPath,
    textureCount: textures.length,
    unsupportedTextureCount,
    expressionCount: expressions.length,
    missingExpressionFileCount,
    motionGroupCount: motionGroupEntries.length,
    motionFileCount: motionFiles.length,
    missingMotionFileCount,
    physicsPath,
    posePath,
    referencedFileCount: referencePaths.length,
    duplicateReferenceCount,
    issues
  });
};

const manifestReport = ({
  version = null,
  mocPath = "",
  textureCount = 0,
  unsupportedTextureCount = 0,
  expressionCount = 0,
  missingExpressionFileCount = 0,
  motionGroupCount = 0,
  motionFileCount = 0,
  missingMotionFileCount = 0,
  physicsPath = "",
  posePath = "",
  referencedFileCount = 0,
  duplicateReferenceCount = 0,
  issues
}: Partial<Omit<Live2DModel3ManifestReport, "status" | "summary" | "issueCount">> & {
  issues: Live2DModelAssetIssue[];
}): Live2DModel3ManifestReport => {
  const status = statusFromIssues(issues);
  return {
    status,
    version,
    mocPath,
    textureCount,
    unsupportedTextureCount,
    expressionCount,
    missingExpressionFileCount,
    motionGroupCount,
    motionFileCount,
    missingMotionFileCount,
    physicsPath,
    posePath,
    referencedFileCount,
    duplicateReferenceCount,
    issueCount: issues.length,
    issues,
    summary:
      status === "pass"
        ? `Cubism model3 manifest is ready: ${textureCount} texture${textureCount === 1 ? "" : "s"}, ${expressionCount} expression${expressionCount === 1 ? "" : "s"}, ${motionFileCount} motion${motionFileCount === 1 ? "" : "s"}, ${referencedFileCount} packaged reference${referencedFileCount === 1 ? "" : "s"}.`
        : `Cubism model3 manifest needs review: ${issues.length} issue${issues.length === 1 ? "" : "s"}.`
  };
};

const parseJson = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

const uriScheme = (uri: string): string | null => {
  const match = uri.match(/^([a-z][a-z0-9+.-]*):/i);
  return match ? match[1].toLowerCase() : null;
};

const hasSupportedTextureExtension = (path: string): boolean => hasAnyExtension(path, [".png", ".jpg", ".jpeg"]);

const hasAnyExtension = (path: string, extensions: readonly string[]): boolean => {
  const normalized = path.split(/[?#]/, 1)[0]?.toLowerCase() ?? "";
  return extensions.some((extension) => normalized.endsWith(extension));
};

const countDuplicateValues = (values: string[]): number => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  values.forEach((value) => {
    if (seen.has(value)) {
      duplicates.add(value);
    } else {
      seen.add(value);
    }
  });
  return duplicates.size;
};

const unsafeModelReferenceReason = (path: string): string | null => {
  const normalized = path.trim().replace(/\\/g, "/");
  if (!normalized) {
    return "is empty";
  }
  if (uriScheme(normalized)) {
    return "must be packaged locally, not referenced through a URI";
  }
  if (normalized.startsWith("/")) {
    return "must be relative to the model3.json package";
  }
  if (normalized.split("/").some((segment) => segment === "..")) {
    return "must not traverse outside the model package";
  }
  return null;
};

const statusFromIssues = (issues: Live2DModelAssetIssue[]): Live2DModelAssetStatus => {
  if (issues.some((issue) => issue.severity === "fail")) {
    return "fail";
  }
  if (issues.length > 0) {
    return "warn";
  }
  return "pass";
};
