//
//  IOSCompressor.swift
//  keepr
//

import Foundation
import Photos
import AVFoundation
import ImageIO
import MobileCoreServices
import UniformTypeIdentifiers

public enum CompressorError: LocalizedError {
    case assetNotFound(String)
    case requiresNetwork(String)
    case unsupportedFormat(String)
    case compressionFailed(String)
    case cancelled(String)
    case validationFailed(String)
    
    public var errorDescription: String? {
        switch self {
        case .assetNotFound(let msg):
            return "Asset not found: \(msg)"
        case .requiresNetwork(let msg):
            return "Strict offline policy: \(msg)"
        case .unsupportedFormat(let msg):
            return "Unsupported format: \(msg)"
        case .compressionFailed(let msg):
            return "Compression failed: \(msg)"
        case .cancelled(let msg):
            return "Operation cancelled: \(msg)"
        case .validationFailed(let msg):
            return "Validation failed: \(msg)"
        }
    }
}

public class IOSCompressor: NSObject {
    public static let shared = IOSCompressor()
    
    private let stagingDirectoryName = "keepr_staging"
    private var activeVideoSessions: [String: AVAssetExportSession] = [:]
    private var activeProgressTimers: [String: Timer] = [:]
    private let lock = NSLock()
    
    override public init() {
        super.init()
        ensureStagingDirectoryExists()
    }
    
    // MARK: - Staging Directory
    
    public var stagingURL: URL {
        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let stagingDir = appSupport.appendingPathComponent(stagingDirectoryName, isDirectory: true)
        return stagingDir
    }
    
