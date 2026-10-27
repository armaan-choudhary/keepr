package com.keepr.modules

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.keepr.media.MediaItemDto
import com.keepr.processing.AndroidCompressor
import com.keepr.processing.CompressionCandidateDto
import com.keepr.processing.CompressionOptionsDto
import java.util.concurrent.Executors

class CompressorModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val compressor = AndroidCompressor(reactContext)
    private val executor = Executors.newFixedThreadPool(2)

    override fun getName(): String = "KeeprCompressor"

    private fun candidateToMap(c: CompressionCandidateDto): WritableMap {
        return Arguments.createMap().apply {
            putString("originalId", c.originalId)
            putString("stagedPath", c.stagedPath)
            putDouble("stagedSizeBytes", c.stagedSizeBytes.toDouble())
            putDouble("originalSizeBytes", c.originalSizeBytes.toDouble())
            putDouble("estimatedSavingsBytes", c.estimatedSavingsBytes.toDouble())
            putDouble("measuredSavingsBytes", c.measuredSavingsBytes.toDouble())
            putInt("width", c.width)
            putInt("height", c.height)
            putString("mimeType", c.mimeType)
            putBoolean("isSmaller", c.isSmaller)
            putBoolean("isValid", c.isValid)
            c.error?.let { putString("error", it) }
        }
    }

    private fun parseMediaItem(map: ReadableMap): MediaItemDto {
        return MediaItemDto(
            id = map.getString("id") ?: "",
            mediaType = map.getString("mediaType") ?: "IMAGE",
            assetRef = map.getString("assetRef") ?: "",
            sizeBytes = if (map.hasKey("sizeBytes")) map.getDouble("sizeBytes").toLong() else 0L,
            capturedAt = if (map.hasKey("capturedAt")) map.getDouble("capturedAt").toLong() else null,
            width = if (map.hasKey("width")) map.getInt("width") else null,
            height = if (map.hasKey("height")) map.getInt("height") else null,
            durationSeconds = if (map.hasKey("durationSeconds")) map.getDouble("durationSeconds") else null,
            isFavorite = if (map.hasKey("isFavorite")) map.getBoolean("isFavorite") else null,
            isProtected = if (map.hasKey("isProtected")) map.getBoolean("isProtected") else false,
            mimeType = if (map.hasKey("mimeType")) map.getString("mimeType") else null,
            filename = if (map.hasKey("filename")) map.getString("filename") else null,
            sourceAlbumId = if (map.hasKey("sourceAlbumId")) map.getString("sourceAlbumId") else null
        )
    }

    private fun parseOptions(map: ReadableMap?): CompressionOptionsDto {
        if (map == null) return CompressionOptionsDto()
        return CompressionOptionsDto(
            maxDimension = if (map.hasKey("maxDimension")) map.getInt("maxDimension") else 2560,
            quality = if (map.hasKey("quality")) map.getInt("quality") else 85,
            format = if (map.hasKey("format")) map.getString("format") ?: "AUTO" else "AUTO",
            preserveMetadata = if (map.hasKey("preserveMetadata")) map.getBoolean("preserveMetadata") else true,
            targetBitrateKbps = if (map.hasKey("targetBitrateKbps")) map.getInt("targetBitrateKbps") else null
        )
    }

    @ReactMethod
    fun compressImage(itemMap: ReadableMap, optionsMap: ReadableMap?, promise: Promise) {
        executor.execute {
            try {
                val item = parseMediaItem(itemMap)
                val options = parseOptions(optionsMap)
                val candidate = compressor.compressImage(item, options)
                promise.resolve(candidateToMap(candidate))
            } catch (e: Exception) {
                promise.reject("COMPRESS_IMAGE_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun compressVideo(itemMap: ReadableMap, optionsMap: ReadableMap?, promise: Promise) {
        executor.execute {
            try {
                val item = parseMediaItem(itemMap)
                val options = parseOptions(optionsMap)
                val candidate = compressor.compressVideo(item, options) { progress ->
                    val event = Arguments.createMap().apply {
                        putString("candidateId", item.id)
                        putDouble("progress", progress)
                    }
                    reactApplicationContext
                        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                        .emit("onCompressionProgress", event)
                }
                promise.resolve(candidateToMap(candidate))
            } catch (e: Exception) {
                promise.reject("COMPRESS_VIDEO_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun cancel(candidateId: String, promise: Promise) {
        try {
            compressor.cancel(candidateId)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("CANCEL_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun cleanupStaged(stagedPath: String, promise: Promise) {
        executor.execute {
            try {
                compressor.cleanupStaged(stagedPath)
                promise.resolve(null)
            } catch (e: Exception) {
                promise.reject("CLEANUP_ERROR", e.message, e)
            }
        }
    }
}
