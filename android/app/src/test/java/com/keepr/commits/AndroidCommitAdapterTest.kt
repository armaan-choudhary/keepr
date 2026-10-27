package com.keepr.commits

import android.content.IntentSender
import com.keepr.processing.CompressionCandidateDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.io.OutputStream

class AndroidCommitAdapterTest {

    companion object {
        fun createTestIntentSender(): IntentSender {
            val constructor = IntentSender::class.java.declaredConstructors[0]
            constructor.isAccessible = true
            val params = arrayOfNulls<Any>(constructor.parameterTypes.size)
            return constructor.newInstance(*params) as IntentSender
        }

        fun createTestCandidate(
            originalId: String = "test-1",
            stagedPath: String = "",
            stagedSizeBytes: Long = 1024L,
            originalSizeBytes: Long = 5000000L,
            estimatedSavingsBytes: Long = 3500000L,
            measuredSavingsBytes: Long = 3500000L,
            width: Int = 2560,
            height: Int = 1920,
            mimeType: String = "image/jpeg",
            isSmaller: Boolean = true,
            isValid: Boolean = true,
            error: String? = null
        ): CompressionCandidateDto {
            return CompressionCandidateDto(
                originalId = originalId,
                stagedPath = stagedPath,
                stagedSizeBytes = stagedSizeBytes,
                originalSizeBytes = originalSizeBytes,
                estimatedSavingsBytes = estimatedSavingsBytes,
                measuredSavingsBytes = measuredSavingsBytes,
                width = width,
                height = height,
                mimeType = mimeType,
                isSmaller = isSmaller,
                isValid = isValid,
                error = error
            )
        }
    }

    class FakeMediaStoreOps(
        var deleteResult: Int = 1,
        var deleteException: SecurityException? = null,
        var recoverableException: SecurityException? = null,
        var failWrite: Boolean = false,
        var validAssets: Set<String> = setOf()
    ) : MediaStoreOps {
        val testIntentSender: IntentSender = createTestIntentSender()
        var isTrashRequestCreated = false
        var isDeleteRequestCreated = false
        var trashAssetRefs: List<String>? = null
        var deleteAssetRefs: List<String>? = null
        val insertedAssetRefs = mutableListOf<String>()
        val deletedAssetRefs = mutableListOf<String>()
        val pendingStates = mutableMapOf<String, Boolean>()
        val writtenBytes = mutableMapOf<String, ByteArrayOutputStream>()

        override fun isValidAsset(assetRef: String): Boolean {
            return assetRef.startsWith("content://") || validAssets.contains(assetRef)
        }

        override fun createTrashRequest(assetRefs: List<String>, isTrashed: Boolean): IntentSender? {
            isTrashRequestCreated = true
            trashAssetRefs = assetRefs
            return testIntentSender
        }

        override fun createDeleteRequest(assetRefs: List<String>): IntentSender? {
            isDeleteRequestCreated = true
            deleteAssetRefs = assetRefs
            return testIntentSender
        }

        override fun delete(assetRef: String): Int {
            deletedAssetRefs.add(assetRef)
            recoverableException?.let {
                val ex = it
                recoverableException = null
                throw ex
            }
            deleteException?.let { throw it }
            return deleteResult
        }

        override fun insertReplacement(
            displayName: String,
            mimeType: String,
            isVideo: Boolean,
            isPending: Boolean
        ): String? {
            val ref = "content://media/external/images/media/replacement_${insertedAssetRefs.size + 1}"
            insertedAssetRefs.add(ref)
            pendingStates[ref] = isPending
            return ref
        }

        override fun setPending(assetRef: String, isPending: Boolean): Int {
            pendingStates[assetRef] = isPending
            return 1
        }

        override fun openOutputStream(assetRef: String): OutputStream? {
            if (failWrite) throw IOException("Disk write failure")
            val baos = ByteArrayOutputStream()
            writtenBytes[assetRef] = baos
            return baos
        }

        override fun extractRecoverableIntentSender(e: SecurityException): IntentSender? {
            return if (e.message == "RECOVERABLE") testIntentSender else null
        }
    }

