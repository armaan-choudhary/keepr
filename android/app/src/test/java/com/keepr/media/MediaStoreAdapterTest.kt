package com.keepr.media

import android.Manifest
import android.os.Build
import android.provider.MediaStore
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MediaStoreAdapterTest {

    @Test
    fun testPermissionMatrix_Android14_FullAccess() {
        val state = MediaStoreAdapter.evaluateAuthorizationState(
            sdkInt = 34,
            readExternalGranted = false,
            readImagesGranted = true,
            readVideoGranted = true,
            readVisualUserSelectedGranted = false,
            requestedMediaTypes = listOf("IMAGE", "VIDEO")
        )
        assertEquals("authorized", state.status)
        assertEquals("full", state.scope)
        assertFalse(state.canSelectMore)
    }

    @Test
    fun testPermissionMatrix_Android14_SelectedAccess() {
        val state = MediaStoreAdapter.evaluateAuthorizationState(
            sdkInt = 34,
            readExternalGranted = false,
            readImagesGranted = false,
            readVideoGranted = false,
            readVisualUserSelectedGranted = true,
            requestedMediaTypes = listOf("IMAGE", "VIDEO")
        )
        assertEquals("limited", state.status)
        assertEquals("selected", state.scope)
        assertTrue(state.canSelectMore)
    }

    @Test
    fun testPermissionMatrix_Android14_Denied() {
        val state = MediaStoreAdapter.evaluateAuthorizationState(
            sdkInt = 34,
            readExternalGranted = false,
            readImagesGranted = false,
            readVideoGranted = false,
            readVisualUserSelectedGranted = false,
            requestedMediaTypes = listOf("IMAGE", "VIDEO")
        )
        assertEquals("denied", state.status)
        assertEquals("none", state.scope)
        assertFalse(state.canSelectMore)
    }

    @Test
    fun testPermissionMatrix_Android13_Granted() {
        val state = MediaStoreAdapter.evaluateAuthorizationState(
            sdkInt = 33,
            readExternalGranted = false,
            readImagesGranted = true,
            readVideoGranted = true,
            readVisualUserSelectedGranted = false,
            requestedMediaTypes = listOf("IMAGE", "VIDEO")
        )
        assertEquals("authorized", state.status)
        assertEquals("full", state.scope)
        assertFalse(state.canSelectMore)
    }

    @Test
    fun testPermissionMatrix_Android13_Denied() {
        val state = MediaStoreAdapter.evaluateAuthorizationState(
            sdkInt = 33,
            readExternalGranted = false,
            readImagesGranted = false,
            readVideoGranted = false,
            readVisualUserSelectedGranted = false,
            requestedMediaTypes = listOf("IMAGE", "VIDEO")
        )
        assertEquals("denied", state.status)
        assertEquals("none", state.scope)
        assertFalse(state.canSelectMore)
    }

    @Test
    fun testPermissionMatrix_Android10to12_Granted() {
        val state = MediaStoreAdapter.evaluateAuthorizationState(
            sdkInt = 30,
            readExternalGranted = true,
            readImagesGranted = false,
            readVideoGranted = false,
            readVisualUserSelectedGranted = false,
            requestedMediaTypes = listOf("IMAGE", "VIDEO")
        )
        assertEquals("authorized", state.status)
        assertEquals("full", state.scope)
        assertFalse(state.canSelectMore)
    }

    @Test
    fun testPermissionMatrix_Android10to12_Denied() {
        val state = MediaStoreAdapter.evaluateAuthorizationState(
            sdkInt = 29,
            readExternalGranted = false,
            readImagesGranted = false,
            readVideoGranted = false,
            readVisualUserSelectedGranted = false,
            requestedMediaTypes = listOf("IMAGE", "VIDEO")
        )
        assertEquals("denied", state.status)
        assertEquals("none", state.scope)
        assertFalse(state.canSelectMore)
    }

    @Test
    fun testRequiredPermissionsByApi() {
        val perms34 = MediaStoreAdapter.getRequiredPermissions(34, listOf("IMAGE", "VIDEO"))
        assertTrue(perms34.contains(Manifest.permission.READ_MEDIA_IMAGES))
        assertTrue(perms34.contains(Manifest.permission.READ_MEDIA_VIDEO))
        assertTrue(perms34.contains("android.permission.READ_MEDIA_VISUAL_USER_SELECTED"))

        val perms33 = MediaStoreAdapter.getRequiredPermissions(33, listOf("IMAGE", "VIDEO"))
        assertTrue(perms33.contains(Manifest.permission.READ_MEDIA_IMAGES))
        assertTrue(perms33.contains(Manifest.permission.READ_MEDIA_VIDEO))
        assertFalse(perms33.contains("android.permission.READ_MEDIA_VISUAL_USER_SELECTED"))

        val perms29 = MediaStoreAdapter.getRequiredPermissions(29, listOf("IMAGE", "VIDEO"))
        assertEquals(1, perms29.size)
        assertEquals(Manifest.permission.READ_EXTERNAL_STORAGE, perms29[0])
    }

    @Test
    fun testQueryBuilding_DefaultFilter() {
        val filter = MediaQueryFilter(pageSize = 50, pageToken = "100")
        val (selection, args, sortOrder) = MediaStoreAdapter.buildQueryArgs(filter, offset = 100, limit = 50)

        assertTrue(selection.contains(MediaStore.Files.FileColumns.MEDIA_TYPE_IMAGE.toString()))
        assertTrue(selection.contains(MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO.toString()))
        assertTrue(sortOrder.contains("LIMIT 50 OFFSET 100"))
        assertTrue(sortOrder.contains("DESC"))
    }

    @Test
    fun testQueryBuilding_ImagesOnly() {
        val filter = MediaQueryFilter(mediaTypes = listOf("IMAGE"))
        val (selection, _, _) = MediaStoreAdapter.buildQueryArgs(filter, offset = 0, limit = 20)

        assertTrue(selection.contains("${MediaStore.Files.FileColumns.MEDIA_TYPE} = ${MediaStore.Files.FileColumns.MEDIA_TYPE_IMAGE}"))
        assertFalse(selection.contains("${MediaStore.Files.FileColumns.MEDIA_TYPE} = ${MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO}"))
    }

    @Test
    fun testQueryBuilding_AlbumAndSizeFilter() {
        val filter = MediaQueryFilter(
            albumId = "12345",
            minSizeBytes = 1000L,
            maxSizeBytes = 50000L,
            sortBy = "size",
            sortOrder = "asc"
        )
        val (selection, args, sortOrder) = MediaStoreAdapter.buildQueryArgs(filter, offset = 0, limit = 30)

        assertTrue(selection.contains("${MediaStore.Images.Media.BUCKET_ID} = ?"))
        assertTrue(selection.contains("${MediaStore.Files.FileColumns.SIZE} >= ?"))
        assertTrue(selection.contains("${MediaStore.Files.FileColumns.SIZE} <= ?"))
        assertEquals(3, args.size)
        assertEquals("12345", args[0])
        assertEquals("1000", args[1])
        assertEquals("50000", args[2])
        assertTrue(sortOrder.contains("${MediaStore.Files.FileColumns.SIZE} ASC"))
    }

    @Test
    fun testQueryBuilding_ScreenshotFilter() {
        val filter = MediaQueryFilter(isScreenshot = true)
        val (selection, _, _) = MediaStoreAdapter.buildQueryArgs(filter, offset = 0, limit = 10)

        assertTrue(selection.contains("Screenshot"))
    }
}
