//
//  PhotoKitAdapter.swift
//  keepr
//

import Foundation
import Photos
import UIKit

public enum PhotoKitError: LocalizedError {
    case permissionDenied(String)
    case limitedAccessRestricted(String)
    case assetNotFound(String)
    case iCloudDownloadRequired(String)
    case queryFailed(String)
    
    public var errorDescription: String? {
        switch self {
        case .permissionDenied(let msg):
            return "Permission Denied: \(msg)"
        case .limitedAccessRestricted(let msg):
            return "Limited Access: \(msg)"
        case .assetNotFound(let msg):
            return "Asset Not Found: \(msg)"
        case .iCloudDownloadRequired(let msg):
            return "Offline Mode: \(msg)"
        case .queryFailed(let msg):
            return "Query Failed: \(msg)"
        }
    }
}

public class PhotoKitAdapter: NSObject {
    public static let shared = PhotoKitAdapter()
    
    override public init() {
        super.init()
    }
    
    // MARK: - Authorization
    
    public func getAuthorizationState() -> [String: Any] {
        let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        return mapAuthorizationStatus(status)
    }
    
    public func requestAuthorization(types: [String], completion: @escaping ([String: Any]) -> Void) {
        PHPhotoLibrary.requestAuthorization(for: .readWrite) { status in
            DispatchQueue.main.async {
                completion(self.mapAuthorizationStatus(status))
            }
        }
    }
    
    public func mapAuthorizationStatus(_ status: PHAuthorizationStatus) -> [String: Any] {
        let statusString: String
        let scopeString: String
        let canSelectMore: Bool
        let details: String
        
        switch status {
        case .notDetermined:
            statusString = "notDetermined"
            scopeString = "none"
            canSelectMore = false
            details = "Photo library access has not been requested yet."
        case .restricted:
            statusString = "restricted"
            scopeString = "none"
            canSelectMore = false
            details = "Photo library access is restricted by parental controls or device policy."
        case .denied:
            statusString = "denied"
            scopeString = "none"
            canSelectMore = false
            details = "Photo library access was explicitly denied by the user."
        case .limited:
            statusString = "limited"
            scopeString = "selected"
            canSelectMore = true
            details = "Limited Photos Access: Keepr can only access user-selected photos. Native albums are disabled; use Keepr collections."
        case .authorized:
            statusString = "authorized"
            scopeString = "full"
            canSelectMore = false
            details = "Full photo library access is granted."
        @unknown default:
            statusString = "notDetermined"
            scopeString = "none"
            canSelectMore = false
            details = "Unknown authorization status."
        }
        
        return [
            "status": statusString,
            "scope": scopeString,
            "canSelectMore": canSelectMore,
            "details": details
        ]
    }
    
    public func openSettings(completion: @escaping (Bool) -> Void) {
        DispatchQueue.main.async {
            guard let settingsURL = URL(string: UIApplication.openSettingsURLString),
                  UIApplication.shared.canOpenURL(settingsURL) else {
                completion(false)
                return
            }
            UIApplication.shared.open(settingsURL, options: [:]) { success in
                completion(success)
            }
        }
    }
    
    public func presentLimitedLibraryPicker(completion: @escaping (Bool, String?) -> Void) {
        DispatchQueue.main.async {
            let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
            guard status == .limited else {
                completion(false, "Limited library picker can only be presented when authorization status is 'limited'. Current status is '\(self.mapAuthorizationStatus(status)["status"] ?? "")'.")
                return
            }
            
            guard let windowScene = UIApplication.shared.connectedScenes.first(where: {
                $0.activationState == .foregroundActive
            }) as? UIWindowScene,
                  let keyWindow = windowScene.windows.first(where: { $0.isKeyWindow }),
                  let rootVC = keyWindow.rootViewController else {
                completion(false, "Could not locate active root view controller to present picker.")
                return
            }
            
            let topVC = self.getTopViewController(rootVC)
            PHPhotoLibrary.shared().presentLimitedLibraryPicker(from: topVC)
            completion(true, nil)
        }
    }
    
    private func getTopViewController(_ root: UIViewController) -> UIViewController {
        if let nav = root as? UINavigationController, let visible = nav.visibleViewController {
            return getTopViewController(visible)
        }
        if let tab = root as? UITabBarController, let selected = tab.selectedViewController {
            return getTopViewController(selected)
        }
        if let presented = root.presentedViewController {
            return getTopViewController(presented)
        }
        return root
    }
    
    // MARK: - Media Query
    