    @Test
    fun testCanTrash_ApiMatrix() {
        assertTrue(AndroidCommitAdapter.canTrash(34))
        assertTrue(AndroidCommitAdapter.canTrash(33))
        assertTrue(AndroidCommitAdapter.canTrash(30))
        assertFalse(AndroidCommitAdapter.canTrash(29))
        assertFalse(AndroidCommitAdapter.canTrash(28))
    }

    @Test
    fun testPlatformRecoveryDescription() {
        val desc30 = AndroidCommitAdapter.getPlatformRecoveryDescription(30)
        assertFalse("Description should not contain hardcoded 30 days promise", desc30.contains("30 days"))
        assertTrue("Description must explain system trash", desc30.contains("system trash"))
        assertTrue("Description must indicate retention is managed by Android/settings", desc30.contains("managed by Android"))

        val desc29 = AndroidCommitAdapter.getPlatformRecoveryDescription(29)
        assertTrue(desc29.contains("permanently deleted"))
        assertTrue(desc29.contains("Android 10 does not support system trash"))

        val desc28 = AndroidCommitAdapter.getPlatformRecoveryDescription(28)
        assertTrue(desc28.contains("permanently deleted from shared storage"))
    }

    @Test
    fun testCommitOutcomeConstants() {
        assertEquals("KEPT", AndroidCommitAdapter.OUTCOME_KEPT)
        assertEquals("TRASHED", AndroidCommitAdapter.OUTCOME_TRASHED)
        assertEquals("PERMANENTLY_DELETED", AndroidCommitAdapter.OUTCOME_PERMANENTLY_DELETED)
        assertEquals("REPLACED", AndroidCommitAdapter.OUTCOME_REPLACED)
        assertEquals("DENIED", AndroidCommitAdapter.OUTCOME_DENIED)
        assertEquals("FAILED", AndroidCommitAdapter.OUTCOME_FAILED)
        assertEquals("SKIPPED", AndroidCommitAdapter.OUTCOME_SKIPPED)
    }

    @Test
    fun testProtectedItemIsSkipped() {
        val fakeOps = FakeMediaStoreOps()
        val adapter = AndroidCommitAdapter(null, fakeOps, sdkInt = 30)

        val item = CommitRequestItemDto(
            mediaId = "101",
            decision = "DELETE",
            isProtected = true,
            assetRef = "content://media/external/images/media/101",
            originalSizeBytes = 5000000L
        )

        val summary = adapter.commitBatch(listOf(item)) { true }
        assertEquals(1, summary.totalRequested)
        assertEquals(1, summary.succeeded)
        assertEquals(0, summary.failed)
        assertEquals(0, summary.denied)
        assertEquals(0L, summary.totalReclaimedBytes)

        val result = summary.results[0]
        assertEquals(AndroidCommitAdapter.OUTCOME_SKIPPED, result.outcome)
        assertEquals("Protected item cannot be deleted or replaced", result.error)
        assertFalse(fakeOps.isTrashRequestCreated)
    }

    @Test
    fun testKeepDecisionReturnsKept() {
        val fakeOps = FakeMediaStoreOps()
        val adapter = AndroidCommitAdapter(null, fakeOps, sdkInt = 30)

        val item = CommitRequestItemDto(
            mediaId = "102",
            decision = "KEEP",
            assetRef = "content://media/external/images/media/102",
            originalSizeBytes = 4000000L
        )

        val summary = adapter.commitBatch(listOf(item)) { true }
        assertEquals(1, summary.totalRequested)
        assertEquals(1, summary.succeeded)
        assertEquals(0L, summary.totalReclaimedBytes)

        val result = summary.results[0]
        assertEquals(AndroidCommitAdapter.OUTCOME_KEPT, result.outcome)
        assertFalse(fakeOps.isTrashRequestCreated)
    }

