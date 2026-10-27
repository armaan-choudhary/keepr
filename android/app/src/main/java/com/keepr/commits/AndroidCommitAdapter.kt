package com.keepr.commits

import android.app.Activity
import android.app.RecoverableSecurityException
import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.content.IntentSender
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import com.keepr.processing.CompressionCandidateDto
import java.io.File
import java.io.FileInputStream
import java.io.OutputStream

data class CommitRequestItemDto(
    val mediaId: String,
    val decision: String, // 'KEEP' | 'COMPRESS' | 'DELETE' | 'PERMANENT_DELETE'
    val candidate: CompressionCandidateDto? = null,
    val isProtected: Boolean = false,
    val assetRef: String = "",
    val originalSizeBytes: Long = 0L
)

data class ItemCommitResultDto(
    val mediaId: String,
    val decision: String,
    val outcome: String, // 'KEPT' | 'TRASHED' | 'PERMANENTLY_DELETED' | 'REPLACED' | 'DENIED' | 'FAILED' | 'SKIPPED'
    val reclaimedBytes: Long,
    val error: String? = null,
    val isPlatformTrash: Boolean = false
)

data class BatchCommitSummaryDto(
    val totalRequested: Int,
    val succeeded: Int,
    val failed: Int,
    val denied: Int,
    val totalReclaimedBytes: Long,
    val results: List<ItemCommitResultDto>
)

fun interface ConsentRequester {
    fun requestConsent(intentSender: IntentSender): Boolean
}

interface MediaStoreOps {
    fun isValidAsset(assetRef: String): Boolean
    fun createTrashRequest(assetRefs: List<String>, isTrashed: Boolean): IntentSender?
    fun createDeleteRequest(assetRefs: List<String>): IntentSender?
    fun delete(assetRef: String): Int
    fun insertReplacement(
        displayName: String,
        mimeType: String,
        isVideo: Boolean,
        isPending: Boolean
    ): String?
    fun setPending(assetRef: String, isPending: Boolean): Int
    fun openOutputStream(assetRef: String): OutputStream?
    fun extractRecoverableIntentSender(e: SecurityException): IntentSender?
}

class DefaultMediaStoreOps(private val context: Context) : MediaStoreOps {
    override fun isValidAsset(assetRef: String): Boolean {
        return try {
            val uri = Uri.parse(assetRef)
            uri != null && uri.scheme != null
        } catch (e: Exception) {
            false
        }
    }

    override fun createTrashRequest(assetRefs: List<String>, isTrashed: Boolean): IntentSender? {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val uris = assetRefs.map { Uri.parse(it) }
            MediaStore.createTrashRequest(context.contentResolver, uris, isTrashed).intentSender
        } else {
            null
        }
    }

    override fun createDeleteRequest(assetRefs: List<String>): IntentSender? {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val uris = assetRefs.map { Uri.parse(it) }
            MediaStore.createDeleteRequest(context.contentResolver, uris).intentSender
        } else {
            null
        }
    }

    override fun delete(assetRef: String): Int {
        val uri = Uri.parse(assetRef)
        return context.contentResolver.delete(uri, null, null)
    }

    override fun insertReplacement(
        displayName: String,
        mimeType: String,
        isVideo: Boolean,
        isPending: Boolean
    ): String? {
        val collectionUri = if (isVideo) {
            MediaStore.Video.Media.EXTERNAL_CONTENT_URI
        } else {
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI
        }

        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, displayName)
            put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val subDir = if (isVideo) Environment.DIRECTORY_MOVIES else Environment.DIRECTORY_PICTURES
                put(MediaStore.MediaColumns.RELATIVE_PATH, "$subDir/Keepr")
                if (isPending) {
                    put(MediaStore.MediaColumns.IS_PENDING, 1)
                }
            }
        }
        val uri = context.contentResolver.insert(collectionUri, values)
        return uri?.toString()
    }

    override fun setPending(assetRef: String, isPending: Boolean): Int {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val uri = Uri.parse(assetRef)
            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.IS_PENDING, if (isPending) 1 else 0)
            }
            return context.contentResolver.update(uri, values, null, null)
        }
        return 0
    }

    override fun openOutputStream(assetRef: String): OutputStream? {
        val uri = Uri.parse(assetRef)
        return context.contentResolver.openOutputStream(uri)
    }

    override fun extractRecoverableIntentSender(e: SecurityException): IntentSender? {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && e is RecoverableSecurityException) {
            e.userAction.actionIntent.intentSender
        } else {
            null
        }
    }
}

