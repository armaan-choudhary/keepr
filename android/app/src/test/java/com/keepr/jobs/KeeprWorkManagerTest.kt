package com.keepr.jobs

import androidx.work.WorkInfo
import org.junit.Assert.assertEquals
import org.junit.Test

class KeeprWorkManagerTest {

    @Test
    fun testMapWorkStateToJobStatus() {
        assertEquals("PENDING", KeeprWorkManager.mapWorkStateToJobStatus(WorkInfo.State.ENQUEUED))
        assertEquals("RUNNING", KeeprWorkManager.mapWorkStateToJobStatus(WorkInfo.State.RUNNING))
        assertEquals("COMPLETED", KeeprWorkManager.mapWorkStateToJobStatus(WorkInfo.State.SUCCEEDED))
        assertEquals("FAILED", KeeprWorkManager.mapWorkStateToJobStatus(WorkInfo.State.FAILED))
        assertEquals("PENDING", KeeprWorkManager.mapWorkStateToJobStatus(WorkInfo.State.BLOCKED))
        assertEquals("CANCELLED", KeeprWorkManager.mapWorkStateToJobStatus(WorkInfo.State.CANCELLED))
        assertEquals("FAILED", KeeprWorkManager.mapWorkStateToJobStatus(null))
    }
}