    @Test
    fun testAndroid11_TrashConsentApproved() {
        val fakeOps = FakeMediaStoreOps()
        val adapter = AndroidCommitAdapter(null, fakeOps, sdkInt = 30)

        val item = CommitRequestItemDto(
            mediaId = "201",
            decision = "DELETE",
            assetRef = "content://media/external/images/media/201",
            originalSizeBytes = 5000000L
        )

        var consentPrompted = false
        val summary = adapter.commitBatch(listOf(item)) { sender ->
            consentPrompted = true
            assertNotNull(sender)
            true // User approves
        }

        assertTrue("User consent must be prompted via MediaStore.createTrashRequest", consentPrompted)
        assertTrue(fakeOps.isTrashRequestCreated)
        assertEquals(listOf("content://media/external/images/media/201"), fakeOps.trashAssetRefs)
        assertEquals(1, summary.succeeded)
        assertEquals(0, summary.denied)
        assertEquals(5000000L, summary.totalReclaimedBytes)

        val result = summary.results[0]
        assertEquals(AndroidCommitAdapter.OUTCOME_TRASHED, result.outcome)
        assertTrue(result.isPlatformTrash)
        assertEquals(5000000L, result.reclaimedBytes)
    }

    @Test
    fun testAndroid11_TrashConsentDenied() {
        val fakeOps = FakeMediaStoreOps()
        val adapter = AndroidCommitAdapter(null, fakeOps, sdkInt = 30)

        val item = CommitRequestItemDto(
            mediaId = "202",
            decision = "DELETE",
            assetRef = "content://media/external/images/media/202",
            originalSizeBytes = 5000000L
        )

        var consentPrompted = false
        val summary = adapter.commitBatch(listOf(item)) { sender ->
            consentPrompted = true
            false // User cancels / denies
        }

        assertTrue("User consent must be prompted", consentPrompted)
        assertTrue(fakeOps.isTrashRequestCreated)
        assertEquals(0, summary.succeeded)
        assertEquals(1, summary.denied)
        assertEquals(0L, summary.totalReclaimedBytes)

        val result = summary.results[0]
        assertEquals(AndroidCommitAdapter.OUTCOME_DENIED, result.outcome)
        assertFalse(result.isPlatformTrash)
        assertEquals(0L, result.reclaimedBytes)
    }

    @Test
    fun testAndroid11_PermanentDeleteConsentApproved() {
        val fakeOps = FakeMediaStoreOps()
        val adapter = AndroidCommitAdapter(null, fakeOps, sdkInt = 30)

        val item = CommitRequestItemDto(
            mediaId = "203",
            decision = "PERMANENT_DELETE",
            assetRef = "content://media/external/images/media/203",
            originalSizeBytes = 3000000L
        )

        var consentPrompted = false
        val summary = adapter.commitBatch(listOf(item)) { sender ->
            consentPrompted = true
            true // User approves
        }

        assertTrue(consentPrompted)
        assertTrue(fakeOps.isDeleteRequestCreated)
        assertEquals(listOf("content://media/external/images/media/203"), fakeOps.deleteAssetRefs)
        assertEquals(1, summary.succeeded)
        assertEquals(3000000L, summary.totalReclaimedBytes)

        val result = summary.results[0]
        assertEquals(AndroidCommitAdapter.OUTCOME_PERMANENTLY_DELETED, result.outcome)
        assertFalse(result.isPlatformTrash)
        assertEquals(3000000L, result.reclaimedBytes)
    }

    @Test
    fun testAndroid11_PermanentDeleteConsentDenied() {
        val fakeOps = FakeMediaStoreOps()
        val adapter = AndroidCommitAdapter(null, fakeOps, sdkInt = 30)

        val item = CommitRequestItemDto(
            mediaId = "204",
            decision = "PERMANENT_DELETE",
            assetRef = "content://media/external/images/media/204",
            originalSizeBytes = 3000000L
        )

        val summary = adapter.commitBatch(listOf(item)) { false }
        assertEquals(0, summary.succeeded)
        assertEquals(1, summary.denied)
        assertEquals(0L, summary.totalReclaimedBytes)

        val result = summary.results[0]
        assertEquals(AndroidCommitAdapter.OUTCOME_DENIED, result.outcome)
        assertEquals(0L, result.reclaimedBytes)
    }

