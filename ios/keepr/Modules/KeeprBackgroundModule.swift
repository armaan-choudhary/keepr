//
//  KeeprBackgroundModule.swift
//  keepr
//

import Foundation
import React

@objc(KeeprBackgroundModule)
public class KeeprBackgroundModule: NSObject {
    
    @objc static func requiresMainQueueSetup() -> Bool {
        return false
    }
    
    @objc(scheduleJob:type:payload:resolver:rejecter:)
    public func scheduleJob(
        jobId: String,
        type: String,
        payload: [String: Any],
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        let success = IOSBackgroundTaskAdapter.shared.scheduleJob(jobId: jobId, type: type, payload: payload)
        resolve(success)
    }
    
    @objc(cancelJob:resolver:rejecter:)
    public func cancelJob(
        jobId: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        IOSBackgroundTaskAdapter.shared.cancelJob(jobId: jobId)
        resolve(nil)
    }
    
    @objc(getJobStatus:resolver:rejecter:)
    public func getJobStatus(
        jobId: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        let status = IOSBackgroundTaskAdapter.shared.getJobStatus(jobId: jobId)
        resolve(status)
    }
}
