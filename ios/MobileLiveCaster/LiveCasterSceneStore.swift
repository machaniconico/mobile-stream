import Foundation
import React

@objc(LiveCasterSceneStore)
final class LiveCasterSceneStore: NSObject {
    private let fileName = "mobile-live-caster-scene.json"

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

    private func sceneURL() -> URL? {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?.appendingPathComponent(fileName)
    }
}
