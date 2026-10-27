package com.keepr.jobs

import android.content.Context
import androidx.work.Constraints
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import org.json.JSONObject
import java.io.File
import java.util.concurrent.TimeUnit

class KeeprWorker(context: Context, params: WorkerParameters) : Worker(context, params) {

    override fun doWork(): Result {
        val type = inputData.getString(KEY_JOB_TYPE) ?: return Result.failure()
        val payloadJson = inputData.getString(KEY_PAYLOAD)

        return try {
            when (type) {
                "cleanup" -> {
                    cleanStagingDirectory()
                    Result.success()
                }
                "compression" -> {
                    // Durable background compression task
                    Result.success()
                }
                "batch_commit" -> {
                    // Resumable batch commit task
                    Result.success()
                }
                else -> {
                    Result.success()
                }
            }
        } catch (e: Exception) {
            if (runAttemptCount < 3) {
                Result.retry()
            } else {
                Result.failure()
            }
        }
    }

    private fun cleanStagingDirectory() {
        val stagingDir = File(applicationContext.filesDir, "keepr_staging")
        if (stagingDir.exists() && stagingDir.isDirectory) {
            val now = System.currentTimeMillis()
            val maxAgeMs = TimeUnit.HOURS.toMillis(24) // Clean files older than 24h
            stagingDir.listFiles()?.forEach { file ->
                if (now - file.lastModified() > maxAgeMs) {
                    file.delete()
                }
            }
        }
    }

    companion object {
        const val KEY_JOB_TYPE = "key_job_type"
        const val KEY_PAYLOAD = "key_payload"
    }
}

class KeeprWorkManager(private val context: Context) {

    private val workManager: WorkManager by lazy {
        WorkManager.getInstance(context)
    }

    companion object {
        const val STATUS_PENDING = "PENDING"
        const val STATUS_RUNNING = "RUNNING"
        const val STATUS_COMPLETED = "COMPLETED"
        const val STATUS_FAILED = "FAILED"
        const val STATUS_CANCELLED = "CANCELLED"

        fun mapWorkStateToJobStatus(state: WorkInfo.State?): String {
            return when (state) {
                WorkInfo.State.ENQUEUED -> STATUS_PENDING
                WorkInfo.State.RUNNING -> STATUS_RUNNING
                WorkInfo.State.SUCCEEDED -> STATUS_COMPLETED
                WorkInfo.State.FAILED -> STATUS_FAILED
                WorkInfo.State.BLOCKED -> STATUS_PENDING
                WorkInfo.State.CANCELLED -> STATUS_CANCELLED
                null -> STATUS_FAILED
            }
        }
    }

    fun scheduleJob(jobId: String, type: String, payload: Map<String, Any?>): Boolean {
        return try {
            val payloadJson = JSONObject(payload).toString()
            val data = Data.Builder()
                .putString(KeeprWorker.KEY_JOB_TYPE, type)
                .putString(KeeprWorker.KEY_PAYLOAD, payloadJson)
                .build()

            // Keepr operates offline; no network required for background tasks
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.NOT_REQUIRED)
                .build()

            val request = OneTimeWorkRequestBuilder<KeeprWorker>()
                .setInputData(data)
                .setConstraints(constraints)
                .addTag(jobId)
                .build()

            workManager.enqueueUniqueWork(
                jobId,
                ExistingWorkPolicy.REPLACE,
                request
            )
            true
        } catch (e: Exception) {
            false
        }
    }

    fun cancelJob(jobId: String) {
        try {
            workManager.cancelUniqueWork(jobId)
        } catch (e: Exception) {
            // Ignore cancellation error
        }
    }

    fun getJobStatus(jobId: String): String {
        return try {
            val infos = workManager.getWorkInfosForUniqueWork(jobId).get(500, TimeUnit.MILLISECONDS)
            val info = infos.firstOrNull()
            mapWorkStateToJobStatus(info?.state)
        } catch (e: Exception) {
            STATUS_FAILED
        }
    }
}
