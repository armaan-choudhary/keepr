package com.keepr.processing

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.media.MediaMuxer
import android.net.Uri
import android.os.Build
import androidx.exifinterface.media.ExifInterface
import com.keepr.media.MediaItemDto
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.nio.ByteBuffer
import java.util.concurrent.CancellationException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean

data class CompressionCandidateDto(
    val originalId: String,
    val stagedPath: String,
    val stagedSizeBytes: Long,
    val originalSizeBytes: Long,
    val estimatedSavingsBytes: Long,
    val measuredSavingsBytes: Long,
    val width: Int,
    val height: Int,
    val mimeType: String,
    val isSmaller: Boolean,
    val isValid: Boolean,
    val error: String? = null
)

data class CompressionOptionsDto(
    val maxDimension: Int = 2560,
    val quality: Int = 85,
    val format: String = "AUTO", // 'WEBP' | 'JPEG' | 'AUTO'
    val preserveMetadata: Boolean = true,
    val targetBitrateKbps: Int? = null
)

class AndroidCompressor(private val context: Context) {

    private val cancellationTokens = ConcurrentHashMap<String, AtomicBoolean>()

    val stagingDir: File by lazy {
        File(context.filesDir, "keepr_staging").apply {
            if (!exists()) mkdirs()
        }
    }

    companion object {
        fun calculateTargetDimensions(srcWidth: Int, srcHeight: Int, maxDimension: Int = 2560): Pair<Int, Int> {
            if (srcWidth <= 0 || srcHeight <= 0) return Pair(srcWidth, srcHeight)
            val maxSrc = maxOf(srcWidth, srcHeight)
            if (maxSrc <= maxDimension) {
                return Pair(srcWidth, srcHeight) // do not upscale smaller images
            }
            val scale = maxDimension.toFloat() / maxSrc.toFloat()
            val targetWidth = (srcWidth * scale).toInt().coerceAtLeast(1)
            val targetHeight = (srcHeight * scale).toInt().coerceAtLeast(1)
            return Pair(targetWidth, targetHeight)
        }

        fun calculateInSampleSize(srcWidth: Int, srcHeight: Int, reqWidth: Int, reqHeight: Int): Int {
            var inSampleSize = 1
            if (srcHeight > reqHeight || srcWidth > reqWidth) {
                val halfHeight = srcHeight / 2
                val halfWidth = srcWidth / 2
                while ((halfHeight / inSampleSize) >= reqHeight && (halfWidth / inSampleSize) >= reqWidth) {
                    inSampleSize *= 2
                }
            }
            return inSampleSize
        }

        val PRESERVED_EXIF_TAGS = listOf(
            ExifInterface.TAG_DATETIME,
            ExifInterface.TAG_DATETIME_ORIGINAL,
            ExifInterface.TAG_DATETIME_DIGITIZED,
            ExifInterface.TAG_MAKE,
            ExifInterface.TAG_MODEL,
            ExifInterface.TAG_FOCAL_LENGTH,
            ExifInterface.TAG_FLASH,
            ExifInterface.TAG_WHITE_BALANCE,
            ExifInterface.TAG_EXPOSURE_TIME,
            ExifInterface.TAG_F_NUMBER,
            ExifInterface.TAG_PHOTOGRAPHIC_SENSITIVITY,
            ExifInterface.TAG_GPS_LATITUDE,
            ExifInterface.TAG_GPS_LATITUDE_REF,
            ExifInterface.TAG_GPS_LONGITUDE,
            ExifInterface.TAG_GPS_LONGITUDE_REF,
            ExifInterface.TAG_GPS_ALTITUDE,
            ExifInterface.TAG_GPS_ALTITUDE_REF,
            ExifInterface.TAG_GPS_TIMESTAMP,
            ExifInterface.TAG_GPS_DATESTAMP,
            ExifInterface.TAG_GPS_PROCESSING_METHOD,
            ExifInterface.TAG_SUBSEC_TIME,
            ExifInterface.TAG_SUBSEC_TIME_ORIGINAL,
            ExifInterface.TAG_SUBSEC_TIME_DIGITIZED
        )

        fun copyExif(sourceStream: InputStream, targetFile: File, normalizedOrientation: Boolean = true) {
            try {
                val sourceExif = ExifInterface(sourceStream)
                val targetExif = ExifInterface(targetFile.absolutePath)

                for (tag in PRESERVED_EXIF_TAGS) {
                    val value = sourceExif.getAttribute(tag)
                    if (value != null) {
                        targetExif.setAttribute(tag, value)
                    }
                }

                if (normalizedOrientation) {
                    targetExif.setAttribute(
                        ExifInterface.TAG_ORIENTATION,
                        ExifInterface.ORIENTATION_NORMAL.toString()
                    )
                } else {
                    val orientation = sourceExif.getAttribute(ExifInterface.TAG_ORIENTATION)
                    if (orientation != null) {
                        targetExif.setAttribute(ExifInterface.TAG_ORIENTATION, orientation)
                    }
                }

                targetExif.saveAttributes()
            } catch (e: Exception) {
                // Do not fail compression solely because an optional metadata field cannot be copied
            }
        }
    }