    @Test
    fun testAndroid10_RecoverableSecurityException_ConsentApproved() {
        val fakeOps = FakeMediaStoreOps(
            recoverableException = SecurityException("RECOVERABLE")
        )
        val adapter = AndroidCommitAdapter(null, fakeOps, sdkInt = 29)

        val item = CommitRequestItemDto(
            mediaId = "301",
            decision = "DELETE",
            assetRef = "content://media/external/images/media/301",
            originalSizeBytes = 4000000L
        )

        var consentPrompted = false
        val summary = adapter.commitBatch(listOf(item)) { sender ->
            consentPrompted = true
            assertNotNull(sender)
            true // User approves
        }

        assertTrue("Android 10 must extract intentSender and request consent on RecoverableSecurityException", consentPrompted)
        assertEquals(1, summary.succeeded)
        assertEquals(0, summary.denied)
        assertEquals(4000000L, summary.totalReclaimedBytes)

        val result = summary.results[0]
        assertEquals(AndroidCommitAdapter.OUTCOME_PERMANENTLY_DELETED, result.outcome)
        assertFalse(result.isPlatformTrash)
        assertEquals(4000000L, result.reclaimedBytes)
        // Verify delete was attempted twice: initial failed with recoverable, second succeeded after consent
        assertEquals(2, fakeOps.deletedAssetRefs.size)
    }

    @Test
    fun testAndroid10_RecoverableSecurityException_ConsentDenied() {
        val fakeOps = FakeMediaStoreOps(
            recoverableException = SecurityException("RECOVERABLE")
        )
        val adapter = AndroidCommitAdapter(null, fakeOps, sdkInt = 29)

        val item = CommitRequestItemDto(
            mediaId = "302",
            decision = "DELETE",
            assetRef = "content://media/external/images/media/302",
            originalSizeBytes = 4000000L
        )

        var consentPrompted = false
        val summary = adapter.commitBatch(listOf(item)) { sender ->
            consentPrompted = true
            false // User cancels
        }

        assertTrue(consentPrompted)
        assertEquals(0, summary.succeeded)
        assertEquals(1, summary.denied)
        assertEquals(0L, summary.totalReclaimedBytes)

        val result = summary.results[0]
        assertEquals(AndroidCommitAdapter.OUTCOME_DENIED, result.outcome)
        assertEquals(0L, result.reclaimedBytes)
        assertEquals(1, fakeOps.deletedAssetRefs.size) // Only initial delete attempted
    }

    @Test
    fun testAndroid10_DirectDeleteSucceeds() {
        val fakeOps = FakeMediaStoreOps(deleteResult = 1)
        val adapter = AndroidCommitAdapter(null, fakeOps, sdkInt = 29)

        val item = CommitRequestItemDto(
            mediaId = "303",
            decision = "DELETE",
            assetRef = "content://media/external/images/media/303",
            originalSizeBytes = 2000000L
        )

        val summary = adapter.commitBatch(listOf(item)) { false }
        assertEquals(1, summary.succeeded)
        assertEquals(2000000L, summary.totalReclaimedBytes)

        val result = summary.results[0]
        assertEquals(AndroidCommitAdapter.OUTCOME_PERMANENTLY_DELETED, result.outcome)
    }