    private func ensureStagingDirectoryExists() {
        let url = stagingURL
        if !FileManager.default.fileExists(atPath: url.path) {
            try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true, attributes: nil)
            var resourceValues = URLResourceValues()
            resourceValues.isExcludedFromBackup = true
            var mutableURL = url
            try? mutableURL.setResourceValues(resourceValues)
        }
    }
    
    // MARK: - Dimension Calculation
    
    public static func calculateDimensions(width: Int, height: Int, maxDimension: Int = 2560) -> (width: Int, height: Int) {
        guard width > 0 && height > 0 else { return (width, height) }
        let maxSide = max(width, height)
        if maxSide <= maxDimension {
            return (width, height)
        }
        let scale = Double(maxDimension) / Double(maxSide)
        let targetWidth = max(1, Int((Double(width) * scale).rounded()))
        let targetHeight = max(1, Int((Double(height) * scale).rounded()))
        return (targetWidth, targetHeight)
    }
    
    // MARK: - Image Compression
    
    public func compressImage(
        assetId: String,
        options: [String: Any],
        completion: @escaping (Result<[String: Any], Error>) -> Void
    ) {
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let candidate = try self.performImageCompression(assetId: assetId, options: options)
                completion(.success(candidate))
            } catch {
                completion(.failure(error))
            }
        }
    }
    
    private func performImageCompression(assetId: String, options: [String: Any]) throws -> [String: Any] {
        let assets = PHAsset.fetchAssets(withLocalIdentifiers: [assetId], options: nil)
        guard let asset = assets.firstObject else {
            throw CompressorError.assetNotFound("No PHAsset found with identifier '\(assetId)'.")
        }
        
        let resources = PHAssetResource.assetResources(for: asset)
        guard let primaryResource = resources.first(where: { $0.type == .photo }) ?? resources.first else {
            throw CompressorError.assetNotFound("No photo resource found for asset '\(assetId)'.")
        }
        
        var originalSizeBytes: Int64 = 0
        if let fileSize = primaryResource.value(forKey: "fileSize") as? NSNumber {
            originalSizeBytes = fileSize.int64Value
        }
        
        // Strict offline: disallow network access
        let imageOptions = PHImageRequestOptions()
        imageOptions.isNetworkAccessAllowed = false
        imageOptions.isSynchronous = true
        imageOptions.deliveryMode = .highQualityFormat
        
        var rawData: Data?
        var isInCloud = false
        var fetchError: Error?
        
        PHImageManager.default().requestImageDataAndOrientation(for: asset, options: imageOptions) { data, uti, orientation, info in
            if let inCloud = info?[PHImageResultIsInCloudKey] as? Bool, inCloud {
                isInCloud = true
            } else if let data = data {
                rawData = data
            } else if let error = info?[PHImageErrorKey] as? NSError {
                fetchError = error
                if error.domain == PHPhotosErrorDomain && (error.code == 3164 || error.code == 3169) {
                    isInCloud = true
                }
            }
        }
        
        if isInCloud {
            throw CompressorError.requiresNetwork("Asset '\(assetId)' is stored in iCloud and unavailable offline.")
        }
        
        guard let sourceData = rawData else {
            throw CompressorError.compressionFailed("Could not read image data for asset '\(assetId)': \(fetchError?.localizedDescription ?? "unknown error")")
        }
        
        if originalSizeBytes == 0 {
            originalSizeBytes = Int64(sourceData.count)
        }
        
        guard let imageSource = CGImageSourceCreateWithData(sourceData as CFData, nil) else {
            throw CompressorError.compressionFailed("Unable to create CGImageSource from asset data.")
        }
        
        // Read existing EXIF, GPS, and TIFF metadata
        let sourceProperties = (CGImageSourceCopyPropertiesAtIndex(imageSource, 0, nil) as? [CFString: Any]) ?? [:]
        
        let maxDimension = options["maxDimension"] as? Int ?? 2560
        let quality = options["quality"] as? Double ?? 0.8
        let requestedFormat = options["format"] as? String ?? "AUTO"
        
        let originalWidth = asset.pixelWidth > 0 ? asset.pixelWidth : (sourceProperties[kCGImagePropertyPixelWidth] as? Int ?? 0)
        let originalHeight = asset.pixelHeight > 0 ? asset.pixelHeight : (sourceProperties[kCGImagePropertyPixelHeight] as? Int ?? 0)
        
        let targetDimensions = IOSCompressor.calculateDimensions(width: originalWidth, height: originalHeight, maxDimension: maxDimension)
        
        // Create downscaled thumbnail respecting orientation and preserving aspect ratio
        let thumbnailOptions: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceThumbnailMaxPixelSize: max(targetDimensions.width, targetDimensions.height),
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCache: false
        ]
        
        guard let thumbnail = CGImageSourceCreateThumbnailAtIndex(imageSource, 0, thumbnailOptions as CFDictionary) else {
            throw CompressorError.compressionFailed("Failed to create scaled thumbnail for asset '\(assetId)'.")
        }
        
        // Prepare output metadata with EXIF and GPS preserved
        var outputProperties = sourceProperties
        outputProperties[kCGImagePropertyPixelWidth] = targetDimensions.width
        outputProperties[kCGImagePropertyPixelHeight] = targetDimensions.height
        outputProperties[kCGImagePropertyOrientation] = 1 // Normalized by thumbnail transform
        outputProperties[kCGImageDestinationLossyCompressionQuality] = quality
        
        // Determine output format and file extension
        let (outputType, fileExtension, mimeType) = resolveImageFormat(requested: requestedFormat)
        
        let candidateId = UUID().uuidString
        let stagedFilename = "keepr_comp_\(candidateId).\(fileExtension)"
        let stagedFileURL = stagingURL.appendingPathComponent(stagedFilename)
        
        guard let destination = CGImageDestinationCreateWithURL(stagedFileURL as CFURL, outputType, 1, nil) else {
            throw CompressorError.compressionFailed("Unable to create CGImageDestination for format '\(outputType)'.")
        }
        
        CGImageDestinationAddImage(destination, thumbnail, outputProperties as CFDictionary)
        
        guard CGImageDestinationFinalize(destination) else {
            throw CompressorError.compressionFailed("Failed to finalize image destination at \(stagedFileURL.path).")
        }
        
        // Validate staged candidate
        guard FileManager.default.fileExists(atPath: stagedFileURL.path) else {
            throw CompressorError.validationFailed("Staged candidate file does not exist.")
        }
        
        let fileAttributes = try FileManager.default.attributesOfItem(atPath: stagedFileURL.path)
        let stagedSizeBytes = (fileAttributes[.size] as? NSNumber)?.int64Value ?? 0
        
        guard stagedSizeBytes > 0 else {
            try? FileManager.default.removeItem(at: stagedFileURL)
            throw CompressorError.validationFailed("Staged candidate size is 0 bytes.")
        }
        
        // Verify output decodes
        guard let verifySource = CGImageSourceCreateWithURL(stagedFileURL as CFURL, nil),
              CGImageSourceGetCount(verifySource) > 0 else {
            try? FileManager.default.removeItem(at: stagedFileURL)
            throw CompressorError.validationFailed("Staged candidate failed decoding check.")
        }
        
        let measuredSavingsBytes = originalSizeBytes - stagedSizeBytes
        let isSmaller = stagedSizeBytes < originalSizeBytes
        let estimatedSavingsBytes = Int64(Double(originalSizeBytes) * 0.4)
        
        return [
            "originalId": assetId,
            "stagedPath": stagedFileURL.path,
            "stagedSizeBytes": stagedSizeBytes,
            "originalSizeBytes": originalSizeBytes,
            "estimatedSavingsBytes": estimatedSavingsBytes,
            "measuredSavingsBytes": measuredSavingsBytes,
            "width": targetDimensions.width,
            "height": targetDimensions.height,
            "mimeType": mimeType,
            "isSmaller": isSmaller,
            "isValid": isSmaller && stagedSizeBytes > 0
        ]
    }
    
    private func resolveImageFormat(requested: String) -> (outputType: CFString, ext: String, mimeType: String) {
        let supportedTypes = (CGImageDestinationCopyTypeIdentifiers() as? [String]) ?? []
        
        switch requested.uppercased() {
        case "JPEG":
            return (kUTTypeJPEG, "jpg", "image/jpeg")
        case "WEBP":
            if #available(iOS 14.0, *), supportedTypes.contains(UTType.webP.identifier) {
                return (UTType.webP.identifier as CFString, "webp", "image/webp")
            }
            // Fallback to JPEG if WebP is unsupported by destination
            return (kUTTypeJPEG, "jpg", "image/jpeg")
        case "AUTO":
            fallthrough
        default:
            // Prefer HEIC if supported on iOS device, fallback to JPEG
            if #available(iOS 11.0, *), supportedTypes.contains("public.heic") {
                return ("public.heic" as CFString, "heic", "image/heic")
            }
            return (kUTTypeJPEG, "jpg", "image/jpeg")
        }
    }
    
    // MARK: - Video Compression
    
    public func compressVideo(
        assetId: String,
        options: [String: Any],
        onProgress: @escaping (Double) -> Void,
        completion: @escaping (Result<[String: Any], Error>) -> Void
    ) {
        let candidateId = UUID().uuidString
        
        let assets = PHAsset.fetchAssets(withLocalIdentifiers: [assetId], options: nil)
        guard let asset = assets.firstObject else {
            completion(.failure(CompressorError.assetNotFound("No PHAsset found with identifier '\(assetId)'.")))
            return
        }
        
        let resources = PHAssetResource.assetResources(for: asset)
        guard let primaryResource = resources.first(where: { $0.type == .video }) ?? resources.first else {
            completion(.failure(CompressorError.assetNotFound("No video resource found for asset '\(assetId)'.")))
            return
        }
        
        var originalSizeBytes: Int64 = 0
        if let fileSize = primaryResource.value(forKey: "fileSize") as? NSNumber {
            originalSizeBytes = fileSize.int64Value
        }
        
        // Strict offline check
        let videoOptions = PHVideoRequestOptions()
        videoOptions.isNetworkAccessAllowed = false
        
        PHImageManager.default().requestAVAsset(forVideo: asset, options: videoOptions) { avAsset, audioMix, info in
            if let inCloud = info?[PHImageResultIsInCloudKey] as? Bool, inCloud {
                completion(.failure(CompressorError.requiresNetwork("Video asset '\(assetId)' is stored in iCloud and unavailable offline.")))
                return
            }
            
            if let error = info?[PHImageErrorKey] as? NSError {
                if error.domain == PHPhotosErrorDomain && (error.code == 3164 || error.code == 3169) {
                    completion(.failure(CompressorError.requiresNetwork("Video asset '\(assetId)' requires iCloud network download.")))
                    return
                }
            }
            
            guard let avAsset = avAsset else {
                completion(.failure(CompressorError.compressionFailed("Could not obtain AVAsset for video '\(assetId)'.")))
                return
            }
            
            self.exportVideoAsset(
                candidateId: candidateId,
                originalAssetId: assetId,
                avAsset: avAsset,
                originalSizeBytes: originalSizeBytes,
                options: options,
                onProgress: onProgress,
                completion: completion
            )
        }
    }
    
    private func exportVideoAsset(
        candidateId: String,
        originalAssetId: String,
        avAsset: AVAsset,
        originalSizeBytes: Int64,
        options: [String: Any],
        onProgress: @escaping (Double) -> Void,
        completion: @escaping (Result<[String: Any], Error>) -> Void
    ) {
        // Target 1080p, preserving audio track
        let preset = AVAssetExportPreset1920x1080
        guard AVAssetExportSession.exportPresets(compatibleWith: avAsset).contains(preset) else {
            // Fallback to passthrough or compatible 720p preset
            let fallbackPreset = AVAssetExportPreset1280x720
            guard AVAssetExportSession.exportPresets(compatibleWith: avAsset).contains(fallbackPreset) else {
                completion(.failure(CompressorError.compressionFailed("Device does not support 1080p or 720p export preset for this video.")))
                return
            }
            self.runExportSession(
                candidateId: candidateId,
                originalAssetId: originalAssetId,
                avAsset: avAsset,
                preset: fallbackPreset,
                originalSizeBytes: originalSizeBytes,
                onProgress: onProgress,
                completion: completion
            )
            return
        }
        
        self.runExportSession(
            candidateId: candidateId,
            originalAssetId: originalAssetId,
            avAsset: avAsset,
            preset: preset,
            originalSizeBytes: originalSizeBytes,
            onProgress: onProgress,
            completion: completion
        )
    }
    
    private func runExportSession(
        candidateId: String,
        originalAssetId: String,
        avAsset: AVAsset,
        preset: String,
        originalSizeBytes: Int64,
        onProgress: @escaping (Double) -> Void,
        completion: @escaping (Result<[String: Any], Error>) -> Void
    ) {
        guard let exportSession = AVAssetExportSession(asset: avAsset, presetName: preset) else {
            completion(.failure(CompressorError.compressionFailed("Unable to create AVAssetExportSession.")))
            return
        }
        
        let stagedFilename = "keepr_comp_\(candidateId).mp4"
        let outputURL = stagingURL.appendingPathComponent(stagedFilename)
        
        // Remove existing file if any
        try? FileManager.default.removeItem(at: outputURL)
        
        exportSession.outputURL = outputURL
        exportSession.outputFileType = .mp4
        exportSession.shouldOptimizeForNetworkUse = true
        
        lock.lock()
        activeVideoSessions[candidateId] = exportSession
        lock.unlock()
        
        // Setup progress timer on main thread
        DispatchQueue.main.async {
            let timer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] t in
                guard let self = self else { return }
                self.lock.lock()
                let session = self.activeVideoSessions[candidateId]
                self.lock.unlock()
                
                if let session = session {
                    onProgress(Double(session.progress))
                } else {
                    t.invalidate()
                }
            }
            
            self.lock.lock()
            self.activeProgressTimers[candidateId] = timer
            self.lock.unlock()
        }
        
        exportSession.exportAsynchronously { [weak self] in
            guard let self = self else { return }
            
            self.lock.lock()
            let timer = self.activeProgressTimers.removeValue(forKey: candidateId)
            self.activeVideoSessions.removeValue(forKey: candidateId)
            self.lock.unlock()
            
            DispatchQueue.main.async {
                timer?.invalidate()
            }
            
            switch exportSession.status {
            case .completed:
                onProgress(1.0)
                
                let fileAttributes = try? FileManager.default.attributesOfItem(atPath: outputURL.path)
                let stagedSizeBytes = (fileAttributes?[.size] as? NSNumber)?.int64Value ?? 0
                
                guard stagedSizeBytes > 0 else {
                    try? FileManager.default.removeItem(at: outputURL)
                    completion(.failure(CompressorError.validationFailed("Staged video size is 0 bytes.")))
                    return
                }
                
                // Playback verification
                let verifyAsset = AVURLAsset(url: outputURL)
                guard verifyAsset.isPlayable else {
                    try? FileManager.default.removeItem(at: outputURL)
                    completion(.failure(CompressorError.validationFailed("Exported video failed playability check.")))
                    return
                }
                
                let naturalSize = verifyAsset.tracks(withMediaType: .video).first?.naturalSize ?? CGSize(width: 1920, height: 1080)
                let measuredSavingsBytes = originalSizeBytes > 0 ? (originalSizeBytes - stagedSizeBytes) : 0
                let isSmaller = originalSizeBytes > 0 ? (stagedSizeBytes < originalSizeBytes) : true
                let estimatedSavingsBytes = originalSizeBytes > 0 ? Int64(Double(originalSizeBytes) * 0.45) : 0
                
                let result: [String: Any] = [
                    "originalId": originalAssetId,
                    "stagedPath": outputURL.path,
                    "stagedSizeBytes": stagedSizeBytes,
                    "originalSizeBytes": originalSizeBytes,
                    "estimatedSavingsBytes": estimatedSavingsBytes,
                    "measuredSavingsBytes": measuredSavingsBytes,
                    "width": Int(naturalSize.width),
                    "height": Int(naturalSize.height),
                    "mimeType": "video/mp4",
                    "isSmaller": isSmaller,
                    "isValid": stagedSizeBytes > 0 && isSmaller
                ]
                completion(.success(result))
                
            case .cancelled:
                try? FileManager.default.removeItem(at: outputURL)
                completion(.failure(CompressorError.cancelled("Video compression cancelled for ID '\(candidateId)'.")))
                
            case .failed:
                try? FileManager.default.removeItem(at: outputURL)
                let errorDesc = exportSession.error?.localizedDescription ?? "unknown export error"
                completion(.failure(CompressorError.compressionFailed("Video export failed: \(errorDesc)")))
                
            default:
                try? FileManager.default.removeItem(at: outputURL)
                completion(.failure(CompressorError.compressionFailed("Unexpected export session status: \(exportSession.status.rawValue)")))
            }
        }
    }
    
    // MARK: - Cancellation & Staging Cleanup
    
    public func cancel(candidateId: String) {
        lock.lock()
        defer { lock.unlock() }
        
        if let session = activeVideoSessions[candidateId] {
            session.cancelExport()
            activeVideoSessions.removeValue(forKey: candidateId)
        }
        
        if let timer = activeProgressTimers[candidateId] {
            DispatchQueue.main.async {
                timer.invalidate()
            }
            activeProgressTimers.removeValue(forKey: candidateId)
        }
    }
    
    public func cleanupStaged(stagedPath: String) throws {
        // Enforce deletion only within keepr_staging
        let pathURL = URL(fileURLWithPath: stagedPath).standardizedFileURL
        let stagingStandardized = stagingURL.standardizedFileURL
        
        guard pathURL.path.hasPrefix(stagingStandardized.path) else {
            throw CompressorError.compressionFailed("Refusing to delete file outside staging directory: \(stagedPath)")
        }
        
        if FileManager.default.fileExists(atPath: pathURL.path) {
            try FileManager.default.removeItem(at: pathURL)
        }
    }
}
