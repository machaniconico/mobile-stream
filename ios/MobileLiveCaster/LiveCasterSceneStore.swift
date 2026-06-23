import Foundation
import React

private let liveCasterSceneAppGroup = "group.com.mobilelivecaster.app"

@objc(LiveCasterSceneStore)
final class LiveCasterSceneStore: NSObject {
    private let fileName = "mobile-live-caster-scene.json"
    private let sessionSummariesFileName = "mobile-live-caster-session-summaries.json"
    private let validationRunsFileName = "mobile-live-caster-validation-runs.json"
    private let sceneAssetsDirectoryName = "scene-assets"

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

        guard let sourceURL = stillImageSourceURL(trimmedURI) else {
            reject("scene_asset_unsupported_uri", "Still-image asset must be a file URL or absolute path on iOS", nil)
            return
        }

        guard let destinationDirectory = sceneAssetsURL() else {
            reject("scene_asset_store_unavailable", "App Group scene asset storage is unavailable", nil)
            return
        }

        let accessGranted = sourceURL.startAccessingSecurityScopedResource()
        defer {
            if accessGranted {
                sourceURL.stopAccessingSecurityScopedResource()
            }
        }

        guard FileManager.default.fileExists(atPath: sourceURL.path) else {
            reject("scene_asset_source_missing", "Still-image asset file does not exist", nil)
            return
        }

        do {
            try FileManager.default.createDirectory(at: destinationDirectory, withIntermediateDirectories: true)
            let destinationURL = destinationDirectory.appendingPathComponent(
                stillImageDestinationFileName(sourceURL: sourceURL, filenameHint: filenameHint)
            )
            if FileManager.default.fileExists(atPath: destinationURL.path) {
                try FileManager.default.removeItem(at: destinationURL)
            }
            try FileManager.default.copyItem(at: sourceURL, to: destinationURL)
            resolve(destinationURL.absoluteString)
        } catch {
            reject("scene_asset_copy_failed", "Still-image asset copy failed", error)
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

    private func stillImageSourceURL(_ rawURI: String) -> URL? {
        if let url = URL(string: rawURI), url.isFileURL {
            return url
        }
        if rawURI.hasPrefix("/") {
            return URL(fileURLWithPath: rawURI)
        }
        return nil
    }

    private func stillImageDestinationFileName(sourceURL: URL, filenameHint: String) -> String {
        let sourceExtension = sourceURL.pathExtension.trimmingCharacters(in: .whitespacesAndNewlines)
        let hintExtension = URL(fileURLWithPath: filenameHint).pathExtension.trimmingCharacters(in: .whitespacesAndNewlines)
        let candidateExtension = sourceExtension.isEmpty ? hintExtension : sourceExtension
        let fileExtension = candidateExtension.isEmpty ? "png" : candidateExtension
        let sourceBaseName = sourceURL.deletingPathExtension().lastPathComponent
        let hintBaseName = URL(fileURLWithPath: filenameHint).deletingPathExtension().lastPathComponent
        let safeBaseName = sanitizedAssetFileComponent(sourceBaseName.isEmpty ? hintBaseName : sourceBaseName)
        return "\(safeBaseName)-\(UUID().uuidString).\(fileExtension.lowercased())"
    }

    private func sanitizedAssetFileComponent(_ value: String) -> String {
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_"))
        let sanitized = value.unicodeScalars
            .map { allowed.contains($0) ? String($0) : "-" }
            .joined()
            .trimmingCharacters(in: CharacterSet(charactersIn: "-_"))
        return sanitized.isEmpty ? "still-image" : String(sanitized.prefix(48))
    }
}
