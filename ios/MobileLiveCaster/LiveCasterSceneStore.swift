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
