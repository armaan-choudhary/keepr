//
//  KeeprCompressorModule.swift
//  keepr
//

import Foundation
import React

@objc(KeeprCompressorModule)
public class KeeprCompressorModule: RCTEventEmitter {
    
    private var hasListeners = false
    
    override public static func requiresMainQueueSetup() -> Bool {
        return false
    }
    
    override public func supportedEvents() -> [String]! {
        return ["onCompressionProgress"]
    }
    
    override public func startObserving() {
        hasListeners = true
    }
    
    override public func stopObserving() {
        hasListeners = false
    }
    
    @objc(compressImage:options:resolver:rejecter:)
    public func compressImage(
        item: [String: Any],
        options: [String: Any],
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let assetId = item["id"] as? String ?? item["assetRef"] as? String else {
            reject("INVALID_ARGUMENT", "Missing media item id or assetRef.", nil)
            return
        }
        
        IOSCompressor.shared.compressImage(assetId: assetId, options: options) { result in
            switch result {
            case .success(let candidate):
                resolve(candidate)
            case .failure(let error):
                if let compError = error as? CompressorError {
                    switch compError {
                    case .requiresNetwork(let msg):
                        reject("REQUIRES_NETWORK", msg, error)
                    case .assetNotFound(let msg):
                        reject("ASSET_NOT_FOUND", msg, error)
                    default:
                        reject("COMPRESSION_FAILED", compError.localizedDescription, error)
                    }
                } else {
                    reject("COMPRESSION_FAILED", error.localizedDescription, error)
                }
            }
        }
    }
    
    @objc(compressVideo:options:resolver:rejecter:)
    public func compressVideo(
        item: [String: Any],
        options: [String: Any],
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let assetId = item["id"] as? String ?? item["assetRef"] as? String else {
            reject("INVALID_ARGUMENT", "Missing media item id or assetRef.", nil)
            return
        }
        
        IOSCompressor.shared.compressVideo(
            assetId: assetId,
            options: options,
            onProgress: { [weak self] progress in
                guard let self = self, self.hasListeners else { return }
                self.sendEvent(withName: "onCompressionProgress", body: [
                    "originalId": assetId,
                    "progress": progress
                ])
            },
            completion: { result in
                switch result {
                case .success(let candidate):
                    resolve(candidate)
                case .failure(let error):
                    if let compError = error as? CompressorError {
                        switch compError {
                        case .requiresNetwork(let msg):
                            reject("REQUIRES_NETWORK", msg, error)
                        case .cancelled(let msg):
                            reject("COMPRESSION_CANCELLED", msg, error)
                        case .assetNotFound(let msg):
                            reject("ASSET_NOT_FOUND", msg, error)
                        default:
                            reject("COMPRESSION_FAILED", compError.localizedDescription, error)
                        }
                    } else {
                        reject("COMPRESSION_FAILED", error.localizedDescription, error)
                    }
                }
            }
        )
    }
    
    @objc(cancel:resolver:rejecter:)
    public func cancel(
        candidateId: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        IOSCompressor.shared.cancel(candidateId: candidateId)
        resolve(nil)
    }
    
    @objc(cleanupStaged:resolver:rejecter:)
    public func cleanupStaged(
        stagedPath: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        do {
            try IOSCompressor.shared.cleanupStaged(stagedPath: stagedPath)
            resolve(nil)
        } catch {
            reject("CLEANUP_FAILED", error.localizedDescription, error)
        }
    }
}
