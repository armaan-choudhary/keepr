//
//  KeeprCommitModule.swift
//  keepr
//

import Foundation
import React

@objc(KeeprCommitModule)
public class KeeprCommitModule: NSObject {
    
    @objc static func requiresMainQueueSetup() -> Bool {
        return false
    }
    
    @objc(commitBatch:resolver:rejecter:)
    public func commitBatch(
        items: [[String: Any]],
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        IOSCommitAdapter.shared.commitBatch(items: items) { summary in
            resolve(summary)
        }
    }
    
    @objc(canTrash:rejecter:)
    public func canTrash(
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        let result = IOSCommitAdapter.shared.canTrash()
        resolve(result)
    }
    
    @objc(getPlatformRecoveryDescription:rejecter:)
    public func getPlatformRecoveryDescription(
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        let desc = IOSCommitAdapter.shared.getPlatformRecoveryDescription()
        resolve(desc)
    }
}