    @Test
    fun testCompressionReplacementOrder_Success() {
        val tempFile = File.createTempFile("keepr_test_staged", ".jpg")
        tempFile.writeBytes(ByteArray(1024) { 1 })

        try {
            val fakeOps = FakeMediaStoreOps()
            val adapter = AndroidCommitAdapter(null, fakeOps, sdkInt = 30)

            val candidate = createTestCandidate(
                originalId = "401",
                stagedPath = tempFile.absolutePath,
                stagedSizeBytes = 1024L,
                originalSizeBytes = 5000000L,
                estimatedSavingsBytes = 3500000L,
                measuredSavingsBytes = 3500000L,
                width = 2560,
                height = 1920,
                mimeType = "image/jpeg",
                isSmaller = true,
                isValid = true
            )

            val item = CommitRequestItemDto(
                mediaId = "401",
                decision = "COMPRESS",
                candidate = candidate,
                assetRef = "content://media/external/images/media/401",
                originalSizeBytes = 5000000L
            )

            var consentPrompted = false
            val summary = adapter.commitBatch(listOf(item)) { sender ->
                consentPrompted = true
                true // User approves trashing of original
            }

            assertTrue(consentPrompted)
            assertEquals(1, fakeOps.insertedAssetRefs.size)
            val replacementRef = fakeOps.insertedAssetRefs[0]
            // Verify IS_PENDING was set to false (published) before trashing
            assertEquals(false, fakeOps.pendingStates[replacementRef])
            // Verify bytes were written to replacement
            assertTrue(fakeOps.writtenBytes.containsKey(replacementRef))
            assertEquals(1024, fakeOps.writtenBytes[replacementRef]?.size())

            assertEquals(1, summary.succeeded)
            assertEquals(3500000L, summary.totalReclaimedBytes)

            val result = summary.results[0]
            assertEquals(AndroidCommitAdapter.OUTCOME_REPLACED, result.outcome)
            assertEquals(3500000L, result.reclaimedBytes)
            assertTrue(result.isPlatformTrash)

            // Staged file should be deleted on success
            assertFalse(tempFile.exists())
        } finally {
            if (tempFile.exists()) tempFile.delete()
        }
    }

    @Test
    fun testCompressionReplacementOrder_ConsentDenied_CleansUpReplacement() {
        val tempFile = File.createTempFile("keepr_test_staged", ".jpg")
        tempFile.writeBytes(ByteArray(1024) { 1 })

        try {
            val fakeOps = FakeMediaStoreOps()
            val adapter = AndroidCommitAdapter(null, fakeOps, sdkInt = 30)

            val candidate = createTestCandidate(
                originalId = "402",
                stagedPath = tempFile.absolutePath,
                stagedSizeBytes = 1024L,
                originalSizeBytes = 5000000L,
                estimatedSavingsBytes = 3500000L,
                measuredSavingsBytes = 3500000L,
                width = 2560,
                height = 1920,
                mimeType = "image/jpeg",
                isSmaller = true,
                isValid = true
            )

            val item = CommitRequestItemDto(
                mediaId = "402",
                decision = "COMPRESS",
                candidate = candidate,
                assetRef = "content://media/external/images/media/402",
                originalSizeBytes = 5000000L
            )

            val summary = adapter.commitBatch(listOf(item)) { false } // User denies consent

            assertEquals(0, summary.succeeded)
            assertEquals(1, summary.denied)
            assertEquals(0L, summary.totalReclaimedBytes)

            val result = summary.results[0]
            assertEquals(AndroidCommitAdapter.OUTCOME_DENIED, result.outcome)
            assertEquals(0L, result.reclaimedBytes)

            // CRITICAL: Replacement in MediaStore MUST be cleaned up (deleted) when original removal is denied!
            assertEquals(1, fakeOps.insertedAssetRefs.size)
            val replacementRef = fakeOps.insertedAssetRefs[0]
            assertTrue("Replacement must be deleted from MediaStore if user denies original removal", fakeOps.deletedAssetRefs.contains(replacementRef))
        } finally {
            if (tempFile.exists()) tempFile.delete()
        }
    }

    @Test
    fun testCompressionReplacementOrder_CandidateInvalid_FailsBeforeMediaStoreInsert() {
        val fakeOps = FakeMediaStoreOps()
        val adapter = AndroidCommitAdapter(null, fakeOps, sdkInt = 30)

        val candidate = createTestCandidate(
            originalId = "403",
            stagedPath = "/non/existent/path.jpg",
            isValid = false
        )

        val item = CommitRequestItemDto(
            mediaId = "403",
            decision = "COMPRESS",
            candidate = candidate,
            assetRef = "content://media/external/images/media/403"
        )

        val summary = adapter.commitBatch(listOf(item)) { true }
        assertEquals(0, summary.succeeded)
        assertEquals(1, summary.failed)
        assertEquals(AndroidCommitAdapter.OUTCOME_FAILED, summary.results[0].outcome)
        assertEquals("No valid compression candidate available", summary.results[0].error)
        assertEquals(0, fakeOps.insertedAssetRefs.size)
        assertFalse(fakeOps.isTrashRequestCreated)
    }

