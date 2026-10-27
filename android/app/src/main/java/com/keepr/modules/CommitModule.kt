package com.keepr.modules

import android.app.Activity
import android.content.Intent
import android.content.IntentSender
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.keepr.commits.AndroidCommitAdapter
import com.keepr.commits.CommitRequestItemDto
import com.keepr.commits.ConsentRequester
import com.keepr.processing.CompressionCandidateDto
import java.util.concurrent.CompletableFuture
import java.util.concurrent.Executors

class CommitModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener, ConsentRequester {

    companion object {
        const val REQUEST_CODE_MEDIASTORE_CONSENT = 4101
    }

    private val commitAdapter = AndroidCommitAdapter(reactContext)
    private val executor = Executors.newSingleThreadExecutor()

    @Volatile
    private var pendingConsentFuture: CompletableFuture<Boolean>? = null

    init {
        reactContext.addActivityEventListener(this)
    }

    override fun getName(): String = "KeeprCommit"

    override fun invalidate() {
        super.invalidate()
        reactApplicationContext.removeActivityEventListener(this)
    }

    override fun requestConsent(intentSender: IntentSender): Boolean {
        val activity = reactApplicationContext.currentActivity ?: return false
        val future = CompletableFuture<Boolean>()
        pendingConsentFuture = future

        activity.runOnUiThread {
            try {
                activity.startIntentSenderForResult(
                    intentSender,
                    REQUEST_CODE_MEDIASTORE_CONSENT,
                    null,
                    0,
                    0,
                    0
                )
            } catch (e: Exception) {
                future.complete(false)
            }
        }

        return try {
            future.get()
        } catch (e: Exception) {
            false
        } finally {
            pendingConsentFuture = null
        }
    }

    override fun onActivityResult(
        activity: Activity,
        requestCode: Int,
        resultCode: Int,
        data: Intent?
    ) {
        if (requestCode == REQUEST_CODE_MEDIASTORE_CONSENT) {
            val approved = (resultCode == Activity.RESULT_OK)
            pendingConsentFuture?.complete(approved)
        }
    }

    override fun onNewIntent(intent: Intent) {
        // No-op
    }

    @ReactMethod
    fun canTrash(promise: Promise) {
        promise.resolve(commitAdapter.canTrash())
    }

    @ReactMethod
    fun getPlatformRecoveryDescription(promise: Promise) {
        promise.resolve(commitAdapter.getPlatformRecoveryDescription())
    }

    private fun parseCandidate(map: ReadableMap?): CompressionCandidateDto? {
        if (map == null) return null
        return CompressionCandidateDto(
            originalId = map.getString("originalId") ?: "",
            stagedPath = map.getString("stagedPath") ?: "",
            stagedSizeBytes = if (map.hasKey("stagedSizeBytes")) map.getDouble("stagedSizeBytes").toLong() else 0L,
            originalSizeBytes = if (map.hasKey("originalSizeBytes")) map.getDouble("originalSizeBytes").toLong() else 0L,
            estimatedSavingsBytes = if (map.hasKey("estimatedSavingsBytes")) map.getDouble("estimatedSavingsBytes").toLong() else 0L,
            measuredSavingsBytes = if (map.hasKey("measuredSavingsBytes")) map.getDouble("measuredSavingsBytes").toLong() else 0L,
            width = if (map.hasKey("width")) map.getInt("width") else 0,
            height = if (map.hasKey("height")) map.getInt("height") else 0,
            mimeType = map.getString("mimeType") ?: "image/jpeg",
            isSmaller = if (map.hasKey("isSmaller")) map.getBoolean("isSmaller") else false,
            isValid = if (map.hasKey("isValid")) map.getBoolean("isValid") else false,
            error = if (map.hasKey("error")) map.getString("error") else null
        )
    }

    @ReactMethod
    fun commitBatch(itemsArray: ReadableArray, promise: Promise) {
        executor.execute {
            try {
                val items = mutableListOf<CommitRequestItemDto>()
                for (i in 0 until itemsArray.size()) {
                    val map = itemsArray.getMap(i) ?: continue
                    val mediaId = map.getString("mediaId") ?: ""
                    val decision = map.getString("decision") ?: "KEEP"
                    val isProtected = if (map.hasKey("isProtected")) map.getBoolean("isProtected") else false
                    val assetRef = if (map.hasKey("assetRef")) map.getString("assetRef") ?: "" else ""
                    val originalSizeBytes = if (map.hasKey("originalSizeBytes")) map.getDouble("originalSizeBytes").toLong() else 0L
                    val candidate = if (map.hasKey("candidate")) parseCandidate(map.getMap("candidate")) else null

                    items.add(
                        CommitRequestItemDto(
                            mediaId = mediaId,
                            decision = decision,
                            candidate = candidate,
                            isProtected = isProtected,
                            assetRef = assetRef,
                            originalSizeBytes = originalSizeBytes
                        )
                    )
                }

                val summary = commitAdapter.commitBatch(items, this)

                val resultsArray = Arguments.createArray()
                for (res in summary.results) {
                    val resMap = Arguments.createMap().apply {
                        putString("mediaId", res.mediaId)
                        putString("decision", res.decision)
                        putString("outcome", res.outcome)
                        putDouble("reclaimedBytes", res.reclaimedBytes.toDouble())
                        res.error?.let { putString("error", it) }
                        putBoolean("isPlatformTrash", res.isPlatformTrash)
                    }
                    resultsArray.pushMap(resMap)
                }

                val summaryMap = Arguments.createMap().apply {
                    putInt("totalRequested", summary.totalRequested)
                    putInt("succeeded", summary.succeeded)
                    putInt("failed", summary.failed)
                    putInt("denied", summary.denied)
                    putDouble("totalReclaimedBytes", summary.totalReclaimedBytes.toDouble())
                    putArray("results", resultsArray)
                }

                promise.resolve(summaryMap)
            } catch (e: Exception) {
                promise.reject("COMMIT_ERROR", e.message, e)
            }
        }
    }
}
