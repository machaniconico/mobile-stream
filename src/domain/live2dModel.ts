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
  expressionCount: number;
  motionGroupCount: number;
  motionFileCount: number;
  physicsPath: string;
  posePath: string;
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

  const textures = Array.isArray(refs.Textures) ? refs.Textures.filter((texture): texture is string => typeof texture === "string") : [];
  if (textures.length === 0) {
    issues.push({
      code: "live2d-model3-textures-missing",
      severity: "fail",
      message: "Cubism model3.json must reference at least one texture."
    });
  }

  const expressions = Array.isArray(refs.Expressions)
    ? refs.Expressions.filter((expression): expression is Record<string, unknown> => isRecord(expression))
    : [];
  if (expressions.length === 0) {
    issues.push({
      code: "live2d-model3-expressions-missing",
      severity: "warn",
      message: "No Live2D expression files are declared for expression buttons."
    });
  }

  const motionGroups = isRecord(refs.Motions) ? refs.Motions : {};
  const motionGroupEntries = Object.entries(motionGroups);
  const motionFiles = motionGroupEntries.flatMap(([, group]) =>
    Array.isArray(group)
      ? group
          .filter((motion): motion is Record<string, unknown> => isRecord(motion))
          .map((motion) => (typeof motion.File === "string" ? motion.File : ""))
          .filter(Boolean)
      : []
  );
  if (motionFiles.length === 0) {
    issues.push({
      code: "live2d-model3-motions-missing",
      severity: "warn",
      message: "No Live2D motion files are declared."
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

  return manifestReport({
    version,
    mocPath,
    textureCount: textures.length,
    expressionCount: expressions.length,
    motionGroupCount: motionGroupEntries.length,
    motionFileCount: motionFiles.length,
    physicsPath,
    posePath,
    issues
  });
};

const manifestReport = ({
  version = null,
  mocPath = "",
  textureCount = 0,
  expressionCount = 0,
  motionGroupCount = 0,
  motionFileCount = 0,
  physicsPath = "",
  posePath = "",
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
    expressionCount,
    motionGroupCount,
    motionFileCount,
    physicsPath,
    posePath,
    issueCount: issues.length,
    issues,
    summary:
      status === "pass"
        ? `Cubism model3 manifest is ready: ${textureCount} texture${textureCount === 1 ? "" : "s"}, ${expressionCount} expression${expressionCount === 1 ? "" : "s"}, ${motionFileCount} motion${motionFileCount === 1 ? "" : "s"}.`
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

const uriScheme = (uri: string): string | null => {
  const match = uri.match(/^([a-z][a-z0-9+.-]*):/i);
  return match ? match[1].toLowerCase() : null;
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