    @Test
    fun testCompressionReplacementOrder_StagedFileMissing_FailsBeforeMediaStoreInsert() {
        val fakeOps = FakeMediaStoreOps()
        val adapter = AndroidCommitAdapter(null, fakeOps, sdkInt = 30)

        val candidate = createTestCandidate(
            originalId = "404",
            stagedPath = "/tmp/does_not_exist_staged_file_keepr.jpg",
            isValid = true
        )

        val item = CommitRequestItemDto(
            mediaId = "404",
            decision = "COMPRESS",
            candidate = candidate,
            assetRef = "content://media/external/images/media/404"
        )

        val summary = adapter.commitBatch(listOf(item)) { true }
        assertEquals(0, summary.succeeded)
        assertEquals(1, summary.failed)
        assertEquals(AndroidCommitAdapter.OUTCOME_FAILED, summary.results[0].outcome)
        assertEquals("Staged compressed file is missing or empty", summary.results[0].error)
        assertEquals(0, fakeOps.insertedAssetRefs.size)
        assertFalse(fakeOps.isTrashRequestCreated)
    }

    @Test
    fun testCompressionReplacementOrder_WriteBytesFailure_CleansUpReplacement() {
        val tempFile = File.createTempFile("keepr_test_staged", ".jpg")
        tempFile.writeBytes(ByteArray(1024) { 1 })

        try {
            val fakeOps = FakeMediaStoreOps(failWrite = true)
            val adapter = AndroidCommitAdapter(null, fakeOps, sdkInt = 30)

            val candidate = createTestCandidate(
                originalId = "405",
                stagedPath = tempFile.absolutePath,
                isValid = true,
                mimeType = "image/jpeg"
            )

            val item = CommitRequestItemDto(
                mediaId = "405",
                decision = "COMPRESS",
                candidate = candidate,
                assetRef = "content://media/external/images/media/405"
            )

            val summary = adapter.commitBatch(listOf(item)) { true }
            assertEquals(1, summary.failed)
            val result = summary.results[0]
            assertEquals(AndroidCommitAdapter.OUTCOME_FAILED, result.outcome)
            assertTrue(result.error?.contains("Failed writing replacement bytes") == true)

            // Replacement was created then cleaned up
            assertEquals(1, fakeOps.insertedAssetRefs.size)
            assertTrue(fakeOps.deletedAssetRefs.contains(fakeOps.insertedAssetRefs[0]))
            assertFalse(fakeOps.isTrashRequestCreated)
        } finally {
            if (tempFile.exists()) tempFile.delete()
        }
    }

    @Test
    fun testAndroid10_CompressionReplacement_ConsentApproved() {
        val tempFile = File.createTempFile("keepr_test_staged", ".jpg")
        tempFile.writeBytes(ByteArray(2048) { 1 })

        try {
            val fakeOps = FakeMediaStoreOps(
                recoverableException = SecurityException("RECOVERABLE")
            )
            val adapter = AndroidCommitAdapter(null, fakeOps, sdkInt = 29)

            val candidate = createTestCandidate(
                originalId = "501",
                stagedPath = tempFile.absolutePath,
                measuredSavingsBytes = 4000000L,
                mimeType = "image/jpeg",
                isValid = true
            )

            val item = CommitRequestItemDto(
                mediaId = "501",
                decision = "COMPRESS",
                candidate = candidate,
                assetRef = "content://media/external/images/media/501",
                originalSizeBytes = 6000000L
            )

            var consentPrompted = false
            val summary = adapter.commitBatch(listOf(item)) { sender ->
                consentPrompted = true
                assertNotNull(sender)
                true // User approves consent for original deletion
            }

            assertTrue(consentPrompted)
            assertEquals(1, summary.succeeded)
            assertEquals(4000000L, summary.totalReclaimedBytes)

            val result = summary.results[0]
            assertEquals(AndroidCommitAdapter.OUTCOME_REPLACED, result.outcome)
            assertEquals(4000000L, result.reclaimedBytes)
            assertFalse(result.isPlatformTrash)
            assertFalse(tempFile.exists())
        } finally {
            if (tempFile.exists()) tempFile.delete()
        }
    }