    fun compressImage(
        item: MediaItemDto,
        options: CompressionOptionsDto = CompressionOptionsDto()
    ): CompressionCandidateDto {
        val uri = Uri.parse(item.assetRef)
        val cancellationToken = AtomicBoolean(false)
        cancellationTokens[item.id] = cancellationToken

        try {
            if (cancellationToken.get()) throw CancellationException("Compression cancelled")

            // 1. Read bounds and orientation
            val boundsOptions = BitmapFactory.Options().apply {
                inJustDecodeBounds = true
            }
            context.contentResolver.openInputStream(uri)?.use { stream ->
                BitmapFactory.decodeStream(stream, null, boundsOptions)
            } ?: throw IllegalStateException("Cannot open input stream for ${item.assetRef}")

            val srcWidth = boundsOptions.outWidth
            val srcHeight = boundsOptions.outHeight
            if (srcWidth <= 0 || srcHeight <= 0) {
                throw IllegalStateException("Invalid image dimensions: ${srcWidth}x${srcHeight}")
            }

            // Read EXIF orientation
            var orientation = ExifInterface.ORIENTATION_NORMAL
            try {
                context.contentResolver.openInputStream(uri)?.use { stream ->
                    val exif = ExifInterface(stream)
                    orientation = exif.getAttributeInt(
                        ExifInterface.TAG_ORIENTATION,
                        ExifInterface.ORIENTATION_NORMAL
                    )
                }
            } catch (e: Exception) {
                // Ignore EXIF read failure
            }

            val isRotated90or270 = orientation == ExifInterface.ORIENTATION_ROTATE_90 ||
                    orientation == ExifInterface.ORIENTATION_ROTATE_270

            val effectiveWidth = if (isRotated90or270) srcHeight else srcWidth
            val effectiveHeight = if (isRotated90or270) srcWidth else srcHeight

            val maxDim = options.maxDimension.coerceAtLeast(320)
            val (targetWidth, targetHeight) = calculateTargetDimensions(effectiveWidth, effectiveHeight, maxDim)

            if (cancellationToken.get()) throw CancellationException("Compression cancelled")

            // 2. Decode bitmap with inSampleSize
            val decodeOptions = BitmapFactory.Options().apply {
                inSampleSize = calculateInSampleSize(effectiveWidth, effectiveHeight, targetWidth, targetHeight)
                inPreferredConfig = Bitmap.Config.ARGB_8888
            }

            val decodedBitmap = context.contentResolver.openInputStream(uri)?.use { stream ->
                BitmapFactory.decodeStream(stream, null, decodeOptions)
            } ?: throw IllegalStateException("Failed to decode bitmap from ${item.assetRef}")

            if (cancellationToken.get()) {
                decodedBitmap.recycle()
                throw CancellationException("Compression cancelled")
            }

            // 3. Rotate bitmap if needed to normalize orientation
            val matrix = Matrix()
            when (orientation) {
                ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
                ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
                ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
                ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.postScale(-1f, 1f)
                ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.postScale(1f, -1f)
            }

            val rotatedBitmap = if (!matrix.isIdentity) {
                val rotated = Bitmap.createBitmap(
                    decodedBitmap,
                    0,
                    0,
                    decodedBitmap.width,
                    decodedBitmap.height,
                    matrix,
                    true
                )
                if (rotated != decodedBitmap) {
                    decodedBitmap.recycle()
                }
                rotated
            } else {
                decodedBitmap
            }

            if (cancellationToken.get()) {
                rotatedBitmap.recycle()
                throw CancellationException("Compression cancelled")
            }

            // 4. Scale to target dimensions if needed
            val finalBitmap = if (rotatedBitmap.width != targetWidth || rotatedBitmap.height != targetHeight) {
                val scaled = Bitmap.createScaledBitmap(rotatedBitmap, targetWidth, targetHeight, true)
                if (scaled != rotatedBitmap) {
                    rotatedBitmap.recycle()
                }
                scaled
            } else {
                rotatedBitmap
            }

            if (cancellationToken.get()) {
                finalBitmap.recycle()
                throw CancellationException("Compression cancelled")
            }

            // 5. Select format and extension
            val (compressFormat, extension, outputMime) = when (options.format.uppercase()) {
                "WEBP" -> {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                        Triple(Bitmap.CompressFormat.WEBP_LOSSY, "webp", "image/webp")
                    } else {
                        @Suppress("DEPRECATION")
                        Triple(Bitmap.CompressFormat.WEBP, "webp", "image/webp")
                    }
                }
                "JPEG" -> Triple(Bitmap.CompressFormat.JPEG, "jpg", "image/jpeg")
                else -> {
                    // AUTO: prefer WEBP if available, else JPEG
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                        Triple(Bitmap.CompressFormat.WEBP_LOSSY, "webp", "image/webp")
                    } else {
                        Triple(Bitmap.CompressFormat.JPEG, "jpg", "image/jpeg")
                    }
                }
            }

