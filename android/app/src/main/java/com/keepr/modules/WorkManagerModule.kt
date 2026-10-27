package com.keepr.modules

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.keepr.jobs.KeeprWorkManager
import java.util.concurrent.Executors

class WorkManagerModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val workManager = KeeprWorkManager(reactContext)
    private val executor = Executors.newSingleThreadExecutor()

    override fun getName(): String = "KeeprWorkManager"

    @ReactMethod
    fun scheduleJob(jobId: String, type: String, payload: ReadableMap?, promise: Promise) {
        executor.execute {
            try {
                val payloadMap = payload?.toHashMap() ?: emptyMap<String, Any?>()
                val success = workManager.scheduleJob(jobId, type, payloadMap)
                promise.resolve(success)
            } catch (e: Exception) {
                promise.reject("SCHEDULE_JOB_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun cancelJob(jobId: String, promise: Promise) {
        executor.execute {
            try {
                workManager.cancelJob(jobId)
                promise.resolve(null)
            } catch (e: Exception) {
                promise.reject("CANCEL_JOB_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun getJobStatus(jobId: String, promise: Promise) {
        executor.execute {
            try {
                val status = workManager.getJobStatus(jobId)
                promise.resolve(status)
            } catch (e: Exception) {
                promise.reject("JOB_STATUS_ERROR", e.message, e)
            }
        }
    }
}