    public func queryMedia(options: [String: Any]) throws -> [String: Any] {
        let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        guard status == .authorized || status == .limited else {
            throw PhotoKitError.permissionDenied("Photo library access is not granted. Current status: \(mapAuthorizationStatus(status)["status"] ?? "")")
        }
        
        let albumId = options["albumId"] as? String
        if let albumId = albumId, status == .limited {
            // Limited access does not allow native album queries
            throw PhotoKitError.limitedAccessRestricted("Native album operations are unavailable under iOS Limited Photos access. PhotoKit does not permit fetching or creating albums without full library authorization. Use Keepr collections to organize your selected media, or upgrade to Full Access in iOS Settings.")
        }
        
        let fetchOptions = PHFetchOptions()
        var predicates: [NSPredicate] = []
        
        // Media types filter
        if let mediaTypes = options["mediaTypes"] as? [String], !mediaTypes.isEmpty {
            var typePredicates: [NSPredicate] = []
            if mediaTypes.contains("IMAGE") {
                typePredicates.append(NSPredicate(format: "mediaType == %d", PHAssetMediaType.image.rawValue))
            }
            if mediaTypes.contains("VIDEO") {
                typePredicates.append(NSPredicate(format: "mediaType == %d", PHAssetMediaType.video.rawValue))
            }
            if !typePredicates.isEmpty {
                predicates.append(NSCompoundPredicate(orPredicateWithSubpredicates: typePredicates))
            }
        }
        
        // Screenshot filter
        if let isScreenshot = options["isScreenshot"] as? Bool, isScreenshot {
            predicates.append(NSPredicate(format: "(mediaSubtype & %d) != 0", PHAssetMediaSubtype.photoScreenshot.rawValue))
        }
        
        if !predicates.isEmpty {
            fetchOptions.predicate = NSCompoundPredicate(andPredicateWithSubpredicates: predicates)
        }
        
        // Sorting
        let sortBy = options["sortBy"] as? String ?? "date"
        let sortOrder = options["sortOrder"] as? String ?? "desc"
        let ascending = sortOrder.lowercased() == "asc"
        
        if sortBy == "date" {
            fetchOptions.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: ascending)]
        } else {
            // Default to date sorting as PhotoKit does not support direct size sort descriptor
            fetchOptions.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: ascending)]
        }
        
        let fetchResult: PHFetchResult<PHAsset>
        if let albumId = albumId {
            let collections = PHAssetCollection.fetchAssetCollections(withLocalIdentifiers: [albumId], options: nil)
            guard let collection = collections.firstObject else {
                throw PhotoKitError.assetNotFound("Album with ID '\(albumId)' not found.")
            }
            fetchResult = PHAsset.fetchAssets(in: collection, options: fetchOptions)
        } else {
            fetchResult = PHAsset.fetchAssets(with: fetchOptions)
        }
        
        let pageSize = options["pageSize"] as? Int ?? 50
        let pageToken = options["pageToken"] as? String
        let offset = pageToken != nil ? (Int(pageToken!) ?? 0) : 0
        let totalCount = fetchResult.count
        
        guard offset < totalCount else {
            return [
                "items": [] as [[String: Any]],
                "nextPageToken": NSNull(),
                "totalCount": totalCount,
                "isLimitedScope": status == .limited
            ]
        }
        
        let endIndex = min(offset + pageSize, totalCount)
        var items: [[String: Any]] = []
        
        let minSizeBytes = (options["minSizeBytes"] as? NSNumber)?.int64Value
        let maxSizeBytes = (options["maxSizeBytes"] as? NSNumber)?.int64Value
        
        for i in offset..<endIndex {
            let asset = fetchResult.object(at: i)
            let item = serializeAsset(asset)
            
            if let minSize = minSizeBytes, let size = item["sizeBytes"] as? Int64, size < minSize {
                continue
            }
            if let maxSize = maxSizeBytes, let size = item["sizeBytes"] as? Int64, size > maxSize {
                continue
            }
            
            items.append(item)
        }
        
        let nextPageToken: Any = endIndex < totalCount ? String(endIndex) : NSNull()
        
        return [
            "items": items,
            "nextPageToken": nextPageToken,
            "totalCount": totalCount,
            "isLimitedScope": status == .limited
        ]
    }
    
    // MARK: - Asset Availability (Strict Offline)
    
    public func getItemAvailability(id: String) -> String {
        let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        guard status == .authorized || status == .limited else {
            return "permissionRevoked"
        }
        
        let assets = PHAsset.fetchAssets(withLocalIdentifiers: [id], options: nil)
        guard let asset = assets.firstObject else {
            return "assetMissing"
        }
        
        // Strict offline: disallow network access
        if asset.mediaType == .image {
            let options = PHImageRequestOptions()
            options.isNetworkAccessAllowed = false
            options.isSynchronous = true
            options.deliveryMode = .fastFormat
            
            var isInCloud = false
            var isLocallyAvailable = false
            
            PHImageManager.default().requestImageDataAndOrientation(for: asset, options: options) { data, uti, orientation, info in
                if let inCloud = info?[PHImageResultIsInCloudKey] as? Bool, inCloud {
                    isInCloud = true
                } else if data != nil {
                    isLocallyAvailable = true
                } else if let error = info?[PHImageErrorKey] as? NSError {
                    // Check for network required error in PhotoKit error domain
                    if error.domain == PHPhotosErrorDomain && (error.code == 3164 || error.code == 3169) {
                        isInCloud = true
                    }
                }
            }
            
            if isLocallyAvailable {
                return "availableOffline"
            } else if isInCloud {
                return "requiresNetwork"
            } else {
                return "requiresNetwork"
            }
        } else if asset.mediaType == .video {
            let options = PHVideoRequestOptions()
            options.isNetworkAccessAllowed = false
            
            let semaphore = DispatchSemaphore(value: 0)
            var isInCloud = false
            var isLocallyAvailable = false
            
            PHImageManager.default().requestAVAsset(forVideo: asset, options: options) { avAsset, audioMix, info in
                if let inCloud = info?[PHImageResultIsInCloudKey] as? Bool, inCloud {
                    isInCloud = true
                } else if avAsset != nil {
                    isLocallyAvailable = true
                } else if let error = info?[PHImageErrorKey] as? NSError {
                    if error.domain == PHPhotosErrorDomain && (error.code == 3164 || error.code == 3169) {
                        isInCloud = true
                    }
                }
                semaphore.signal()
            }
            
            _ = semaphore.wait(timeout: .now() + 2.0)
            
            if isLocallyAvailable {
                return "availableOffline"
            } else if isInCloud {
                return "requiresNetwork"
            } else {
                return "requiresNetwork"
            }
        }
        
        return "assetMissing"
    }
    
    // MARK: - Album Queries
    
    public func listAlbums() throws -> [[String: Any]] {
        let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        guard status == .authorized || status == .limited else {
            throw PhotoKitError.permissionDenied("Photo library access is not granted.")
        }
        
        // Limited access restriction per technical specification
        if status == .limited {
            throw PhotoKitError.limitedAccessRestricted("Native album operations are unavailable under iOS Limited Photos access. PhotoKit does not permit fetching or creating albums without full library authorization. Use Keepr collections to organize your selected media, or upgrade to Full Access in iOS Settings.")
        }
        
        var albums: [[String: Any]] = []
        
        let regularAlbums = PHAssetCollection.fetchAssetCollections(with: .album, subtype: .albumRegular, options: nil)
        let syncedAlbums = PHAssetCollection.fetchAssetCollections(with: .album, subtype: .albumSyncedAlbum, options: nil)
        let sharedAlbums = PHAssetCollection.fetchAssetCollections(with: .album, subtype: .albumCloudShared, options: nil)
        
        let allCollections = [regularAlbums, syncedAlbums, sharedAlbums]
        
        for fetchResult in allCollections {
            fetchResult.enumerateObjects { collection, _, _ in
                let assets = PHAsset.fetchAssets(in: collection, options: nil)
                let coverRef = assets.firstObject?.localIdentifier
                let isReadOnly = !collection.canPerform(.addContent) && !collection.canPerform(.removeContent)
                
                albums.append([
                    "id": collection.localIdentifier,
                    "name": collection.localizedTitle ?? "Untitled Album",
                    "type": "NATIVE_SYSTEM",
                    "itemCount": assets.count,
                    "isReadOnly": isReadOnly,
                    "coverAssetRef": coverRef != nil ? coverRef! : NSNull()
                ])
            }
        }
        
        return albums
    }
    
    // MARK: - Helpers
    
    public func serializeAsset(_ asset: PHAsset) -> [String: Any] {
        let resources = PHAssetResource.assetResources(for: asset)
        let targetType: PHAssetResourceType = (asset.mediaType == .video ? .video : .photo)
        let primaryResource = resources.first(where: { $0.type == targetType }) ?? resources.first
        
        var sizeBytes: Int64 = 0
        if let resource = primaryResource,
           let fileSize = resource.value(forKey: "fileSize") as? NSNumber {
            sizeBytes = fileSize.int64Value
        }
        
        let capturedAt: Any = asset.creationDate != nil
            ? Int64(asset.creationDate!.timeIntervalSince1970 * 1000)
            : NSNull()
        
        let duration: Any = asset.mediaType == .video ? asset.duration : NSNull()
        
        var mimeType = "application/octet-stream"
        if let uti = primaryResource?.uniformTypeIdentifier {
            mimeType = mimeTypeFromUTI(uti)
        } else if asset.mediaType == .image {
            mimeType = "image/jpeg"
        } else if asset.mediaType == .video {
            mimeType = "video/mp4"
        }
        
        return [
            "id": asset.localIdentifier,
            "mediaType": asset.mediaType == .video ? "VIDEO" : "IMAGE",
            "assetRef": asset.localIdentifier,
            "sizeBytes": sizeBytes,
            "capturedAt": capturedAt,
            "width": asset.pixelWidth,
            "height": asset.pixelHeight,
            "durationSeconds": duration,
            "isFavorite": asset.isFavorite,
            "isProtected": false,
            "mimeType": mimeType,
            "filename": primaryResource?.originalFilename ?? "asset"
        ]
    }
    
    public func mimeTypeFromUTI(_ uti: String) -> String {
        switch uti.lowercased() {
        case "public.jpeg", "public.jpg":
            return "image/jpeg"
        case "public.png":
            return "image/png"
        case "public.heic", "public.heif":
            return "image/heic"
        case "org.webmproject.webp", "public.webp":
            return "image/webp"
        case "public.mpeg-4", "com.apple.m4v-video":
            return "video/mp4"
        case "com.apple.quicktime-movie":
            return "video/quicktime"
        default:
            return "application/octet-stream"
        }
    }
}
