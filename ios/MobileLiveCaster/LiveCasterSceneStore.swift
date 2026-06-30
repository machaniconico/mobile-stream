import Foundation
import React
import UIKit
import UniformTypeIdentifiers

private let liveCasterSceneAppGroup = "group.com.mobilelivecaster.app"

@objc(LiveCasterSceneStore)
final class LiveCasterSceneStore: NSObject, UIDocumentPickerDelegate {
    private let fileName = "mobile-live-caster-scene.json"
    private let sessionSummariesFileName = "mobile-live-caster-session-summaries.json"
    private let validationRunsFileName = "mobile-live-caster-validation-runs.json"
    private let sceneAssetsDirectoryName = "scene-assets"
    private var stillImagePickerResolve: RCTPromiseResolveBlock?
    private var stillImagePickerReject: RCTPromiseRejectBlock?
    private var stillImagePickerFilenameHint = "still-image"
    private var stillImagePickerAssetKind = SceneAssetKind.stillImage

    @objc
    static func requiresMainQueueSetup() -> Bool {
        false
    }

    @objc(saveScene:resolver:rejecter:)
    func saveScene(
        _ sceneJson: String,
        resolver resolve: RCTPromiseResolveBlock,
        rejecter reject: RCTPromiseRejectBlock
    ) {
        guard let data = sceneJson.data(using: .utf8), let url = sceneURL() else {
            reject("scene_store_encode_failed", "Scene could not be encoded as UTF-8", nil)
            return
        }

        do {
            try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            try data.write(to: url, options: .atomic)
            resolve(true)
        } catch {
            reject("scene_store_save_failed", "Scene save failed", error)
        }
    }

    @objc(loadScene:rejecter:)
    func loadScene(
        _ resolve: RCTPromiseResolveBlock,
        rejecter reject: RCTPromiseRejectBlock
    ) {
        guard let url = sceneURL() else {
            resolve(nil)
            return
        }

        guard FileManager.default.fileExists(atPath: url.path) else {
            resolve(nil)
            return
        }

        do {
            resolve(try String(contentsOf: url, encoding: .utf8))
        } catch {
            reject("scene_store_load_failed", "Scene load failed", error)
        }
    }

    @objc(clearScene:rejecter:)
    func clearScene(
        _ resolve: RCTPromiseResolveBlock,
        rejecter reject: RCTPromiseRejectBlock
    ) {
        guard let url = sceneURL(), FileManager.default.fileExists(atPath: url.path) else {
            resolve(true)
            return
        }

        do {
            try FileManager.default.removeItem(at: url)
            resolve(true)
        } catch {
            reject("scene_store_clear_failed", "Scene clear failed", error)
        }
    }

    @objc(prepareStillImageAsset:filenameHint:resolver:rejecter:)
    func prepareStillImageAsset(
        _ sourceURI: String,
        filenameHint: String,
        resolver resolve: RCTPromiseResolveBlock,
        rejecter reject: RCTPromiseRejectBlock
    ) {
        let trimmedURI = sourceURI.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedURI.isEmpty else {
            reject("scene_asset_empty_uri", "Still-image asset URI is empty", nil)
            return
        }

        guard let sourceURL = localSourceURL(trimmedURI) else {
            reject("scene_asset_unsupported_uri", "Still-image asset must be a file URL or absolute path on iOS", nil)
            return
        }

        do {
            let destinationURL = try copySceneAsset(sourceURL: sourceURL, filenameHint: filenameHint, assetKind: .stillImage)
            resolve(destinationURL.absoluteString)
        } catch {
            reject("scene_asset_copy_failed", "Still-image asset copy failed", error)
        }
    }

