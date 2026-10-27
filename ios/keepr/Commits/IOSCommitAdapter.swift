//
//  IOSCommitAdapter.swift
//  keepr
//

import Foundation
import Photos

public class IOSCommitAdapter: NSObject {
    public static let shared = IOSCommitAdapter()
    
    private var activeBatchContext: BatchContext?
    private let contextLock = NSLock()
    
    override public init() {
        super.init()
    }
    
    // MARK: - Internal Types
    
    private class BatchContext {
        private var isCancelled: Bool = false
        private let lock = NSLock()
        
        func cancel() {
            lock.lock()
            isCancelled = true
            lock.unlock()
        }
        
        var cancelled: Bool {
            lock.lock()
            defer { lock.unlock() }
            return isCancelled
        }
    }
    
    private class BatchState {
        var results: [[String: Any]?]
        var succeeded: Int = 0
        var failed: Int = 0
        var denied: Int = 0
        var totalReclaimedBytes: Int64 = 0
        
        init(totalCount: Int) {
            results = Array(repeating: nil, count: totalCount)
        }
    }
    
    private struct DeleteCandidate {
        let index: Int
        let mediaId: String
        let asset: PHAsset
        let size: Int64
    }
    
    private struct ReplaceCandidate {
        let index: Int
        let mediaId: String
        let asset: PHAsset
        let candidateDict: [String: Any]
        let stagedPath: String
        let stagedURL: URL
        let measuredSavings: Int64
        let isVideo: Bool
    }
    
    // MARK: - Cancellation
    
    public func cancelActiveBatch() {
        contextLock.lock()
        activeBatchContext?.cancel()
        contextLock.unlock()
    }
    
    // MARK: - Recovery Semantics
    
    public func canTrash() -> Bool {
        // iOS PhotoKit does not provide MediaStore-style programmatic trash/recovery.
        // Deletions are handled by iOS PhotoKit and placed into the system "Recently Deleted" album,
        // with recovery managed entirely by iOS and user device settings.
        return false
    }
    
    public func getPlatformRecoveryDescription() -> String {
        return "Deleted items are removed through iOS PhotoKit and placed in the system 'Recently Deleted' album, with recovery managed by iOS and your device settings."
    }
    
    // MARK: - Batch Commit
    
