package com.keepr.processing

import androidx.exifinterface.media.ExifInterface
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AndroidCompressorTest {

    @Test
    fun testCalculateTargetDimensions_DownscaleLandscape() {
        val (w, h) = AndroidCompressor.calculateTargetDimensions(
            srcWidth = 4000,
            srcHeight = 3000,
            maxDimension = 2560
        )
        assertEquals(2560, w)
        assertEquals(1920, h)
    }

    @Test
    fun testCalculateTargetDimensions_DownscalePortrait() {
        val (w, h) = AndroidCompressor.calculateTargetDimensions(
            srcWidth = 3000,
            srcHeight = 5000,
            maxDimension = 2560
        )
        assertEquals(1536, w)
        assertEquals(2560, h)
    }

    @Test
    fun testCalculateTargetDimensions_DoNotUpscaleSmallerImages() {
        val (w, h) = AndroidCompressor.calculateTargetDimensions(
            srcWidth = 1920,
            srcHeight = 1080,
            maxDimension = 2560
        )
        assertEquals(1920, w)
        assertEquals(1080, h)
    }

    @Test
    fun testCalculateTargetDimensions_ExactMax() {
        val (w, h) = AndroidCompressor.calculateTargetDimensions(
            srcWidth = 2560,
            srcHeight = 1440,
            maxDimension = 2560
        )
        assertEquals(2560, w)
        assertEquals(1440, h)
    }

    @Test
    fun testCalculateTargetDimensions_Video1080p() {
        val (w, h) = AndroidCompressor.calculateTargetDimensions(
            srcWidth = 3840,
            srcHeight = 2160,
            maxDimension = 1920
        )
        assertEquals(1920, w)
        assertEquals(1080, h)
    }

    @Test
    fun testCalculateInSampleSize() {
        // Same size or smaller
        assertEquals(1, AndroidCompressor.calculateInSampleSize(1920, 1080, 1920, 1080))

        // 2x larger
        assertEquals(2, AndroidCompressor.calculateInSampleSize(4000, 2000, 2000, 1000))

        // 4x larger
        assertEquals(4, AndroidCompressor.calculateInSampleSize(8000, 4000, 2000, 1000))
    }

    @Test
    fun testPreservedExifTagsContainRequiredKeys() {
        val tags = AndroidCompressor.PRESERVED_EXIF_TAGS

        // Timestamp tags
        assertTrue(tags.contains(ExifInterface.TAG_DATETIME))
        assertTrue(tags.contains(ExifInterface.TAG_DATETIME_ORIGINAL))
        assertTrue(tags.contains(ExifInterface.TAG_DATETIME_DIGITIZED))

        // Device tags
        assertTrue(tags.contains(ExifInterface.TAG_MAKE))
        assertTrue(tags.contains(ExifInterface.TAG_MODEL))

        // Camera attributes
        assertTrue(tags.contains(ExifInterface.TAG_FOCAL_LENGTH))
        assertTrue(tags.contains(ExifInterface.TAG_FLASH))
        assertTrue(tags.contains(ExifInterface.TAG_WHITE_BALANCE))
        assertTrue(tags.contains(ExifInterface.TAG_EXPOSURE_TIME))
        assertTrue(tags.contains(ExifInterface.TAG_F_NUMBER))
        assertTrue(tags.contains(ExifInterface.TAG_PHOTOGRAPHIC_SENSITIVITY))

        // GPS tags
        assertTrue(tags.contains(ExifInterface.TAG_GPS_LATITUDE))
        assertTrue(tags.contains(ExifInterface.TAG_GPS_LATITUDE_REF))
        assertTrue(tags.contains(ExifInterface.TAG_GPS_LONGITUDE))
        assertTrue(tags.contains(ExifInterface.TAG_GPS_LONGITUDE_REF))
        assertTrue(tags.contains(ExifInterface.TAG_GPS_ALTITUDE))
        assertTrue(tags.contains(ExifInterface.TAG_GPS_TIMESTAMP))
        assertTrue(tags.contains(ExifInterface.TAG_GPS_DATESTAMP))
    }
}
