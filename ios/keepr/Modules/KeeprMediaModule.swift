//
//  KeeprMediaModule.swift
//  keepr
//

import Foundation
import Photos
import React

@objc(KeeprMediaModule)
public class KeeprMediaModule: NSObject {
    
    @objc static func requiresMainQueueSetup() -> Bool {
        return false
    }
    
    @objc(getAuthorizationState:rejecter:)
    public func getAuthorizationState(
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        let state = PhotoKitAdapter.shared.getAuthorizationState()
        resolve(state)
    }
    
    @objc(requestAuthorization:resolver:rejecter:)
    public func requestAuthorization(
        types: [String],
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        PhotoKitAdapter.shared.requestAuthorization(types: types) { state in
            resolve(state)
        }
    }
    
    @objc(openSettings:rejecter:)
    public func openSettings(
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        PhotoKitAdapter.shared.openSettings { success in
            if success {
                resolve(nil)
            } else {
                reject("SETTINGS_FAILED", "Could not open system settings.", nil)
            }
        }
    }
    
    @objc(queryMedia:resolver:rejecter:)
    public func queryMedia(
        options: [String: Any],
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let page = try PhotoKitAdapter.shared.queryMedia(options: options)
                resolve(page)
            } catch let error as PhotoKitError {
                switch error {
                case .permissionDenied(let msg):
                    reject("PERMISSION_DENIED", msg, error)
                case .limitedAccessRestricted(let msg):
                    reject("LIMITED_ACCESS_RESTRICTED", msg, error)
                case .assetNotFound(let msg):
                    reject("ASSET_NOT_FOUND", msg, error)
                case .iCloudDownloadRequired(let msg):
                    reject("ICLOUD_DOWNLOAD_REQUIRED", msg, error)
                case .queryFailed(let msg):
                    reject("QUERY_FAILED", msg, error)
                }
            } catch {
                reject("QUERY_ERROR", error.localizedDescription, error)
            }
        }
    }
    
    @objc(getItemAvailability:resolver:rejecter:)
    public func getItemAvailability(
        id: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        DispatchQueue.global(qos: .userInitiated).async {
            let availability = PhotoKitAdapter.shared.getItemAvailability(id: id)
            resolve(availability)
        }
    }
    
    @objc(listAlbums:rejecter:)
    public func listAlbums(
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let albums = try PhotoKitAdapter.shared.listAlbums()
                resolve(albums)
            } catch let error as PhotoKitError {
                switch error {
                case .limitedAccessRestricted(let msg):
                    reject("LIMITED_ACCESS_RESTRICTED", msg, error)
                case .permissionDenied(let msg):
                    reject("PERMISSION_DENIED", msg, error)
                default:
                    reject("ALBUM_QUERY_FAILED", error.localizedDescription, error)
                }
            } catch {
                reject("ALBUM_QUERY_FAILED", error.localizedDescription, error)
            }
        }
    }
    
    @objc(presentLimitedLibraryPicker:rejecter:)
    public func presentLimitedLibraryPicker(
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        PhotoKitAdapter.shared.presentLimitedLibraryPicker { success, error in
            if success {
                resolve(nil)
            } else {
                reject("PICKER_FAILED", error ?? "Could not present limited library picker.", nil)
            }
        }
    }
}