    @objc(pickStillImageAsset:resolver:rejecter:)
    func pickStillImageAsset(
        _ filenameHint: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        DispatchQueue.main.async {
            guard self.stillImagePickerResolve == nil else {
                reject("scene_asset_picker_busy", "A still-image picker is already open", nil)
                return
            }

            guard let presenter = RCTPresentedViewController() else {
                reject("scene_asset_picker_unavailable", "No view controller is available to present the image picker", nil)
                return
            }

            self.stillImagePickerResolve = resolve
            self.stillImagePickerReject = reject
            self.stillImagePickerFilenameHint = filenameHint.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "still-image" : filenameHint
            self.stillImagePickerAssetKind = .stillImage

            let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.image], asCopy: false)
            picker.allowsMultipleSelection = false
            picker.delegate = self
            presenter.present(picker, animated: true)
        }
    }

    @objc(prepareVrmModelAsset:filenameHint:resolver:rejecter:)
    func prepareVrmModelAsset(
        _ sourceURI: String,
        filenameHint: String,
        resolver resolve: RCTPromiseResolveBlock,
        rejecter reject: RCTPromiseRejectBlock
    ) {
        let trimmedURI = sourceURI.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedURI.isEmpty else {
            reject("scene_asset_empty_uri", "VRM model asset URI is empty", nil)
            return
        }

        guard let sourceURL = localSourceURL(trimmedURI) else {
            reject("scene_asset_unsupported_uri", "VRM model asset must be a file URL or absolute path on iOS", nil)
            return
        }

        do {
            let destinationURL = try copySceneAsset(sourceURL: sourceURL, filenameHint: filenameHint, assetKind: .vrmModel)
            resolve(destinationURL.absoluteString)
        } catch {
            reject("scene_asset_copy_failed", "VRM model asset copy failed", error)
        }
    }

    @objc(pickVrmModelAsset:resolver:rejecter:)
    func pickVrmModelAsset(
        _ filenameHint: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        DispatchQueue.main.async {
            guard self.stillImagePickerResolve == nil else {
                reject("scene_asset_picker_busy", "A scene asset picker is already open", nil)
                return
            }

            guard let presenter = RCTPresentedViewController() else {
                reject("scene_asset_picker_unavailable", "No view controller is available to present the VRM model picker", nil)
                return
            }

            self.stillImagePickerResolve = resolve
            self.stillImagePickerReject = reject
            self.stillImagePickerFilenameHint = filenameHint.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "avatar.vrm" : filenameHint
            self.stillImagePickerAssetKind = .vrmModel

            let picker = UIDocumentPickerViewController(
                forOpeningContentTypes: [
                    UTType(filenameExtension: "vrm") ?? .data,
                    UTType(filenameExtension: "glb") ?? .data
                ],
                asCopy: false
            )
            picker.allowsMultipleSelection = false
            picker.delegate = self
            presenter.present(picker, animated: true)
        }
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        let pending = clearStillImagePicker()
        pending.resolve?(nil)
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        let pending = clearStillImagePicker()
        guard let sourceURL = urls.first else {
            pending.resolve?(nil)
            return
        }

        do {
            let destinationURL = try copySceneAsset(sourceURL: sourceURL, filenameHint: pending.filenameHint, assetKind: pending.assetKind)
            pending.resolve?(destinationURL.absoluteString)
        } catch {
            pending.reject?("scene_asset_copy_failed", "\(pending.assetKind.label) asset copy failed", error)
        }
    }

    @objc(analyzeStillImageAsset:resolver:rejecter:)
    func analyzeStillImageAsset(
        _ sourceURI: String,
        resolver resolve: RCTPromiseResolveBlock,
        rejecter reject: RCTPromiseRejectBlock
    ) {
        let trimmedURI = sourceURI.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedURI.isEmpty, let sourceURL = localSourceURL(trimmedURI) else {
            resolve(nil)
            return
        }
        guard let image = UIImage(contentsOfFile: sourceURL.path), let result = analyzeStillImage(image) else {
            resolve(nil)
            return
        }
        do {
            let data = try JSONSerialization.data(withJSONObject: result, options: [])
            resolve(String(data: data, encoding: .utf8))
        } catch {
            reject("scene_asset_analysis_failed", "Still-image asset analysis failed", error)
        }
    }

    @objc(saveSessionSummaries:resolver:rejecter:)
    func saveSessionSummaries(
        _ summariesJson: String,
        resolver resolve: RCTPromiseResolveBlock,
        rejecter reject: RCTPromiseRejectBlock
    ) {
        guard let data = summariesJson.data(using: .utf8), let url = sessionSummariesURL() else {
            reject("session_summary_store_encode_failed", "Session summaries could not be encoded as UTF-8", nil)
            return
        }

        do {
            try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            try data.write(to: url, options: .atomic)
            resolve(true)
        } catch {
            reject("session_summary_store_save_failed", "Session summaries save failed", error)
        }
    }

    @objc(loadSessionSummaries:rejecter:)
    func loadSessionSummaries(
        _ resolve: RCTPromiseResolveBlock,
        rejecter reject: RCTPromiseRejectBlock
    ) {
        guard let url = sessionSummariesURL() else {
            resolve(nil)
            return
        }

        guard FileManager.default.fileExists(atPath: url.path) else {
            resolve(nil)
            return
        }

        do {
            resolve(try String(contentsOf: url, encoding: .utf8))
        } catch {
            reject("session_summary_store_load_failed", "Session summaries load failed", error)
        }
    }

    @objc(clearSessionSummaries:rejecter:)
    func clearSessionSummaries(
        _ resolve: RCTPromiseResolveBlock,
        rejecter reject: RCTPromiseRejectBlock
    ) {
        guard let url = sessionSummariesURL(), FileManager.default.fileExists(atPath: url.path) else {
            resolve(true)
            return
        }

        do {
            try FileManager.default.removeItem(at: url)
            resolve(true)
        } catch {
            reject("session_summary_store_clear_failed", "Session summaries clear failed", error)
        }
    }

    @objc(saveValidationRuns:resolver:rejecter:)
    func saveValidationRuns(
        _ runsJson: String,
        resolver resolve: RCTPromiseResolveBlock,
        rejecter reject: RCTPromiseRejectBlock
    ) {
        guard let data = runsJson.data(using: .utf8), let url = validationRunsURL() else {
            reject("validation_run_store_encode_failed", "Validation runs could not be encoded as UTF-8", nil)
            return
        }

        do {
            try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            try data.write(to: url, options: .atomic)
            resolve(true)
        } catch {
            reject("validation_run_store_save_failed", "Validation runs save failed", error)
        }
    }

    @objc(loadValidationRuns:rejecter:)
    func loadValidationRuns(
        _ resolve: RCTPromiseResolveBlock,
        rejecter reject: RCTPromiseRejectBlock
    ) {
        guard let url = validationRunsURL() else {
            resolve(nil)
            return
        }

        guard FileManager.default.fileExists(atPath: url.path) else {
            resolve(nil)
            return
        }

        do {
            resolve(try String(contentsOf: url, encoding: .utf8))
        } catch {
            reject("validation_run_store_load_failed", "Validation runs load failed", error)
        }
    }

    @objc(clearValidationRuns:rejecter:)
    func clearValidationRuns(
        _ resolve: RCTPromiseResolveBlock,
        rejecter reject: RCTPromiseRejectBlock
    ) {
        guard let url = validationRunsURL(), FileManager.default.fileExists(atPath: url.path) else {
            resolve(true)
            return
        }

        do {
            try FileManager.default.removeItem(at: url)
            resolve(true)
        } catch {
            reject("validation_run_store_clear_failed", "Validation runs clear failed", error)
        }
    }

    private func sceneURL() -> URL? {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?.appendingPathComponent(fileName)
    }

    private func sessionSummariesURL() -> URL? {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?.appendingPathComponent(sessionSummariesFileName)
    }

    private func validationRunsURL() -> URL? {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?.appendingPathComponent(validationRunsFileName)
    }

    private func sceneAssetsURL() -> URL? {
        FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: liveCasterSceneAppGroup)?
            .appendingPathComponent(sceneAssetsDirectoryName, isDirectory: true)
    }

    private func localSourceURL(_ rawURI: String) -> URL? {
        if let url = URL(string: rawURI), url.isFileURL {
            return url
        }
        if rawURI.hasPrefix("/") {
            return URL(fileURLWithPath: rawURI)
        }
        return nil
    }

    private func sceneAssetDestinationFileName(sourceURL: URL, filenameHint: String, assetKind: SceneAssetKind) throws -> String {
        let sourceExtension = sourceURL.pathExtension.trimmingCharacters(in: .whitespacesAndNewlines)
        let hintExtension = URL(fileURLWithPath: filenameHint).pathExtension.trimmingCharacters(in: .whitespacesAndNewlines)
        let candidateExtension = sourceExtension.isEmpty ? hintExtension : sourceExtension
        let fileExtension = candidateExtension.isEmpty ? assetKind.fallbackExtension : candidateExtension.lowercased()
        if assetKind == .vrmModel && fileExtension != "vrm" && fileExtension != "glb" {
            throw LiveCasterSceneStoreError.unsupportedVrmModelExtension
        }
        let sourceBaseName = sourceURL.deletingPathExtension().lastPathComponent
        let hintBaseName = URL(fileURLWithPath: filenameHint).deletingPathExtension().lastPathComponent
        let safeBaseName = sanitizedAssetFileComponent(sourceBaseName.isEmpty ? hintBaseName : sourceBaseName, fallback: assetKind.fallbackBaseName)
        return "\(safeBaseName)-\(UUID().uuidString).\(fileExtension)"
    }

    private func copySceneAsset(sourceURL: URL, filenameHint: String, assetKind: SceneAssetKind) throws -> URL {
        guard let destinationDirectory = sceneAssetsURL() else {
            throw LiveCasterSceneStoreError.appGroupUnavailable
        }

        let accessGranted = sourceURL.startAccessingSecurityScopedResource()
        defer {
            if accessGranted {
                sourceURL.stopAccessingSecurityScopedResource()
            }
        }

        guard FileManager.default.fileExists(atPath: sourceURL.path) else {
            throw LiveCasterSceneStoreError.sourceMissing
        }

        try FileManager.default.createDirectory(at: destinationDirectory, withIntermediateDirectories: true)
        let destinationURL = destinationDirectory.appendingPathComponent(
            try sceneAssetDestinationFileName(sourceURL: sourceURL, filenameHint: filenameHint, assetKind: assetKind)
        )
        if FileManager.default.fileExists(atPath: destinationURL.path) {
            try FileManager.default.removeItem(at: destinationURL)
        }
        try FileManager.default.copyItem(at: sourceURL, to: destinationURL)
        return destinationURL
    }

    private func analyzeStillImage(_ image: UIImage) -> [String: Any]? {
        guard let sourceSize = orientedStillImagePixelSize(image) else {
            return nil
        }
        let maxAnalysisSize = 512
        let sourceWidth = sourceSize.width
        let sourceHeight = sourceSize.height
        let sourceMax = max(sourceWidth, sourceHeight)
        let scale = sourceMax > maxAnalysisSize ? CGFloat(maxAnalysisSize) / CGFloat(sourceMax) : 1
        let width = max(1, Int(round(CGFloat(sourceWidth) * scale)))
        let height = max(1, Int(round(CGFloat(sourceHeight) * scale)))
        guard let renderedImage = renderedStillImageCGImageForAnalysis(image, width: width, height: height) else {
            return nil
        }
        var pixels = [UInt8](repeating: 0, count: width * height * 4)
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        guard let context = CGContext(
            data: &pixels,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: width * 4,
            space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else {
            return nil
        }
        context.interpolationQuality = .medium
        context.draw(renderedImage, in: CGRect(x: 0, y: 0, width: width, height: height))

        let sampleStep = max(1, Int(ceil(Double(max(width, height)) / 512.0)))
        let bounds = analyzeForegroundBounds(pixels: pixels, width: width, height: height, sampleStep: sampleStep)
        let imageAspectRatio = Double(width) / Double(height)
        var result: [String: Any] = [
            "imageAspectRatio": imageAspectRatio,
            "imageAnalysis": [
                "imageAspectRatio": imageAspectRatio,
                "foregroundBounds": bounds?.dictionary() ?? NSNull(),
                "foregroundCoverage": bounds?.foregroundCoverage ?? 0,
                "confidence": bounds?.confidence ?? 0
            ]
        ]
        if let landmarkAnalysis = createPixelFeatureLandmarks(pixels: pixels, width: width, height: height, sampleStep: sampleStep, bounds: bounds) {
            result["landmarkAnalysis"] = landmarkAnalysis
        }
        return result
    }

    private func orientedStillImagePixelSize(_ image: UIImage) -> (width: Int, height: Int)? {
        guard let cgImage = image.cgImage else {
            return nil
        }
        let swapsAxes = image.imageOrientation == .left
            || image.imageOrientation == .leftMirrored
            || image.imageOrientation == .right
            || image.imageOrientation == .rightMirrored
        let width = max(1, swapsAxes ? cgImage.height : cgImage.width)
        let height = max(1, swapsAxes ? cgImage.width : cgImage.height)
        return (width, height)
    }

    private func renderedStillImageCGImageForAnalysis(_ image: UIImage, width: Int, height: Int) -> CGImage? {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = false
        let size = CGSize(width: width, height: height)
        let rendered = UIGraphicsImageRenderer(size: size, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
        return rendered.cgImage
    }

    private func analyzeForegroundBounds(
        pixels: [UInt8],
        width: Int,
        height: Int,
        sampleStep: Int
    ) -> NativeRigBounds? {
        var minX = width
        var maxX = -1
        var minY = height
        var maxY = -1
        var foregroundSamples = 0
        var totalSamples = 0
        for y in stride(from: 0, to: height, by: sampleStep) {
            for x in stride(from: 0, to: width, by: sampleStep) {
                totalSamples += 1
                let alpha = pixels[(y * width + x) * 4 + 3]
                if alpha <= 16 {
                    continue
                }
                foregroundSamples += 1
                minX = min(minX, x)
                maxX = max(maxX, x)
                minY = min(minY, y)
                maxY = max(maxY, y)
            }
        }
        guard foregroundSamples > 0, totalSamples > 0 else {
            return nil
        }
        let left = Double(minX) / Double(width)
        let right = min(1, Double(maxX + sampleStep) / Double(width))
        let top = Double(minY) / Double(height)
        let bottom = min(1, Double(maxY + sampleStep) / Double(height))
        let boundWidth = max(0, right - left)
        let boundHeight = max(0, bottom - top)
        let foregroundCoverage = Double(foregroundSamples) / Double(totalSamples)
        return NativeRigBounds(
            left: left,
            right: right,
            top: top,
            bottom: bottom,
            width: boundWidth,
            height: boundHeight,
            foregroundCoverage: foregroundCoverage,
            confidence: clamp01(boundWidth * boundHeight > 0 ? foregroundCoverage / max(boundWidth * boundHeight, 0.01) : 0)
        )
    }

    private func createPixelFeatureLandmarks(
        pixels: [UInt8],
        width: Int,
        height: Int,
        sampleStep: Int,
        bounds: NativeRigBounds?
    ) -> [String: Any]? {
        let activeBounds = bounds ?? NativeRigBounds(
            left: 0,
            right: 1,
            top: 0,
            bottom: 1,
            width: 1,
            height: 1,
            foregroundCoverage: 1,
            confidence: 0
        )
        guard activeBounds.width >= 0.08, activeBounds.height >= 0.18 else {
            return nil
        }
        let minX = max(0, Int(activeBounds.left * Double(width)))
        let maxX = min(width - 1, Int(ceil(activeBounds.right * Double(width))))
        let minY = max(0, Int((activeBounds.top + activeBounds.height * 0.12) * Double(height)))
        let maxY = min(height - 1, Int(ceil((activeBounds.top + activeBounds.height * 0.78) * Double(height))))
        var candidates: [NativeRigFeatureCandidate] = []
        var foregroundSamples = 0
        var darkSamples = 0
        for y in stride(from: minY, through: maxY, by: sampleStep) {
            for x in stride(from: minX, through: maxX, by: sampleStep) {
                let offset = (y * width + x) * 4
                if pixels[offset + 3] <= 16 {
                    continue
                }
                foregroundSamples += 1
                let red = Double(pixels[offset])
                let green = Double(pixels[offset + 1])
                let blue = Double(pixels[offset + 2])
                let luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue
                let saturation = rgbSaturation(red: red, green: green, blue: blue)
                let darkStroke = luma <= 112
                let saturatedStroke = saturation >= 0.36 && luma <= 154
                if !darkStroke && !saturatedStroke {
                    continue
                }
                darkSamples += 1
                candidates.append(
                    NativeRigFeatureCandidate(
                        x: clamp01((Double(x) + Double(sampleStep) / 2) / Double(width)),
                        y: clamp01((Double(y) + Double(sampleStep) / 2) / Double(height)),
                        weight: clamp01((255 - luma) / 255 + saturation * 0.18)
                    )
                )
            }
        }
        guard foregroundSamples > 0, candidates.count >= 8, Double(darkSamples) / Double(foregroundSamples) <= 0.42 else {
            return nil
        }
        guard let eyeLine = findFeatureLine(
            candidates: candidates,
            minY: activeBounds.top + activeBounds.height * 0.16,
            maxY: activeBounds.top + activeBounds.height * 0.52,
            imageHeight: height,
            sampleStep: sampleStep
        ) else {
            return nil
        }
        guard let mouthLine = findFeatureLine(
            candidates: candidates,
            minY: max(activeBounds.top + activeBounds.height * 0.36, eyeLine.y + max(0.08, activeBounds.height * 0.12)),
            maxY: activeBounds.top + activeBounds.height * 0.76,
            imageHeight: height,
            sampleStep: sampleStep
        ) else {
            return nil
        }
        let eyeMouthGap = mouthLine.y - eyeLine.y
        guard eyeMouthGap >= 0.1, eyeMouthGap <= 0.34 else {
            return nil
        }
        let centerX = activeBounds.left + activeBounds.width / 2
        let leftEye = createFeaturePoint(candidates: eyeLine.candidates.filter { $0.x <= centerX })
        let rightEye = createFeaturePoint(candidates: eyeLine.candidates.filter { $0.x > centerX })
        guard let mouthCenter = createFeaturePoint(candidates: mouthLine.candidates), leftEye != nil || rightEye != nil else {
            return nil
        }
        let eyePairSpread: Double
        if let leftEye, let rightEye {
            eyePairSpread = clamp01((rightEye.x - leftEye.x) / max(activeBounds.width * 0.28, Double.leastNonzeroMagnitude))
        } else {
            eyePairSpread = 0.45
        }
        let lineStrength = clamp01((eyeLine.weight + mouthLine.weight) / max(Double(candidates.count) * 0.34, 1))
        let confidence = clamp01(0.56 + lineStrength * 0.24 + eyePairSpread * 0.12 + clamp01(eyeMouthGap / 0.2) * 0.08)
        return [
            "confidence": confidence,
            "faceCenter": NativeRigPoint(
                x: mouthCenter.x,
                y: clamp(eyeLine.y + eyeMouthGap * 0.44, minValue: activeBounds.top + 0.08, maxValue: activeBounds.bottom - 0.08),
                confidence: confidence
            ).dictionary(),
            "leftEye": leftEye?.withConfidence(confidence).dictionary() ?? NSNull(),
            "rightEye": rightEye?.withConfidence(confidence).dictionary() ?? NSNull(),
            "mouthCenter": mouthCenter.withConfidence(confidence).dictionary(),
            "hairLineY": clamp01(max(activeBounds.top, eyeLine.y - eyeMouthGap * 0.85)),
            "shoulderLineY": clamp01(min(activeBounds.bottom, mouthLine.y + eyeMouthGap * 1.45))
        ]
    }

    private func sanitizedAssetFileComponent(_ value: String, fallback: String) -> String {
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_"))
        let sanitized = value.unicodeScalars
            .map { allowed.contains($0) ? String($0) : "-" }
            .joined()
            .trimmingCharacters(in: CharacterSet(charactersIn: "-_"))
        return sanitized.isEmpty ? fallback : String(sanitized.prefix(48))
    }

    private func clearStillImagePicker() -> (
        resolve: RCTPromiseResolveBlock?,
        reject: RCTPromiseRejectBlock?,
        filenameHint: String,
        assetKind: SceneAssetKind
    ) {
        let pending = (
            resolve: stillImagePickerResolve,
            reject: stillImagePickerReject,
            filenameHint: stillImagePickerFilenameHint,
            assetKind: stillImagePickerAssetKind
        )
        stillImagePickerResolve = nil
        stillImagePickerReject = nil
        stillImagePickerFilenameHint = "still-image"
        stillImagePickerAssetKind = .stillImage
        return pending
    }
}

private enum LiveCasterSceneStoreError: LocalizedError {
    case appGroupUnavailable
    case sourceMissing
    case unsupportedVrmModelExtension

    var errorDescription: String? {
        switch self {
        case .appGroupUnavailable:
            return "App Group scene asset storage is unavailable"
        case .sourceMissing:
            return "Scene asset file does not exist"
        case .unsupportedVrmModelExtension:
            return "VRM model asset must be a .vrm or .glb file"
        }
    }
}

private enum SceneAssetKind {
    case stillImage
    case vrmModel

    var label: String {
        switch self {
        case .stillImage:
            return "Still-image"
        case .vrmModel:
            return "VRM model"
        }
    }

    var fallbackExtension: String {
        switch self {
        case .stillImage:
            return "png"
        case .vrmModel:
            return "vrm"
        }
    }

    var fallbackBaseName: String {
        switch self {
        case .stillImage:
            return "still-image"
        case .vrmModel:
            return "avatar"
        }
    }
}

private struct NativeRigBounds {
    let left: Double
    let right: Double
    let top: Double
    let bottom: Double
    let width: Double
    let height: Double
    let foregroundCoverage: Double
    let confidence: Double

    func dictionary() -> [String: Any] {
        [
            "left": left,
            "right": right,
            "top": top,
            "bottom": bottom,
            "width": width,
            "height": height
        ]
    }
}

private struct NativeRigFeatureCandidate {
    let x: Double
    let y: Double
    let weight: Double
}

private struct NativeRigFeatureLine {
    let y: Double
    let weight: Double
    let candidates: [NativeRigFeatureCandidate]
}

private struct NativeRigPoint {
    let x: Double
    let y: Double
    let confidence: Double

    func withConfidence(_ confidence: Double) -> NativeRigPoint {
        NativeRigPoint(x: x, y: y, confidence: confidence)
    }

    func dictionary() -> [String: Any] {
        [
            "x": x,
            "y": y,
            "confidence": confidence
        ]
    }
}

private final class NativeRigFeatureRow {
    var y = 0.0
    var weight = 0.0
    var count = 0
}

private func findFeatureLine(
    candidates: [NativeRigFeatureCandidate],
    minY: Double,
    maxY: Double,
    imageHeight: Int,
    sampleStep: Int
) -> NativeRigFeatureLine? {
    var rows: [Int: NativeRigFeatureRow] = [:]
    for candidate in candidates where candidate.y >= minY && candidate.y <= maxY {
        let rowKey = Int((candidate.y * Double(imageHeight)) / Double(max(1, sampleStep)))
        let row = rows[rowKey] ?? NativeRigFeatureRow()
        row.y = (row.y * Double(row.count) + candidate.y) / Double(row.count + 1)
        row.weight += candidate.weight
        row.count += 1
        rows[rowKey] = row
    }
    guard let peak = rows.values.max(by: { $0.weight < $1.weight }) else {
        return nil
    }
    let searchedRowCount = max(1, Int(ceil(((maxY - minY) * Double(imageHeight)) / Double(max(1, sampleStep)))))
    let averageWeight = rows.values.reduce(0) { $0 + $1.weight } / Double(searchedRowCount)
    guard peak.count >= 2, peak.weight >= averageWeight * 1.45 else {
        return nil
    }
    let band = max(0.012, (Double(sampleStep) / Double(max(imageHeight, 1))) * 2.5)
    let lineCandidates = candidates.filter { abs($0.y - peak.y) <= band }
    let lineWeight = lineCandidates.reduce(0) { $0 + $1.weight }
    guard lineCandidates.count >= 2, lineWeight > 0 else {
        return nil
    }
    return NativeRigFeatureLine(
        y: lineCandidates.reduce(0) { $0 + $1.y * $1.weight } / lineWeight,
        weight: lineWeight,
        candidates: lineCandidates
    )
}

private func createFeaturePoint(candidates: [NativeRigFeatureCandidate]) -> NativeRigPoint? {
    let weight = candidates.reduce(0) { $0 + $1.weight }
    guard !candidates.isEmpty, weight > 0 else {
        return nil
    }
    return NativeRigPoint(
        x: clamp01(candidates.reduce(0) { $0 + $1.x * $1.weight } / weight),
        y: clamp01(candidates.reduce(0) { $0 + $1.y * $1.weight } / weight),
        confidence: clamp01(0.55 + min(0.4, weight / 18))
    )
}

private func rgbSaturation(red: Double, green: Double, blue: Double) -> Double {
    let maxValue = max(red, max(green, blue))
    let minValue = min(red, min(green, blue))
    return maxValue <= 0 ? 0 : clamp01((maxValue - minValue) / maxValue)
}

private func clamp01(_ value: Double) -> Double {
    clamp(value, minValue: 0, maxValue: 1)
}

private func clamp(_ value: Double, minValue: Double, maxValue: Double) -> Double {
    max(minValue, min(maxValue, value))
}