    public func commitBatch(
        items: [[String: Any]],
        completion: @escaping ([String: Any]) -> Void
    ) {
        let context = BatchContext()
        contextLock.lock()
        activeBatchContext = context
        contextLock.unlock()
        
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            
            let state = BatchState(totalCount: items.count)
            var deleteCandidates: [DeleteCandidate] = []
            var replaceCandidates: [ReplaceCandidate] = []
            
            let authStatus = PHPhotoLibrary.authorizationStatus(for: .readWrite)
            
            // Phase 1: Pre-validation, protection checks, and candidate staging verification
            for (index, itemDict) in items.enumerated() {
                let mediaId = itemDict["mediaId"] as? String ?? ""
                let decision = itemDict["decision"] as? String ?? "KEEP"
                let isProtected = itemDict["isProtected"] as? Bool ?? false
                let candidateDict = itemDict["candidate"] as? [String: Any]
                
                // Safety: protected items must never be deleted or replaced
                if isProtected && (decision == "DELETE" || decision == "COMPRESS") {
                    state.results[index] = [
                        "mediaId": mediaId,
                        "decision": decision,
                        "outcome": "SKIPPED",
                        "reclaimedBytes": Int64(0),
                        "error": "Item is marked as protected by Keepr local protection.",
                        "isPlatformTrash": false
                    ]
                    state.denied += 1
                    continue
                }
                
                switch decision {
                case "KEEP":
                    state.results[index] = [
                        "mediaId": mediaId,
                        "decision": decision,
                        "outcome": "KEPT",
                        "reclaimedBytes": Int64(0),
                        "isPlatformTrash": false
                    ]
                    state.succeeded += 1
                    
                case "DELETE":
                    if authStatus == .denied || authStatus == .restricted {
                        state.results[index] = [
                            "mediaId": mediaId,
                            "decision": "DELETE",
                            "outcome": "DENIED",
                            "reclaimedBytes": Int64(0),
                            "error": authStatus == .restricted ?
                                "Photo library access is restricted by device policy." :
                                "Photo library access was denied by user.",
                            "isPlatformTrash": false
                        ]
                        state.denied += 1
                        continue
                    }
                    
                    let assets = PHAsset.fetchAssets(withLocalIdentifiers: [mediaId], options: nil)
                    guard let asset = assets.firstObject else {
                        if authStatus == .limited {
                            state.results[index] = [
                                "mediaId": mediaId,
                                "decision": "DELETE",
                                "outcome": "DENIED",
                                "reclaimedBytes": Int64(0),
                                "error": "Asset not accessible under iOS Limited Photos access. Only user-selected assets can be modified.",
                                "isPlatformTrash": false
                            ]
                            state.denied += 1
                        } else {
                            state.results[index] = [
                                "mediaId": mediaId,
                                "decision": "DELETE",
                                "outcome": "FAILED",
                                "reclaimedBytes": Int64(0),
                                "error": "Asset not found in PhotoKit library.",
                                "isPlatformTrash": false
                            ]
                            state.failed += 1
                        }
                        continue
                    }
                    
                    let resources = PHAssetResource.assetResources(for: asset)
                    var originalSize: Int64 = 0
                    if let firstRes = resources.first, let size = firstRes.value(forKey: "fileSize") as? NSNumber {
                        originalSize = size.int64Value
                    }
                    
                    deleteCandidates.append(DeleteCandidate(
                        index: index,
                        mediaId: mediaId,
                        asset: asset,
                        size: originalSize
                    ))
                    
                case "COMPRESS":
                    guard let candidate = candidateDict else {
                        state.results[index] = [
                            "mediaId": mediaId,
                            "decision": decision,
                            "outcome": "FAILED",
                            "reclaimedBytes": Int64(0),
                            "error": "Missing compression candidate for replacement.",
                            "isPlatformTrash": false
                        ]
                        state.failed += 1
                        continue
                    }
                    
                    guard let stagedPath = candidate["stagedPath"] as? String else {
                        state.results[index] = [
                            "mediaId": mediaId,
                            "decision": decision,
                            "outcome": "FAILED",
                            "reclaimedBytes": Int64(0),
                            "error": "Staged candidate path missing.",
                            "isPlatformTrash": false
                        ]
                        state.failed += 1
                        continue
                    }
                    
                    // Safety: verify staged candidate file exists before touching PhotoKit
                    let stagedURL = URL(fileURLWithPath: stagedPath)
                    guard FileManager.default.fileExists(atPath: stagedURL.path) else {
                        state.results[index] = [
                            "mediaId": mediaId,
                            "decision": decision,
                            "outcome": "FAILED",
                            "reclaimedBytes": Int64(0),
                            "error": "Staged candidate file does not exist at path: \(stagedPath)",
                            "isPlatformTrash": false
                        ]
                        state.failed += 1
                        continue
                    }
                    
                    if authStatus == .denied || authStatus == .restricted {
                        state.results[index] = [
                            "mediaId": mediaId,
                            "decision": "COMPRESS",
                            "outcome": "DENIED",
                            "reclaimedBytes": Int64(0),
                            "error": authStatus == .restricted ?
                                "Photo library access is restricted by device policy." :
                                "Photo library access was denied by user.",
                            "isPlatformTrash": false
                        ]
                        state.denied += 1
                        continue
                    }
                    
                    let assets = PHAsset.fetchAssets(withLocalIdentifiers: [mediaId], options: nil)
                    guard let asset = assets.firstObject else {
                        if authStatus == .limited {
                            state.results[index] = [
                                "mediaId": mediaId,
                                "decision": "COMPRESS",
                                "outcome": "DENIED",
                                "reclaimedBytes": Int64(0),
                                "error": "Asset not accessible under iOS Limited Photos access. Only user-selected assets can be modified.",
                                "isPlatformTrash": false
                            ]
                            state.denied += 1
                        } else {
                            state.results[index] = [
                                "mediaId": mediaId,
                                "decision": "COMPRESS",
                                "outcome": "FAILED",
                                "reclaimedBytes": Int64(0),
                                "error": "Original asset not found in PhotoKit library.",
                                "isPlatformTrash": false
                            ]
                            state.failed += 1
                        }
                        // Staged candidate is safely preserved for retry
                        continue
                    }
                    
                    let measuredSavings = (candidate["measuredSavingsBytes"] as? NSNumber)?.int64Value ?? 0
                    let isVideo = asset.mediaType == .video
                    
                    replaceCandidates.append(ReplaceCandidate(
                        index: index,
                        mediaId: mediaId,
                        asset: asset,
                        candidateDict: candidate,
                        stagedPath: stagedPath,
                        stagedURL: stagedURL,
                        measuredSavings: measuredSavings,
                        isVideo: isVideo
                    ))
                    
                default:
                    state.results[index] = [
                        "mediaId": mediaId,
                        "decision": decision,
                        "outcome": "SKIPPED",
                        "reclaimedBytes": Int64(0),
                        "error": "Unknown triage decision: \(decision)",
                        "isPlatformTrash": false
                    ]
                    state.failed += 1
                }
            }
            
            let finalizeSummary: () -> Void = {
                var finalResults: [[String: Any]] = []
                for res in state.results {
                    if let r = res {
                        finalResults.append(r)
                    } else {
                        finalResults.append([
                            "mediaId": "",
                            "decision": "UNKNOWN",
                            "outcome": "SKIPPED",
                            "reclaimedBytes": Int64(0),
                            "error": "Operation was cancelled before execution.",
                            "isPlatformTrash": false
                        ])
                    }
                }
                
                let summary: [String: Any] = [
                    "totalRequested": items.count,
                    "succeeded": state.succeeded,
                    "failed": state.failed,
                    "denied": state.denied,
                    "totalReclaimedBytes": state.totalReclaimedBytes,
                    "results": finalResults
                ]
                
                completion(summary)
            }
            
            // Check cancellation before dispatching PhotoKit changes
            if context.cancelled {
                for cand in deleteCandidates {
                    state.results[cand.index] = [
                        "mediaId": cand.mediaId,
                        "decision": "DELETE",
                        "outcome": "SKIPPED",
                        "reclaimedBytes": Int64(0),
                        "error": "Commit batch cancelled before deletion.",
                        "isPlatformTrash": false
                    ]
                    state.denied += 1
                }
                for cand in replaceCandidates {
                    state.results[cand.index] = [
                        "mediaId": cand.mediaId,
                        "decision": "COMPRESS",
                        "outcome": "SKIPPED",
                        "reclaimedBytes": Int64(0),
                        "error": "Commit batch cancelled before replacement.",
                        "isPlatformTrash": false
                    ]
                    state.denied += 1
                }
                finalizeSummary()
                return
            }
            
            // Phase 2: Batch Deletion (nonblocking)
            let executeReplacements: () -> Void = {
                self.chainReplacements(
                    candidates: replaceCandidates,
                    index: 0,
                    context: context,
                    state: state,
                    completion: finalizeSummary
                )
            }
            
            if deleteCandidates.isEmpty {
                executeReplacements()
            } else {
                let assetsToDelete = deleteCandidates.map { $0.asset }
                
                PHPhotoLibrary.shared().performChanges({
                    PHAssetChangeRequest.deleteAssets(assetsToDelete as NSArray)
                }) { success, error in
                    DispatchQueue.global(qos: .userInitiated).async {
                        if success {
                            for cand in deleteCandidates {
                                state.results[cand.index] = [
                                    "mediaId": cand.mediaId,
                                    "decision": "DELETE",
                                    "outcome": "RECENTLY_DELETED",
                                    "reclaimedBytes": cand.size,
                                    "isPlatformTrash": false
                                ]
                                state.succeeded += 1
                                state.totalReclaimedBytes += cand.size
                            }
                        } else {
                            let isDenied: Bool
                            let errorMessage: String
                            if let nsError = error as NSError? {
                                if nsError.domain == PHPhotosErrorDomain && (nsError.code == 3072 || nsError.code == -1) {
                                    isDenied = true
                                    errorMessage = "User denied deletion consent."
                                } else {
                                    isDenied = false
                                    errorMessage = nsError.localizedDescription
                                }
                            } else {
                                isDenied = false
                                errorMessage = "Unknown error during deletion."
                            }
                            
                            for cand in deleteCandidates {
                                state.results[cand.index] = [
                                    "mediaId": cand.mediaId,
                                    "decision": "DELETE",
                                    "outcome": isDenied ? "DENIED" : "FAILED",
                                    "reclaimedBytes": Int64(0),
                                    "error": errorMessage,
                                    "isPlatformTrash": false
                                ]
                                if isDenied {
                                    state.denied += 1
                                } else {
                                    state.failed += 1
                                }
                            }
                        }
                        
                        // Proceed to replacements
                        executeReplacements()
                    }
                }
            }
        }
    }
    
    // MARK: - Asynchronous Replacement Chaining (Nonblocking)
    
    private func chainReplacements(
        candidates: [ReplaceCandidate],
        index: Int,
        context: BatchContext,
        state: BatchState,
        completion: @escaping () -> Void
    ) {
        guard index < candidates.count else {
            completion()
            return
        }
        
        // Handle cancellation without aborting an in-flight PhotoKit operation
        if context.cancelled {
            for i in index..<candidates.count {
                let cand = candidates[i]
                state.results[cand.index] = [
                    "mediaId": cand.mediaId,
                    "decision": "COMPRESS",
                    "outcome": "SKIPPED",
                    "reclaimedBytes": Int64(0),
                    "error": "Commit batch cancelled before replacement.",
                    "isPlatformTrash": false
                ]
                state.denied += 1
            }
            completion()
            return
        }
        
        let cand = candidates[index]
        
        // Nonblocking PhotoKit atomic creation + deletion
        // 1. Publish replacement asset using PHAssetCreationRequest.forAsset()
        // 2. Request deletion of original asset within the same atomic change block
        PHPhotoLibrary.shared().performChanges({
            let creationRequest = PHAssetCreationRequest.forAsset()
            let resourceType: PHAssetResourceType = cand.isVideo ? .video : .photo
            creationRequest.addResource(with: resourceType, fileURL: cand.stagedURL, options: nil)
            PHAssetChangeRequest.deleteAssets([cand.asset] as NSArray)
        }) { success, error in
            DispatchQueue.global(qos: .userInitiated).async { [weak self] in
                guard let self = self else { return }
                
                if success {
                    state.results[cand.index] = [
                        "mediaId": cand.mediaId,
                        "decision": "COMPRESS",
                        "outcome": "REPLACED",
                        "reclaimedBytes": cand.measuredSavings,
                        "isPlatformTrash": false
                    ]
                    state.succeeded += 1
                    state.totalReclaimedBytes += cand.measuredSavings
                    
                    // Safe cleanup of staged file once published to library
                    try? IOSCompressor.shared.cleanupStaged(stagedPath: cand.stagedPath)
                } else {
                    let isDenied: Bool
                    let errorMessage: String
                    if let nsError = error as NSError? {
                        if nsError.domain == PHPhotosErrorDomain && (nsError.code == 3072 || nsError.code == -1) {
                            isDenied = true
                            errorMessage = "User denied replacement consent."
                        } else {
                            isDenied = false
                            errorMessage = nsError.localizedDescription
                        }
                    } else {
                        isDenied = false
                        errorMessage = "Unknown error during replacement."
                    }
                    
                    state.results[cand.index] = [
                        "mediaId": cand.mediaId,
                        "decision": "COMPRESS",
                        "outcome": isDenied ? "DENIED" : "FAILED",
                        "reclaimedBytes": Int64(0),
                        "error": errorMessage,
                        "isPlatformTrash": false
                    ]
                    if isDenied {
                        state.denied += 1
                    } else {
                        state.failed += 1
                    }
                    // CRITICAL SAFETY: If creation fails or user cancels, PRESERVE staged candidate
                    // output for retry; the original asset remains untouched by PhotoKit rollback.
                }
                
                // Chain to next replacement asynchronously without blocking any thread
                self.chainReplacements(
                    candidates: candidates,
                    index: index + 1,
                    context: context,
                    state: state,
                    completion: completion
                )
            }
        }
    }
    
    // MARK: - Individual Operations (Nonblocking Convenience)
    
    public func performDelete(
        mediaId: String,
        completion: @escaping ([String: Any]) -> Void
    ) {
        commitBatch(items: [["mediaId": mediaId, "decision": "DELETE"]]) { summary in
            if let results = summary["results"] as? [[String: Any]], let first = results.first {
                completion(first)
            } else {
                completion([
                    "mediaId": mediaId,
                    "decision": "DELETE",
                    "outcome": "FAILED",
                    "reclaimedBytes": Int64(0),
                    "error": "Failed to retrieve deletion result.",
                    "isPlatformTrash": false
                ])
            }
        }
    }
    
    public func performReplace(
        mediaId: String,
        candidate: [String: Any],
        completion: @escaping ([String: Any]) -> Void
    ) {
        commitBatch(items: [["mediaId": mediaId, "decision": "COMPRESS", "candidate": candidate]]) { summary in
            if let results = summary["results"] as? [[String: Any]], let first = results.first {
                completion(first)
            } else {
                completion([
                    "mediaId": mediaId,
                    "decision": "COMPRESS",
                    "outcome": "FAILED",
                    "reclaimedBytes": Int64(0),
                    "error": "Failed to retrieve replacement result.",
                    "isPlatformTrash": false
                ])
            }
        }
    }
}