class AndroidCommitAdapter(
    private val context: Context? = null,
    private val mediaStoreOps: MediaStoreOps = context?.let { DefaultMediaStoreOps(it) } ?: object : MediaStoreOps {
        override fun isValidAsset(assetRef: String): Boolean = false
        override fun createTrashRequest(assetRefs: List<String>, isTrashed: Boolean): IntentSender? = null
        override fun createDeleteRequest(assetRefs: List<String>): IntentSender? = null
        override fun delete(assetRef: String): Int = 0
        override fun insertReplacement(
            displayName: String,
            mimeType: String,
            isVideo: Boolean,
            isPending: Boolean
        ): String? = null
        override fun setPending(assetRef: String, isPending: Boolean): Int = 0
        override fun openOutputStream(assetRef: String): OutputStream? = null
        override fun extractRecoverableIntentSender(e: SecurityException): IntentSender? = null
    },
    private val sdkInt: Int = Build.VERSION.SDK_INT
) {

    companion object {
        const val OUTCOME_KEPT = "KEPT"
        const val OUTCOME_TRASHED = "TRASHED"
        const val OUTCOME_PERMANENTLY_DELETED = "PERMANENTLY_DELETED"
        const val OUTCOME_REPLACED = "REPLACED"
        const val OUTCOME_DENIED = "DENIED"
        const val OUTCOME_FAILED = "FAILED"
        const val OUTCOME_SKIPPED = "SKIPPED"

        fun canTrash(sdkInt: Int = Build.VERSION.SDK_INT): Boolean {
            return sdkInt >= Build.VERSION_CODES.R // Android 11+ (API 30+)
        }

        fun getPlatformRecoveryDescription(sdkInt: Int = Build.VERSION.SDK_INT): String {
            return if (sdkInt >= Build.VERSION_CODES.R) {
                "Deleted items are moved to system trash, where retention and recovery are managed by Android and your device settings."
            } else if (sdkInt >= Build.VERSION_CODES.Q) {
                "Items are permanently deleted upon user consent. Android 10 does not support system trash."
            } else {
                "Items are permanently deleted from shared storage."
            }
        }
    }

    fun canTrash(): Boolean = canTrash(sdkInt)

    fun getPlatformRecoveryDescription(): String = getPlatformRecoveryDescription(sdkInt)

    fun resolveAssetRef(item: CommitRequestItemDto): String? {
        if (item.assetRef.isNotEmpty()) {
            return item.assetRef
        }
        val idLong = item.mediaId.toLongOrNull()
        if (idLong != null) {
            return "content://media/external/files/$idLong"
        }
        return null
    }

    fun commitBatch(
        items: List<CommitRequestItemDto>,
        consentRequester: ConsentRequester? = null
    ): BatchCommitSummaryDto {
        val results = arrayOfNulls<ItemCommitResultDto>(items.size)

        val remainingIndices = mutableListOf<Int>()
        for (i in items.indices) {
            val item = items[i]
            if (item.isProtected) {
                results[i] = ItemCommitResultDto(
                    mediaId = item.mediaId,
                    decision = item.decision,
                    outcome = OUTCOME_SKIPPED,
                    reclaimedBytes = 0L,
                    error = "Protected item cannot be deleted or replaced"
                )
            } else if (item.decision.equals("KEEP", ignoreCase = true)) {
                results[i] = ItemCommitResultDto(
                    mediaId = item.mediaId,
                    decision = "KEEP",
                    outcome = OUTCOME_KEPT,
                    reclaimedBytes = 0L
                )
            } else if (!item.decision.equals("DELETE", ignoreCase = true) &&
                !item.decision.equals("PERMANENT_DELETE", ignoreCase = true) &&
                !item.decision.equals("COMPRESS", ignoreCase = true)
            ) {
                results[i] = ItemCommitResultDto(
                    mediaId = item.mediaId,
                    decision = item.decision,
                    outcome = OUTCOME_SKIPPED,
                    reclaimedBytes = 0L,
                    error = "Unknown decision: ${item.decision}"
                )
            } else {
                remainingIndices.add(i)
            }
        }

        if (remainingIndices.isEmpty()) {
            return buildSummary(items, results)
        }

        if (sdkInt >= Build.VERSION_CODES.R) {
            commitBatchApi30Plus(items, remainingIndices, results, consentRequester)
        } else if (sdkInt >= Build.VERSION_CODES.Q) {
            commitBatchApi29(items, remainingIndices, results, consentRequester)
        } else {
            commitBatchLegacy(items, remainingIndices, results)
        }

        return buildSummary(items, results)
    }

    fun commitBatch(
        items: List<CommitRequestItemDto>,
        activity: Activity?,
        consentRequester: ConsentRequester? = null
    ): BatchCommitSummaryDto {
        return commitBatch(items, consentRequester)
    }

    private data class PublishedCompressEntry(
        val index: Int,
        val item: CommitRequestItemDto,
        val originalAssetRef: String,
        val stagedFile: File,
        val replacementAssetRef: String
    )

    private data class DeleteEntry(
        val index: Int,
        val item: CommitRequestItemDto,
        val assetRef: String
    )

    /**
     * Android 11+ (API 30+): MediaStore User Consent Flow.
     * Uses MediaStore.createTrashRequest or createDeleteRequest.
     */
    private fun commitBatchApi30Plus(
        items: List<CommitRequestItemDto>,
        indices: List<Int>,
        results: Array<ItemCommitResultDto?>,
        consentRequester: ConsentRequester?
    ) {
        val pendingTrashItems = mutableListOf<DeleteEntry>()
        val pendingPermanentDeleteItems = mutableListOf<DeleteEntry>()
        val publishedCompressItems = mutableListOf<PublishedCompressEntry>()

        for (idx in indices) {
            val item = items[idx]
            val assetRef = resolveAssetRef(item)
            if (assetRef == null || !mediaStoreOps.isValidAsset(assetRef)) {
                results[idx] = ItemCommitResultDto(
                    mediaId = item.mediaId,
                    decision = item.decision,
                    outcome = OUTCOME_FAILED,
                    reclaimedBytes = 0L,
                    error = "Invalid asset URI"
                )
                continue
            }

            when (item.decision.uppercase()) {
                "PERMANENT_DELETE" -> {
                    pendingPermanentDeleteItems.add(DeleteEntry(idx, item, assetRef))
                }
                "DELETE" -> {
                    pendingTrashItems.add(DeleteEntry(idx, item, assetRef))
                }
                "COMPRESS" -> {
                    // Safe Compression Replacement Order:
                    // 1. Verify candidate staged file exists and is valid BEFORE any library change
                    val candidate = item.candidate
                    if (candidate == null || !candidate.isValid) {
                        results[idx] = ItemCommitResultDto(
                            mediaId = item.mediaId,
                            decision = "COMPRESS",
                            outcome = OUTCOME_FAILED,
                            reclaimedBytes = 0L,
                            error = "No valid compression candidate available"
                        )
                        continue
                    }

                    val stagedFile = File(candidate.stagedPath)
                    if (!stagedFile.exists() || stagedFile.length() <= 0L) {
                        results[idx] = ItemCommitResultDto(
                            mediaId = item.mediaId,
                            decision = "COMPRESS",
                            outcome = OUTCOME_FAILED,
                            reclaimedBytes = 0L,
                            error = "Staged compressed file is missing or empty"
                        )
                        continue
                    }

                    // 2. Insert replacement into MediaStore with IS_PENDING = 1
                    val isVideo = candidate.mimeType.startsWith("video/")
                    val replacementAssetRef = try {
                        mediaStoreOps.insertReplacement(
                            displayName = stagedFile.name,
                            mimeType = candidate.mimeType,
                            isVideo = isVideo,
                            isPending = true
                        )
                    } catch (e: Exception) {
                        null
                    }

                    if (replacementAssetRef == null) {
                        results[idx] = ItemCommitResultDto(
                            mediaId = item.mediaId,
                            decision = "COMPRESS",
                            outcome = OUTCOME_FAILED,
                            reclaimedBytes = 0L,
                            error = "Failed to create replacement MediaStore entry"
                        )
                        continue
                    }

                    // 3. Write bytes to replacement
                    var writeOk = false
                    try {
                        FileInputStream(stagedFile).use { input ->
                            mediaStoreOps.openOutputStream(replacementAssetRef)?.use { output ->
                                input.copyTo(output)
                                output.flush()
                                writeOk = true
                            } ?: throw IllegalStateException("Cannot open output stream for replacement")
                        }
                    } catch (e: Exception) {
                        try {
                            mediaStoreOps.delete(replacementAssetRef)
                        } catch (ignored: Exception) {}
                        results[idx] = ItemCommitResultDto(
                            mediaId = item.mediaId,
                            decision = "COMPRESS",
                            outcome = OUTCOME_FAILED,
                            reclaimedBytes = 0L,
                            error = "Failed writing replacement bytes: ${e.message}"
                        )
                        continue
                    }

                    if (!writeOk) {
                        try {
                            mediaStoreOps.delete(replacementAssetRef)
                        } catch (ignored: Exception) {}
                        results[idx] = ItemCommitResultDto(
                            mediaId = item.mediaId,
                            decision = "COMPRESS",
                            outcome = OUTCOME_FAILED,
                            reclaimedBytes = 0L,
                            error = "Failed writing replacement bytes"
                        )
                        continue
                    }

                    // 4. Publish replacement with IS_PENDING = 0
                    mediaStoreOps.setPending(replacementAssetRef, false)

                    // 5. Track for trashing original AFTER replacement is published
                    publishedCompressItems.add(PublishedCompressEntry(idx, item, assetRef, stagedFile, replacementAssetRef))
                }
            }
        }

        // Process batch trash request (normal Delete + Compress originals)
        val assetRefsToTrash = pendingTrashItems.map { it.assetRef } + publishedCompressItems.map { it.originalAssetRef }
        if (assetRefsToTrash.isNotEmpty()) {
            val intentSender = try {
                mediaStoreOps.createTrashRequest(assetRefsToTrash, true)
            } catch (e: Exception) {
                null
            }

            if (intentSender == null) {
                for (entry in pendingTrashItems) {
                    results[entry.index] = ItemCommitResultDto(
                        mediaId = entry.item.mediaId,
                        decision = "DELETE",
                        outcome = OUTCOME_FAILED,
                        reclaimedBytes = 0L,
                        error = "Failed to create MediaStore trash request"
                    )
                }
                for (entry in publishedCompressItems) {
                    try {
                        mediaStoreOps.delete(entry.replacementAssetRef)
                    } catch (ignored: Exception) {}
                    results[entry.index] = ItemCommitResultDto(
                        mediaId = entry.item.mediaId,
                        decision = "COMPRESS",
                        outcome = OUTCOME_FAILED,
                        reclaimedBytes = 0L,
                        error = "Failed to create MediaStore trash request for original"
                    )
                }
            } else {
                val approved = consentRequester?.requestConsent(intentSender) ?: false
                if (approved) {
                    for (entry in pendingTrashItems) {
                        results[entry.index] = ItemCommitResultDto(
                            mediaId = entry.item.mediaId,
                            decision = "DELETE",
                            outcome = OUTCOME_TRASHED,
                            reclaimedBytes = entry.item.originalSizeBytes,
                            isPlatformTrash = true
                        )
                    }
                    for (entry in publishedCompressItems) {
                        try {
                            entry.stagedFile.delete()
                        } catch (ignored: Exception) {}
                        results[entry.index] = ItemCommitResultDto(
                            mediaId = entry.item.mediaId,
                            decision = "COMPRESS",
                            outcome = OUTCOME_REPLACED,
                            reclaimedBytes = entry.item.candidate?.measuredSavingsBytes ?: 0L,
                            isPlatformTrash = true
                        )
                    }
                } else {
                    for (entry in pendingTrashItems) {
                        results[entry.index] = ItemCommitResultDto(
                            mediaId = entry.item.mediaId,
                            decision = "DELETE",
                            outcome = OUTCOME_DENIED,
                            reclaimedBytes = 0L,
                            error = "User denied MediaStore trash consent"
                        )
                    }
                    for (entry in publishedCompressItems) {
                        try {
                            mediaStoreOps.delete(entry.replacementAssetRef)
                        } catch (ignored: Exception) {}
                        results[entry.index] = ItemCommitResultDto(
                            mediaId = entry.item.mediaId,
                            decision = "COMPRESS",
                            outcome = OUTCOME_DENIED,
                            reclaimedBytes = 0L,
                            error = "Original removal denied by user"
                        )
                    }
                }
            }
        }

        // Process batch delete request (PERMANENT_DELETE)
        if (pendingPermanentDeleteItems.isNotEmpty()) {
            val assetRefsToDelete = pendingPermanentDeleteItems.map { it.assetRef }
            val intentSender = try {
                mediaStoreOps.createDeleteRequest(assetRefsToDelete)
            } catch (e: Exception) {
                null
            }

            if (intentSender == null) {
                for (entry in pendingPermanentDeleteItems) {
                    results[entry.index] = ItemCommitResultDto(
                        mediaId = entry.item.mediaId,
                        decision = entry.item.decision,
                        outcome = OUTCOME_FAILED,
                        reclaimedBytes = 0L,
                        error = "Failed to create MediaStore delete request"
                    )
                }
            } else {
                val approved = consentRequester?.requestConsent(intentSender) ?: false
                if (approved) {
                    for (entry in pendingPermanentDeleteItems) {
                        results[entry.index] = ItemCommitResultDto(
                            mediaId = entry.item.mediaId,
                            decision = entry.item.decision,
                            outcome = OUTCOME_PERMANENTLY_DELETED,
                            reclaimedBytes = entry.item.originalSizeBytes,
                            isPlatformTrash = false
                        )
                    }
                } else {
                    for (entry in pendingPermanentDeleteItems) {
                        results[entry.index] = ItemCommitResultDto(
                            mediaId = entry.item.mediaId,
                            decision = entry.item.decision,
                            outcome = OUTCOME_DENIED,
                            reclaimedBytes = 0L,
                            error = "User denied MediaStore delete consent"
                        )
                    }
                }
            }
        }
    }

    /**
     * Android 10 (API 29): Recoverable Delete Consent.
     * When deleting throws RecoverableSecurityException, launches e.userAction.actionIntent.intentSender.
     */
    private fun commitBatchApi29(
        items: List<CommitRequestItemDto>,
        indices: List<Int>,
        results: Array<ItemCommitResultDto?>,
        consentRequester: ConsentRequester?
    ) {
        for (idx in indices) {
            val item = items[idx]
            val assetRef = resolveAssetRef(item)
            if (assetRef == null || !mediaStoreOps.isValidAsset(assetRef)) {
                results[idx] = ItemCommitResultDto(
                    mediaId = item.mediaId,
                    decision = item.decision,
                    outcome = OUTCOME_FAILED,
                    reclaimedBytes = 0L,
                    error = "Invalid asset URI"
                )
                continue
            }

            if (item.decision.equals("COMPRESS", ignoreCase = true)) {
                commitCompressItemApi29(idx, item, assetRef, results, consentRequester)
            } else {
                commitDeleteItemApi29(idx, item, assetRef, results, consentRequester)
            }
        }
    }

    private fun commitDeleteItemApi29(
        idx: Int,
        item: CommitRequestItemDto,
        assetRef: String,
        results: Array<ItemCommitResultDto?>,
        consentRequester: ConsentRequester?
    ) {
        try {
            val rows = mediaStoreOps.delete(assetRef)
            if (rows > 0) {
                results[idx] = ItemCommitResultDto(
                    mediaId = item.mediaId,
                    decision = item.decision,
                    outcome = OUTCOME_PERMANENTLY_DELETED,
                    reclaimedBytes = item.originalSizeBytes,
                    isPlatformTrash = false
                )
            } else {
                results[idx] = ItemCommitResultDto(
                    mediaId = item.mediaId,
                    decision = item.decision,
                    outcome = OUTCOME_FAILED,
                    reclaimedBytes = 0L,
                    error = "MediaStore delete returned 0 rows"
                )
            }
        } catch (e: SecurityException) {
            val intentSender = mediaStoreOps.extractRecoverableIntentSender(e)
            if (intentSender != null) {
                val approved = consentRequester?.requestConsent(intentSender) ?: false
                if (approved) {
                    try {
                        val retryRows = mediaStoreOps.delete(assetRef)
                        if (retryRows > 0) {
                            results[idx] = ItemCommitResultDto(
                                mediaId = item.mediaId,
                                decision = item.decision,
                                outcome = OUTCOME_PERMANENTLY_DELETED,
                                reclaimedBytes = item.originalSizeBytes,
                                isPlatformTrash = false
                            )
                        } else {
                            results[idx] = ItemCommitResultDto(
                                mediaId = item.mediaId,
                                decision = item.decision,
                                outcome = OUTCOME_FAILED,
                                reclaimedBytes = 0L,
                                error = "Delete returned 0 rows after consent"
                            )
                        }
                    } catch (ex: Exception) {
                        results[idx] = ItemCommitResultDto(
                            mediaId = item.mediaId,
                            decision = item.decision,
                            outcome = OUTCOME_FAILED,
                            reclaimedBytes = 0L,
                            error = ex.message ?: "Deletion failed after consent"
                        )
                    }
                } else {
                    results[idx] = ItemCommitResultDto(
                        mediaId = item.mediaId,
                        decision = item.decision,
                        outcome = OUTCOME_DENIED,
                        reclaimedBytes = 0L,
                        error = "User cancelled delete consent"
                    )
                }
            } else {
                results[idx] = ItemCommitResultDto(
                    mediaId = item.mediaId,
                    decision = item.decision,
                    outcome = OUTCOME_DENIED,
                    reclaimedBytes = 0L,
                    error = e.message ?: "Permission denied for deletion"
                )
            }
        } catch (e: Exception) {
            results[idx] = ItemCommitResultDto(
                mediaId = item.mediaId,
                decision = item.decision,
                outcome = OUTCOME_FAILED,
                reclaimedBytes = 0L,
                error = e.message ?: "Deletion failed"
            )
        }
    }

    private fun commitCompressItemApi29(
        idx: Int,
        item: CommitRequestItemDto,
        assetRef: String,
        results: Array<ItemCommitResultDto?>,
        consentRequester: ConsentRequester?
    ) {
        val candidate = item.candidate
        if (candidate == null || !candidate.isValid) {
            results[idx] = ItemCommitResultDto(
                mediaId = item.mediaId,
                decision = "COMPRESS",
                outcome = OUTCOME_FAILED,
                reclaimedBytes = 0L,
                error = "No valid compression candidate available"
            )
            return
        }

        val stagedFile = File(candidate.stagedPath)
        if (!stagedFile.exists() || stagedFile.length() <= 0L) {
            results[idx] = ItemCommitResultDto(
                mediaId = item.mediaId,
                decision = "COMPRESS",
                outcome = OUTCOME_FAILED,
                reclaimedBytes = 0L,
                error = "Staged compressed file is missing or empty"
            )
            return
        }

        val isVideo = candidate.mimeType.startsWith("video/")
        val replacementAssetRef = try {
            mediaStoreOps.insertReplacement(
                displayName = stagedFile.name,
                mimeType = candidate.mimeType,
                isVideo = isVideo,
                isPending = true
            )
        } catch (e: Exception) {
            null
        }

        if (replacementAssetRef == null) {
            results[idx] = ItemCommitResultDto(
                mediaId = item.mediaId,
                decision = "COMPRESS",
                outcome = OUTCOME_FAILED,
                reclaimedBytes = 0L,
                error = "Failed to create replacement MediaStore entry"
            )
            return
        }

        var writeOk = false
        try {
            FileInputStream(stagedFile).use { input ->
                mediaStoreOps.openOutputStream(replacementAssetRef)?.use { output ->
                    input.copyTo(output)
                    output.flush()
                    writeOk = true
                } ?: throw IllegalStateException("Cannot open output stream for replacement")
            }
        } catch (e: Exception) {
            try {
                mediaStoreOps.delete(replacementAssetRef)
            } catch (ignored: Exception) {}
            results[idx] = ItemCommitResultDto(
                mediaId = item.mediaId,
                decision = "COMPRESS",
                outcome = OUTCOME_FAILED,
                reclaimedBytes = 0L,
                error = "Failed writing replacement bytes: ${e.message}"
            )
            return
        }

        if (!writeOk) {
            try {
                mediaStoreOps.delete(replacementAssetRef)
            } catch (ignored: Exception) {}
            results[idx] = ItemCommitResultDto(
                mediaId = item.mediaId,
                decision = "COMPRESS",
                outcome = OUTCOME_FAILED,
                reclaimedBytes = 0L,
                error = "Failed writing replacement bytes"
            )
            return
        }

        mediaStoreOps.setPending(replacementAssetRef, false)

        var originalDeleted = false
        var userDenied = false
        var deleteError: String? = null

        try {
            val rows = mediaStoreOps.delete(assetRef)
            if (rows > 0) {
                originalDeleted = true
            } else {
                deleteError = "MediaStore delete returned 0 rows"
            }
        } catch (e: SecurityException) {
            val intentSender = mediaStoreOps.extractRecoverableIntentSender(e)
            if (intentSender != null) {
                val approved = consentRequester?.requestConsent(intentSender) ?: false
                if (approved) {
                    try {
                        val retryRows = mediaStoreOps.delete(assetRef)
                        if (retryRows > 0) {
                            originalDeleted = true
                        } else {
                            deleteError = "Delete returned 0 rows after consent"
                        }
                    } catch (ex: Exception) {
                        deleteError = ex.message ?: "Deletion failed after consent"
                    }
                } else {
                    userDenied = true
                    deleteError = "User cancelled delete consent"
                }
            } else {
                userDenied = true
                deleteError = e.message ?: "Permission denied for deletion"
            }
        } catch (e: Exception) {
            deleteError = e.message ?: "Deletion failed"
        }

        if (originalDeleted) {
            try {
                stagedFile.delete()
            } catch (ignored: Exception) {}
            results[idx] = ItemCommitResultDto(
                mediaId = item.mediaId,
                decision = "COMPRESS",
                outcome = OUTCOME_REPLACED,
                reclaimedBytes = candidate.measuredSavingsBytes,
                isPlatformTrash = false
            )
        } else {
            try {
                mediaStoreOps.delete(replacementAssetRef)
            } catch (ignored: Exception) {}
            results[idx] = ItemCommitResultDto(
                mediaId = item.mediaId,
                decision = "COMPRESS",
                outcome = if (userDenied) OUTCOME_DENIED else OUTCOME_FAILED,
                reclaimedBytes = 0L,
                error = if (userDenied) "Original removal denied by user: $deleteError" else "Original could not be removed: $deleteError"
            )
        }
    }

    /**
     * Android 9 and lower (API <= 28): Standard direct deletion.
     */
    private fun commitBatchLegacy(
        items: List<CommitRequestItemDto>,
        indices: List<Int>,
        results: Array<ItemCommitResultDto?>
    ) {
        for (idx in indices) {
            val item = items[idx]
            val assetRef = resolveAssetRef(item)
            if (assetRef == null || !mediaStoreOps.isValidAsset(assetRef)) {
                results[idx] = ItemCommitResultDto(
                    mediaId = item.mediaId,
                    decision = item.decision,
                    outcome = OUTCOME_FAILED,
                    reclaimedBytes = 0L,
                    error = "Invalid asset URI"
                )
                continue
            }

            if (item.decision.equals("COMPRESS", ignoreCase = true)) {
                val candidate = item.candidate
                if (candidate == null || !candidate.isValid) {
                    results[idx] = ItemCommitResultDto(
                        mediaId = item.mediaId,
                        decision = "COMPRESS",
                        outcome = OUTCOME_FAILED,
                        reclaimedBytes = 0L,
                        error = "No valid compression candidate available"
                    )
                    continue
                }

                val stagedFile = File(candidate.stagedPath)
                if (!stagedFile.exists() || stagedFile.length() <= 0L) {
                    results[idx] = ItemCommitResultDto(
                        mediaId = item.mediaId,
                        decision = "COMPRESS",
                        outcome = OUTCOME_FAILED,
                        reclaimedBytes = 0L,
                        error = "Staged compressed file is missing or empty"
                    )
                    continue
                }

                val isVideo = candidate.mimeType.startsWith("video/")
                val replacementAssetRef = try {
                    mediaStoreOps.insertReplacement(
                        displayName = stagedFile.name,
                        mimeType = candidate.mimeType,
                        isVideo = isVideo,
                        isPending = false
                    )
                } catch (e: Exception) {
                    null
                }

                if (replacementAssetRef == null) {
                    results[idx] = ItemCommitResultDto(
                        mediaId = item.mediaId,
                        decision = "COMPRESS",
                        outcome = OUTCOME_FAILED,
                        reclaimedBytes = 0L,
                        error = "Failed to create replacement MediaStore entry"
                    )
                    continue
                }

                var writeOk = false
                try {
                    FileInputStream(stagedFile).use { input ->
                        mediaStoreOps.openOutputStream(replacementAssetRef)?.use { output ->
                            input.copyTo(output)
                            output.flush()
                            writeOk = true
                        } ?: throw IllegalStateException("Cannot open output stream for replacement")
                    }
                } catch (e: Exception) {
                    try {
                        mediaStoreOps.delete(replacementAssetRef)
                    } catch (ignored: Exception) {}
                    results[idx] = ItemCommitResultDto(
                        mediaId = item.mediaId,
                        decision = "COMPRESS",
                        outcome = OUTCOME_FAILED,
                        reclaimedBytes = 0L,
                        error = "Failed writing replacement bytes: ${e.message}"
                    )
                    continue
                }

                if (!writeOk) {
                    try {
                        mediaStoreOps.delete(replacementAssetRef)
                    } catch (ignored: Exception) {}
                    results[idx] = ItemCommitResultDto(
                        mediaId = item.mediaId,
                        decision = "COMPRESS",
                        outcome = OUTCOME_FAILED,
                        reclaimedBytes = 0L,
                        error = "Failed writing replacement bytes"
                    )
                    continue
                }

                val rows = try {
                    mediaStoreOps.delete(assetRef)
                } catch (e: Exception) {
                    0
                }

                if (rows > 0) {
                    try {
                        stagedFile.delete()
                    } catch (ignored: Exception) {}
                    results[idx] = ItemCommitResultDto(
                        mediaId = item.mediaId,
                        decision = "COMPRESS",
                        outcome = OUTCOME_REPLACED,
                        reclaimedBytes = candidate.measuredSavingsBytes,
                        isPlatformTrash = false
                    )
                } else {
                    try {
                        mediaStoreOps.delete(replacementAssetRef)
                    } catch (ignored: Exception) {}
                    results[idx] = ItemCommitResultDto(
                        mediaId = item.mediaId,
                        decision = "COMPRESS",
                        outcome = OUTCOME_FAILED,
                        reclaimedBytes = 0L,
                        error = "Failed to remove original asset"
                    )
                }
            } else {
                try {
                    val rows = mediaStoreOps.delete(assetRef)
                    if (rows > 0) {
                        results[idx] = ItemCommitResultDto(
                            mediaId = item.mediaId,
                            decision = item.decision,
                            outcome = OUTCOME_PERMANENTLY_DELETED,
                            reclaimedBytes = item.originalSizeBytes,
                            isPlatformTrash = false
                        )
                    } else {
                        results[idx] = ItemCommitResultDto(
                            mediaId = item.mediaId,
                            decision = item.decision,
                            outcome = OUTCOME_FAILED,
                            reclaimedBytes = 0L,
                            error = "Delete returned 0 rows"
                        )
                    }
                } catch (e: SecurityException) {
                    results[idx] = ItemCommitResultDto(
                        mediaId = item.mediaId,
                        decision = item.decision,
                        outcome = OUTCOME_DENIED,
                        reclaimedBytes = 0L,
                        error = e.message ?: "Permission denied"
                    )
                } catch (e: Exception) {
                    results[idx] = ItemCommitResultDto(
                        mediaId = item.mediaId,
                        decision = item.decision,
                        outcome = OUTCOME_FAILED,
                        reclaimedBytes = 0L,
                        error = e.message ?: "Deletion failed"
                    )
                }
            }
        }
    }

    private fun buildSummary(
        items: List<CommitRequestItemDto>,
        results: Array<ItemCommitResultDto?>
    ): BatchCommitSummaryDto {
        val nonNullResults = results.mapIndexed { idx, res ->
            res ?: ItemCommitResultDto(
                mediaId = items[idx].mediaId,
                decision = items[idx].decision,
                outcome = OUTCOME_FAILED,
                reclaimedBytes = 0L,
                error = "Item was not processed"
            )
        }

        var succeeded = 0
        var failed = 0
        var denied = 0
        var totalReclaimedBytes = 0L

        for (result in nonNullResults) {
            when (result.outcome) {
                OUTCOME_KEPT, OUTCOME_TRASHED, OUTCOME_PERMANENTLY_DELETED, OUTCOME_REPLACED, OUTCOME_SKIPPED -> {
                    succeeded++
                    totalReclaimedBytes += result.reclaimedBytes
                }
                OUTCOME_DENIED -> {
                    denied++
                }
                OUTCOME_FAILED -> {
                    failed++
                }
            }
        }

        return BatchCommitSummaryDto(
            totalRequested = items.size,
            succeeded = succeeded,
            failed = failed,
            denied = denied,
            totalReclaimedBytes = totalReclaimedBytes,
            results = nonNullResults
        )
    }
}