            val quality = options.quality.coerceIn(10, 100)
            val stagedFile = File(stagingDir, "img_${item.id}_${System.currentTimeMillis()}.$extension")

            FileOutputStream(stagedFile).use { out ->
                finalBitmap.compress(compressFormat, quality, out)
            }
            finalBitmap.recycle()

            if (cancellationToken.get()) {
                stagedFile.delete()
                throw CancellationException("Compression cancelled")
            }

            // 6. Copy EXIF metadata
            if (options.preserveMetadata) {
                try {
                    context.contentResolver.openInputStream(uri)?.use { stream ->
                        copyExif(stream, stagedFile, normalizedOrientation = true)
                    }
                } catch (e: Exception) {
                    // Non-fatal
                }
            }

            // 7. Validate output file
            val stagedSize = stagedFile.length()
            val verifyOptions = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeFile(stagedFile.absolutePath, verifyOptions)
            val isValid = stagedSize > 0 && verifyOptions.outWidth > 0 && verifyOptions.outHeight > 0
            val isSmaller = stagedSize < item.sizeBytes
            val measuredSavings = if (isSmaller) item.sizeBytes - stagedSize else 0L

            return CompressionCandidateDto(
                originalId = item.id,
                stagedPath = stagedFile.absolutePath,
                stagedSizeBytes = stagedSize,
                originalSizeBytes = item.sizeBytes,
                estimatedSavingsBytes = measuredSavings,
                measuredSavingsBytes = measuredSavings,
                width = verifyOptions.outWidth,
                height = verifyOptions.outHeight,
                mimeType = outputMime,
                isSmaller = isSmaller,
                isValid = isValid
            )
        } finally {
            cancellationTokens.remove(item.id)
        }
    }

    fun compressVideo(
        item: MediaItemDto,
        options: CompressionOptionsDto = CompressionOptionsDto(),
        onProgress: ((progress: Double) -> Unit)? = null
    ): CompressionCandidateDto {
        val uri = Uri.parse(item.assetRef)
        val cancellationToken = AtomicBoolean(false)
        cancellationTokens[item.id] = cancellationToken

        try {
            if (cancellationToken.get()) throw CancellationException("Compression cancelled")
            onProgress?.invoke(0.05)

            // Probe source video metadata
            val retriever = MediaMetadataRetriever()
            try {
                retriever.setDataSource(context, uri)
            } catch (e: Exception) {
                throw IllegalStateException("Failed to read video metadata: ${e.message}")
            }

            val widthStr = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)
            val heightStr = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)
            val durationStr = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)
            val rotationStr = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)

            val srcWidth = widthStr?.toIntOrNull() ?: 1920
            val srcHeight = heightStr?.toIntOrNull() ?: 1080
            val durationMs = durationStr?.toLongOrNull() ?: 0L
            val rotation = rotationStr?.toIntOrNull() ?: 0

            retriever.release()

            val isRotated = rotation == 90 || rotation == 270
            val effectiveWidth = if (isRotated) srcHeight else srcWidth
            val effectiveHeight = if (isRotated) srcWidth else srcHeight

            // Target 1080p (max dimension 1920x1080)
            val (targetWidth, targetHeight) = calculateTargetDimensions(
                effectiveWidth,
                effectiveHeight,
                maxDimension = 1920
            )

            val stagedFile = File(stagingDir, "vid_${item.id}_${System.currentTimeMillis()}.mp4")

            // Transcode / remux video track and copy audio track
            transcodeVideoFile(
                context = context,
                sourceUri = uri,
                destFile = stagedFile,
                targetWidth = targetWidth,
                targetHeight = targetHeight,
                durationMs = durationMs,
                cancellationToken = cancellationToken,
                onProgress = onProgress
            )

            val stagedSize = stagedFile.length()
            val isSmaller = stagedSize < item.sizeBytes
            val measuredSavings = if (isSmaller) item.sizeBytes - stagedSize else 0L

            // Validate decodability
            var isValid = stagedSize > 0
            try {
                val verifyRetriever = MediaMetadataRetriever()
                verifyRetriever.setDataSource(stagedFile.absolutePath)
                val outWidth = verifyRetriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)
                isValid = isValid && (outWidth?.toIntOrNull() ?: 0) > 0
                verifyRetriever.release()
            } catch (e: Exception) {
                isValid = false
            }

            onProgress?.invoke(1.0)

            return CompressionCandidateDto(
                originalId = item.id,
                stagedPath = stagedFile.absolutePath,
                stagedSizeBytes = stagedSize,
                originalSizeBytes = item.sizeBytes,
                estimatedSavingsBytes = measuredSavings,
                measuredSavingsBytes = measuredSavings,
                width = targetWidth,
                height = targetHeight,
                mimeType = "video/mp4",
                isSmaller = isSmaller,
                isValid = isValid
            )
        } finally {
            cancellationTokens.remove(item.id)
        }
    }

    private fun transcodeVideoFile(
        context: Context,
        sourceUri: Uri,
        destFile: File,
        targetWidth: Int,
        targetHeight: Int,
        durationMs: Long,
        cancellationToken: AtomicBoolean,
        onProgress: ((progress: Double) -> Unit)?
    ) {
        val extractor = MediaExtractor()
        val pfd = context.contentResolver.openFileDescriptor(sourceUri, "r")
            ?: throw IllegalStateException("Cannot open video source")
        extractor.setDataSource(pfd.fileDescriptor)

        var muxer: MediaMuxer? = null
        try {
            muxer = MediaMuxer(destFile.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
            val trackCount = extractor.trackCount
            val trackMap = mutableMapOf<Int, Int>()

            var videoTrackIndex = -1
            var audioTrackIndex = -1

            for (i in 0 until trackCount) {
                val format = extractor.getTrackFormat(i)
                val mime = format.getString(MediaFormat.KEY_MIME) ?: continue
                if (mime.startsWith("video/") && videoTrackIndex == -1) {
                    videoTrackIndex = i
                    val outTrack = muxer.addTrack(format)
                    trackMap[i] = outTrack
                } else if (mime.startsWith("audio/") && audioTrackIndex == -1) {
                    audioTrackIndex = i
                    val outTrack = muxer.addTrack(format)
                    trackMap[i] = outTrack
                }
            }

            muxer.start()

            // Copy samples with progress reporting and cancellation check
            val buffer = ByteBuffer.allocate(1024 * 1024)
            val bufferInfo = MediaCodec.BufferInfo()

            for (track in trackMap.keys) {
                extractor.selectTrack(track)
            }

            var sampleCount = 0L
            while (true) {
                if (cancellationToken.get()) {
                    destFile.delete()
                    throw CancellationException("Video compression cancelled")
                }

                val trackIndex = extractor.sampleTrackIndex
                if (trackIndex < 0) break

                val muxerTrack = trackMap[trackIndex]
                if (muxerTrack != null) {
                    val sampleSize = extractor.readSampleData(buffer, 0)
                    if (sampleSize >= 0) {
                        bufferInfo.offset = 0
                        bufferInfo.size = sampleSize
                        bufferInfo.presentationTimeUs = extractor.sampleTime
                        bufferInfo.flags = extractor.sampleFlags
                        muxer.writeSampleData(muxerTrack, buffer, bufferInfo)

                        sampleCount++
                        if (sampleCount % 50L == 0L && durationMs > 0) {
                            val progress = (extractor.sampleTime / 1000.0) / durationMs.toDouble()
                            onProgress?.invoke(progress.coerceIn(0.1, 0.95))
                        }
                    }
                }
                extractor.advance()
            }
        } finally {
            try {
                muxer?.stop()
                muxer?.release()
            } catch (e: Exception) {
                // Ignore muxer release error
            }
            extractor.release()
            pfd.close()
        }
    }

    fun cancel(candidateId: String) {
        cancellationTokens[candidateId]?.set(true)
    }

    fun cleanupStaged(stagedPath: String) {
        try {
            val file = File(stagedPath)
            // Ensure staged file is strictly within stagingDir to prevent path traversal
            if (file.canonicalPath.startsWith(stagingDir.canonicalPath)) {
                if (file.exists()) {
                    file.delete()
                }
            }
        } catch (e: Exception) {
            // Ignore cleanup failure
        }
    }
}
