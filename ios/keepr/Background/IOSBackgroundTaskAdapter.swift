//
//  IOSBackgroundTaskAdapter.swift
//  keepr
//

import Foundation
import BackgroundTasks

public class IOSBackgroundTaskAdapter: NSObject {
    public static let shared = IOSBackgroundTaskAdapter()
    
    public static let processingTaskIdentifier = "com.keepr.background.processing"
    public static let cleanupTaskIdentifier = "com.keepr.background.cleanup"
    
    public struct JobRecord {
        public let id: String
        public let type: String
        public var status: String // PENDING, RUNNING, COMPLETED, FAILED, CANCELLED
        public let payload: [String: Any]
        public var checkpoint: [String: Any]
        public var updatedAt: Date
    }
    
    private var jobs: [String: JobRecord] = [:]
    private let lock = NSLock()
    private let userDefaultsKey = "com.keepr.background_jobs"
    
    override public init() {
        super.init()
        loadPersistedJobs()
    }
    
    // MARK: - Registration
    
    public func registerBackgroundTasks() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: IOSBackgroundTaskAdapter.processingTaskIdentifier, using: nil) { task in
            guard let processingTask = task as? BGProcessingTask else { return }
            self.handleProcessingTask(processingTask)
        }
        
        BGTaskScheduler.shared.register(forTaskWithIdentifier: IOSBackgroundTaskAdapter.cleanupTaskIdentifier, using: nil) { task in
            guard let processingTask = task as? BGProcessingTask else { return }
            self.handleCleanupTask(processingTask)
        }
    }
    
    // MARK: - Job Management
    
    public func scheduleJob(jobId: String, type: String, payload: [String: Any]) -> Bool {
        lock.lock()
        jobs[jobId] = JobRecord(
            id: jobId,
            type: type,
            status: "PENDING",
            payload: payload,
            checkpoint: ["progress": 0.0, "processedCount": 0],
            updatedAt: Date()
        )
        persistJobs()
        lock.unlock()
        
        // Submit BGProcessingTaskRequest
        let request = BGProcessingTaskRequest(identifier: IOSBackgroundTaskAdapter.processingTaskIdentifier)
        request.requiresNetworkConnectivity = false // Strict offline!
        request.requiresExternalPower = false
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15) // minimum delay
        
        do {
            try BGTaskScheduler.shared.submit(request)
            return true
        } catch {
            // Simulator or scheduling limit: keep job marked PENDING for foreground execution
            return true
        }
    }
    
    public func cancelJob(jobId: String) {
        lock.lock()
        defer { lock.unlock() }
        
        if var record = jobs[jobId] {
            record.status = "CANCELLED"
            record.updatedAt = Date()
            jobs[jobId] = record
            persistJobs()
        }
        
        BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: IOSBackgroundTaskAdapter.processingTaskIdentifier)
    }
    
    public func getJobStatus(jobId: String) -> String {
        lock.lock()
        defer { lock.unlock() }
        
        return jobs[jobId]?.status ?? "FAILED"
    }
    
    // MARK: - Foreground Checkpointing
    
    public func checkpointJob(jobId: String, checkpoint: [String: Any], status: String? = nil) {
        lock.lock()
        defer { lock.unlock() }
        
        guard var record = jobs[jobId] else { return }
        record.checkpoint = checkpoint
        if let newStatus = status {
            record.status = newStatus
        }
        record.updatedAt = Date()
        jobs[jobId] = record
        persistJobs()
    }
    
    // MARK: - BG Task Handlers
    
    private func handleProcessingTask(_ task: BGProcessingTask) {
        task.expirationHandler = { [weak self] in
            // Handle early OS termination gracefully
            self?.checkpointActiveJobsOnExpiration()
            task.setTaskCompleted(success: false)
        }
        
        lock.lock()
        let pendingJob = jobs.values.first { $0.status == "PENDING" }
        lock.unlock()
        
        guard let job = pendingJob else {
            task.setTaskCompleted(success: true)
            return
        }
        
        checkpointJob(jobId: job.id, checkpoint: job.checkpoint, status: "RUNNING")
        
        // Simulating completion of pending work or scheduling next
        DispatchQueue.global(qos: .background).async {
            self.checkpointJob(jobId: job.id, checkpoint: ["progress": 1.0], status: "COMPLETED")
            task.setTaskCompleted(success: true)
        }
    }
    
    private func handleCleanupTask(_ task: BGProcessingTask) {
        task.expirationHandler = {
            task.setTaskCompleted(success: false)
        }
        
        DispatchQueue.global(qos: .background).async {
            // Clean old temporary files in staging
            let stagingURL = IOSCompressor.shared.stagingURL
            let fileManager = FileManager.default
            if let files = try? fileManager.contentsOfDirectory(at: stagingURL, includingPropertiesForKeys: [.contentModificationDateKey], options: .skipsHiddenFiles) {
                let cutoff = Date(timeIntervalSinceNow: -86400 * 2) // 2 days old
                for file in files {
                    if let values = try? file.resourceValues(forKeys: [.contentModificationDateKey]),
                       let modDate = values.contentModificationDate,
                       modDate < cutoff {
                        try? fileManager.removeItem(at: file)
                    }
                }
            }
            task.setTaskCompleted(success: true)
        }
    }
    
    private func checkpointActiveJobsOnExpiration() {
        lock.lock()
        defer { lock.unlock() }
        
        for (id, record) in jobs where record.status == "RUNNING" {
            var updated = record
            updated.status = "PENDING" // Reset to pending so it can resume
            updated.updatedAt = Date()
            jobs[id] = updated
        }
        persistJobs()
    }
    
    // MARK: - Persistence
    
    private func persistJobs() {
        var serializable: [[String: Any]] = []
        for job in jobs.values {
            serializable.append([
                "id": job.id,
                "type": job.type,
                "status": job.status,
                "checkpoint": job.checkpoint,
                "updatedAt": job.updatedAt.timeIntervalSince1970
            ])
        }
        UserDefaults.standard.set(serializable, forKey: userDefaultsKey)
    }
    
    private func loadPersistedJobs() {
        guard let raw = UserDefaults.standard.array(forKey: userDefaultsKey) as? [[String: Any]] else {
            return
        }
        
        for dict in raw {
            guard let id = dict["id"] as? String,
                  let type = dict["type"] as? String,
                  let status = dict["status"] as? String else {
                continue
            }
            let checkpoint = (dict["checkpoint"] as? [String: Any]) ?? [:]
            let timestamp = (dict["updatedAt"] as? Double) ?? Date().timeIntervalSince1970
            
            jobs[id] = JobRecord(
                id: id,
                type: type,
                status: status,
                payload: [:],
                checkpoint: checkpoint,
                updatedAt: Date(timeIntervalSince1970: timestamp)
            )
        }
    }
}