    @Test
    fun testAndroid10_CompressionReplacement_ConsentDenied_CleansUpReplacement() {
        val tempFile = File.createTempFile("keepr_test_staged", ".jpg")
        tempFile.writeBytes(ByteArray(2048) { 1 })

        try {
            val fakeOps = FakeMediaStoreOps(
                recoverableException = SecurityException("RECOVERABLE")
            )
            val adapter = AndroidCommitAdapter(null, fakeOps, sdkInt = 29)

            val candidate = createTestCandidate(
                originalId = "502",
                stagedPath = tempFile.absolutePath,
                measuredSavingsBytes = 4000000L,
                mimeType = "image/jpeg",
                isValid = true
            )

            val item = CommitRequestItemDto(
                mediaId = "502",
                decision = "COMPRESS",
                candidate = candidate,
                assetRef = "content://media/external/images/media/502",
                originalSizeBytes = 6000000L
            )

            val summary = adapter.commitBatch(listOf(item)) { false } // User cancels consent

            assertEquals(0, summary.succeeded)
            assertEquals(1, summary.denied)
            assertEquals(0L, summary.totalReclaimedBytes)

            val result = summary.results[0]
            assertEquals(AndroidCommitAdapter.OUTCOME_DENIED, result.outcome)

            // Replacement MUST be deleted from MediaStore, original intact
            val replacementRef = fakeOps.insertedAssetRefs[0]
            assertTrue("Replacement must be deleted when user denies removal of original on Android 10", fakeOps.deletedAssetRefs.contains(replacementRef))
        } finally {
            if (tempFile.exists()) tempFile.delete()
        }
    }

    @Test
    fun testBatchCommitSummaryCalculation() {
        val results = listOf(
            ItemCommitResultDto(
                mediaId = "1",
                decision = "KEEP",
                outcome = AndroidCommitAdapter.OUTCOME_KEPT,
                reclaimedBytes = 0L
            ),
            ItemCommitResultDto(
                mediaId = "2",
                decision = "DELETE",
                outcome = AndroidCommitAdapter.OUTCOME_TRASHED,
                reclaimedBytes = 1500000L,
                isPlatformTrash = true
            ),
            ItemCommitResultDto(
                mediaId = "3",
                decision = "COMPRESS",
                outcome = AndroidCommitAdapter.OUTCOME_REPLACED,
                reclaimedBytes = 2500000L
            ),
            ItemCommitResultDto(
                mediaId = "4",
                decision = "DELETE",
                outcome = AndroidCommitAdapter.OUTCOME_DENIED,
                reclaimedBytes = 0L,
                error = "User denied deletion consent"
            ),
            ItemCommitResultDto(
                mediaId = "5",
                decision = "DELETE",
                outcome = AndroidCommitAdapter.OUTCOME_FAILED,
                reclaimedBytes = 0L,
                error = "IO failure"
            )
        )

        var succeeded = 0
        var failed = 0
        var denied = 0
        var totalReclaimed = 0L

        for (res in results) {
            when (res.outcome) {
                AndroidCommitAdapter.OUTCOME_KEPT,
                AndroidCommitAdapter.OUTCOME_TRASHED,
                AndroidCommitAdapter.OUTCOME_PERMANENTLY_DELETED,
                AndroidCommitAdapter.OUTCOME_REPLACED,
                AndroidCommitAdapter.OUTCOME_SKIPPED -> {
                    succeeded++
                    totalReclaimed += res.reclaimedBytes
                }
                AndroidCommitAdapter.OUTCOME_DENIED -> denied++
                AndroidCommitAdapter.OUTCOME_FAILED -> failed++
            }
        }

        val summary = BatchCommitSummaryDto(
            totalRequested = results.size,
            succeeded = succeeded,
            failed = failed,
            denied = denied,
            totalReclaimedBytes = totalReclaimed,
            results = results
        )

        assertEquals(5, summary.totalRequested)
        assertEquals(3, summary.succeeded)
        assertEquals(1, summary.failed)
        assertEquals(1, summary.denied)
        assertEquals(4000000L, summary.totalReclaimedBytes)
    }
}
