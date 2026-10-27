package com.keepr.media

import android.Manifest
import android.content.ContentResolver
import android.content.ContentUris
import android.content.Context
import android.content.pm.PackageManager
import android.database.Cursor
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import androidx.core.content.ContextCompat

data class AuthorizationState(
    val status: String, // 'notDetermined' | 'restricted' | 'denied' | 'limited' | 'authorized'
    val scope: String,  // 'full' | 'selected' | 'none'
    val canSelectMore: Boolean,
    val details: String? = null
)

data class MediaItemDto(
    val id: String,
    val mediaType: String, // 'IMAGE' | 'VIDEO'
    val assetRef: String,
    val sizeBytes: Long,
    val capturedAt: Long? = null,
    val width: Int? = null,
    val height: Int? = null,
    val durationSeconds: Double? = null,
    val isFavorite: Boolean? = null,
    val isProtected: Boolean? = null,
    val mimeType: String? = null,
    val filename: String? = null,
    val sourceAlbumId: String? = null
)

data class MediaPageDto(
    val items: List<MediaItemDto>,
    val nextPageToken: String? = null,
    val totalCount: Int? = null,
    val isLimitedScope: Boolean = false
)

data class AlbumInfoDto(
    val id: String,
    val name: String,
    val type: String, // 'NATIVE_SYSTEM' | 'KEEPR_MANAGED'
    val itemCount: Int,
    val isReadOnly: Boolean,
    val coverAssetRef: String? = null
)

data class MediaQueryFilter(
    val pageSize: Int = 50,
    val pageToken: String? = null,
    val mediaTypes: List<String>? = null, // ['IMAGE', 'VIDEO']
    val sortBy: String = "date",          // 'date' | 'size'
    val sortOrder: String = "desc",       // 'asc' | 'desc'
    val albumId: String? = null,
    val minSizeBytes: Long? = null,
    val maxSizeBytes: Long? = null,
    val isScreenshot: Boolean? = null
)

class MediaStoreAdapter(private val context: Context) {

    companion object {
        const val AVAILABILITY_AVAILABLE_OFFLINE = "availableOffline"
        const val AVAILABILITY_REQUIRES_NETWORK = "requiresNetwork"
        const val AVAILABILITY_PERMISSION_REVOKED = "permissionRevoked"
        const val AVAILABILITY_ASSET_MISSING = "assetMissing"

        // Pure helper to compute authorization state from permissions matrix
        fun evaluateAuthorizationState(
            sdkInt: Int,
            readExternalGranted: Boolean,
            readImagesGranted: Boolean,
            readVideoGranted: Boolean,
            readVisualUserSelectedGranted: Boolean,
            requestedMediaTypes: List<String> = listOf("IMAGE", "VIDEO")
        ): AuthorizationState {
            return when {
                sdkInt >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE -> { // API 34+
                    val needsImages = requestedMediaTypes.contains("IMAGE")
                    val needsVideo = requestedMediaTypes.contains("VIDEO")

                    val fullAccess = when {
                        needsImages && needsVideo -> readImagesGranted && readVideoGranted
                        needsImages -> readImagesGranted
                        needsVideo -> readVideoGranted
                        else -> readImagesGranted || readVideoGranted
                    }

                    if (fullAccess) {
                        AuthorizationState(
                            status = "authorized",
                            scope = "full",
                            canSelectMore = false,
                            details = "Full access to shared media"
                        )
                    } else if (readVisualUserSelectedGranted) {
                        AuthorizationState(
                            status = "limited",
                            scope = "selected",
                            canSelectMore = true,
                            details = "Selected photos and videos access (Android 14+)"
                        )
                    } else {
                        AuthorizationState(
                            status = "denied",
                            scope = "none",
                            canSelectMore = false,
                            details = "Media permissions not granted"
                        )
                    }
                }
                sdkInt >= Build.VERSION_CODES.TIRAMISU -> { // API 33
                    val needsImages = requestedMediaTypes.contains("IMAGE")
                    val needsVideo = requestedMediaTypes.contains("VIDEO")

                    val fullAccess = when {
                        needsImages && needsVideo -> readImagesGranted && readVideoGranted
                        needsImages -> readImagesGranted
                        needsVideo -> readVideoGranted
                        else -> readImagesGranted || readVideoGranted
                    }

                    if (fullAccess) {
                        AuthorizationState(
                            status = "authorized",
                            scope = "full",
                            canSelectMore = false
                        )
                    } else {
                        AuthorizationState(
                            status = "denied",
                            scope = "none",
                            canSelectMore = false,
                            details = "Granular media permissions denied"
                        )
                    }
                }
                else -> { // API 29-32
                    if (readExternalGranted) {
                        AuthorizationState(
                            status = "authorized",
                            scope = "full",
                            canSelectMore = false
                        )
                    } else {
                        AuthorizationState(
                            status = "denied",
                            scope = "none",
                            canSelectMore = false,
                            details = "READ_EXTERNAL_STORAGE denied"
                        )
                    }
                }
            }
        }

        fun getRequiredPermissions(sdkInt: Int, mediaTypes: List<String> = listOf("IMAGE", "VIDEO")): List<String> {
            val result = mutableListOf<String>()
            when {
                sdkInt >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE -> {
                    if (mediaTypes.contains("IMAGE")) result.add(Manifest.permission.READ_MEDIA_IMAGES)
                    if (mediaTypes.contains("VIDEO")) result.add(Manifest.permission.READ_MEDIA_VIDEO)
                    result.add("android.permission.READ_MEDIA_VISUAL_USER_SELECTED")
                }
                sdkInt >= Build.VERSION_CODES.TIRAMISU -> {
                    if (mediaTypes.contains("IMAGE")) result.add(Manifest.permission.READ_MEDIA_IMAGES)
                    if (mediaTypes.contains("VIDEO")) result.add(Manifest.permission.READ_MEDIA_VIDEO)
                }
                else -> {
                    result.add(Manifest.permission.READ_EXTERNAL_STORAGE)
                }
            }
            return result
        }

        fun buildQueryArgs(
            filter: MediaQueryFilter,
            offset: Int,
            limit: Int
        ): Triple<String, Array<String>, String> {
            val selectionClauses = mutableListOf<String>()
            val selectionArgs = mutableListOf<String>()

            // Media types filter
            val types = filter.mediaTypes ?: listOf("IMAGE", "VIDEO")
            val typeClauses = mutableListOf<String>()
            if (types.contains("IMAGE")) {
                typeClauses.add("${MediaStore.Files.FileColumns.MEDIA_TYPE} = ${MediaStore.Files.FileColumns.MEDIA_TYPE_IMAGE}")
            }
            if (types.contains("VIDEO")) {
                typeClauses.add("${MediaStore.Files.FileColumns.MEDIA_TYPE} = ${MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO}")
            }
            if (typeClauses.isNotEmpty()) {
                selectionClauses.add("(${typeClauses.joinToString(" OR ")})")
            }

            // Album filter (bucket ID)
            if (!filter.albumId.isNullOrEmpty()) {
                selectionClauses.add("${MediaStore.Images.Media.BUCKET_ID} = ?")
                selectionArgs.add(filter.albumId)
            }

            // Size filters
            filter.minSizeBytes?.let {
                selectionClauses.add("${MediaStore.Files.FileColumns.SIZE} >= ?")
                selectionArgs.add(it.toString())
            }
            filter.maxSizeBytes?.let {
                selectionClauses.add("${MediaStore.Files.FileColumns.SIZE} <= ?")
                selectionArgs.add(it.toString())
            }

            // Screenshot filter
            if (filter.isScreenshot == true) {
                selectionClauses.add(
                    "(${MediaStore.Images.Media.BUCKET_DISPLAY_NAME} LIKE '%Screenshot%' OR " +
                    "${MediaStore.Files.FileColumns.DISPLAY_NAME} LIKE '%Screenshot%' OR " +
                    "${MediaStore.MediaColumns.RELATIVE_PATH} LIKE '%Screenshots%')"
                )
            }

            val selection = if (selectionClauses.isNotEmpty()) {
                selectionClauses.joinToString(" AND ")
            } else {
                "${MediaStore.Files.FileColumns.MEDIA_TYPE} IN (${MediaStore.Files.FileColumns.MEDIA_TYPE_IMAGE}, ${MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO})"
            }

            val sortColumn = if (filter.sortBy == "size") {
                MediaStore.Files.FileColumns.SIZE
            } else {
                MediaStore.Files.FileColumns.DATE_ADDED
            }
            val sortDirection = if (filter.sortOrder.equals("asc", ignoreCase = true)) "ASC" else "DESC"
            val sortOrder = "$sortColumn $sortDirection LIMIT $limit OFFSET $offset"

            return Triple(selection, selectionArgs.toTypedArray(), sortOrder)
        }
    }

    fun getAuthorizationState(requestedTypes: List<String> = listOf("IMAGE", "VIDEO")): AuthorizationState {
        val readExternal = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.READ_EXTERNAL_STORAGE
        ) == PackageManager.PERMISSION_GRANTED

        val readImages = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.READ_MEDIA_IMAGES
            ) == PackageManager.PERMISSION_GRANTED
        } else false

        val readVideo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.READ_MEDIA_VIDEO
            ) == PackageManager.PERMISSION_GRANTED
        } else false

        val readVisualUserSelected = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            ContextCompat.checkSelfPermission(
                context,
                "android.permission.READ_MEDIA_VISUAL_USER_SELECTED"
            ) == PackageManager.PERMISSION_GRANTED
        } else false

        return evaluateAuthorizationState(
            sdkInt = Build.VERSION.SDK_INT,
            readExternalGranted = readExternal,
            readImagesGranted = readImages,
            readVideoGranted = readVideo,
            readVisualUserSelectedGranted = readVisualUserSelected,
            requestedMediaTypes = requestedTypes
        )
    }

    fun queryMedia(filter: MediaQueryFilter): MediaPageDto {
        val authState = getAuthorizationState(filter.mediaTypes ?: listOf("IMAGE", "VIDEO"))
        val isLimitedScope = authState.scope == "selected"

        val limit = filter.pageSize.coerceIn(1, 200)
        val offset = filter.pageToken?.toIntOrNull() ?: 0

        val (selection, selectionArgs, sortOrder) = buildQueryArgs(filter, offset, limit)

        val projection = mutableListOf(
            MediaStore.Files.FileColumns._ID,
            MediaStore.Files.FileColumns.MEDIA_TYPE,
            MediaStore.Files.FileColumns.SIZE,
            MediaStore.Files.FileColumns.DATE_ADDED,
            MediaStore.Files.FileColumns.DATE_MODIFIED,
            MediaStore.Files.FileColumns.MIME_TYPE,
            MediaStore.Files.FileColumns.DISPLAY_NAME,
            MediaStore.Files.FileColumns.WIDTH,
            MediaStore.Files.FileColumns.HEIGHT,
            MediaStore.Video.VideoColumns.DURATION,
            MediaStore.Images.Media.BUCKET_ID,
            MediaStore.Images.Media.BUCKET_DISPLAY_NAME
        )

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            projection.add(MediaStore.MediaColumns.RELATIVE_PATH)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            projection.add(MediaStore.MediaColumns.IS_FAVORITE)
        }

        val items = mutableListOf<MediaItemDto>()
        val contentUri = MediaStore.Files.getContentUri("external")

        var cursor: Cursor? = null
        try {
            cursor = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val queryArgs = Bundle().apply {
                    putString(ContentResolver.QUERY_ARG_SQL_SELECTION, selection)
                    putStringArray(ContentResolver.QUERY_ARG_SQL_SELECTION_ARGS, selectionArgs)
                    val sortCol = if (filter.sortBy == "size") MediaStore.Files.FileColumns.SIZE else MediaStore.Files.FileColumns.DATE_ADDED
                    val sortDir = if (filter.sortOrder.equals("asc", ignoreCase = true)) {
                        ContentResolver.QUERY_SORT_DIRECTION_ASCENDING
                    } else {
                        ContentResolver.QUERY_SORT_DIRECTION_DESCENDING
                    }
                    putStringArray(ContentResolver.QUERY_ARG_SORT_COLUMNS, arrayOf(sortCol))
                    putInt(ContentResolver.QUERY_ARG_SORT_DIRECTION, sortDir)
                    putInt(ContentResolver.QUERY_ARG_LIMIT, limit)
                    putInt(ContentResolver.QUERY_ARG_OFFSET, offset)
                }
                context.contentResolver.query(contentUri, projection.toTypedArray(), queryArgs, null)
            } else {
                context.contentResolver.query(contentUri, projection.toTypedArray(), selection, selectionArgs, sortOrder)
            }

            cursor?.let { c ->
                val idCol = c.getColumnIndexOrThrow(MediaStore.Files.FileColumns._ID)
                val typeCol = c.getColumnIndexOrThrow(MediaStore.Files.FileColumns.MEDIA_TYPE)
                val sizeCol = c.getColumnIndexOrThrow(MediaStore.Files.FileColumns.SIZE)
                val dateAddedCol = c.getColumnIndex(MediaStore.Files.FileColumns.DATE_ADDED)
                val mimeCol = c.getColumnIndex(MediaStore.Files.FileColumns.MIME_TYPE)
                val nameCol = c.getColumnIndex(MediaStore.Files.FileColumns.DISPLAY_NAME)
                val widthCol = c.getColumnIndex(MediaStore.Files.FileColumns.WIDTH)
                val heightCol = c.getColumnIndex(MediaStore.Files.FileColumns.HEIGHT)
                val durCol = c.getColumnIndex(MediaStore.Video.VideoColumns.DURATION)
                val bucketIdCol = c.getColumnIndex(MediaStore.Images.Media.BUCKET_ID)
                val favCol = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    c.getColumnIndex(MediaStore.MediaColumns.IS_FAVORITE)
                } else -1

                while (c.moveToNext()) {
                    try {
                        val rowId = c.getLong(idCol)
                        val mediaTypeCode = c.getInt(typeCol)
                        val isVideo = mediaTypeCode == MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO
                        val mediaType = if (isVideo) "VIDEO" else "IMAGE"

                        val itemUri = if (isVideo) {
                            ContentUris.withAppendedId(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, rowId)
                        } else {
                            ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, rowId)
                        }

                        val size = c.getLong(sizeCol)
                        val capturedAtSec = if (dateAddedCol >= 0) c.getLong(dateAddedCol) else 0L
                        val capturedAtMs = if (capturedAtSec > 0) capturedAtSec * 1000L else null
                        val mime = if (mimeCol >= 0) c.getString(mimeCol) else null
                        val name = if (nameCol >= 0) c.getString(nameCol) else null
                        val w = if (widthCol >= 0 && !c.isNull(widthCol)) c.getInt(widthCol) else null
                        val h = if (heightCol >= 0 && !c.isNull(heightCol)) c.getInt(heightCol) else null
                        val durMs = if (durCol >= 0 && !c.isNull(durCol)) c.getLong(durCol) else null
                        val durSec = durMs?.let { it.toDouble() / 1000.0 }
                        val bucketId = if (bucketIdCol >= 0) c.getString(bucketIdCol) else null
                        val isFav = if (favCol >= 0 && !c.isNull(favCol)) c.getInt(favCol) == 1 else null

                        items.add(
                            MediaItemDto(
                                id = rowId.toString(),
                                mediaType = mediaType,
                                assetRef = itemUri.toString(),
                                sizeBytes = size,
                                capturedAt = capturedAtMs,
                                width = w,
                                height = h,
                                durationSeconds = durSec,
                                isFavorite = isFav,
                                isProtected = false,
                                mimeType = mime,
                                filename = name,
                                sourceAlbumId = bucketId
                            )
                        )
                    } catch (e: Exception) {
                        // Skip corrupted or inaccessible row gracefully
                        continue
                    }
                }
            }
        } catch (e: Exception) {
            // Log/handle query failure gracefully
        } finally {
            cursor?.close()
        }

        val nextToken = if (items.size == limit) (offset + limit).toString() else null

        return MediaPageDto(
            items = items,
            nextPageToken = nextToken,
            totalCount = null,
            isLimitedScope = isLimitedScope
        )
    }

    fun getItemAvailability(assetRefOrId: String): String {
        val uri = try {
            if (assetRefOrId.startsWith("content://")) {
                Uri.parse(assetRefOrId)
            } else {
                val idLong = assetRefOrId.toLongOrNull() ?: return AVAILABILITY_ASSET_MISSING
                ContentUris.withAppendedId(MediaStore.Files.getContentUri("external"), idLong)
            }
        } catch (e: Exception) {
            return AVAILABILITY_ASSET_MISSING
        }

        return try {
            context.contentResolver.openAssetFileDescriptor(uri, "r")?.use {
                AVAILABILITY_AVAILABLE_OFFLINE
            } ?: AVAILABILITY_ASSET_MISSING
        } catch (e: SecurityException) {
            AVAILABILITY_PERMISSION_REVOKED
        } catch (e: Exception) {
            AVAILABILITY_ASSET_MISSING
        }
    }

    fun listAlbums(): List<AlbumInfoDto> {
        val projection = arrayOf(
            MediaStore.Images.Media.BUCKET_ID,
            MediaStore.Images.Media.BUCKET_DISPLAY_NAME,
            MediaStore.Files.FileColumns._ID,
            MediaStore.Files.FileColumns.MEDIA_TYPE
        )
        val selection = "${MediaStore.Files.FileColumns.MEDIA_TYPE} IN (${MediaStore.Files.FileColumns.MEDIA_TYPE_IMAGE}, ${MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO})"
        val sortOrder = "${MediaStore.Images.Media.BUCKET_DISPLAY_NAME} ASC, ${MediaStore.Files.FileColumns.DATE_ADDED} DESC"

        val albumMap = mutableMapOf<String, AlbumAccumulator>()

        var cursor: Cursor? = null
        try {
            cursor = context.contentResolver.query(
                MediaStore.Files.getContentUri("external"),
                projection,
                selection,
                null,
                sortOrder
            )

            cursor?.let { c ->
                val bucketIdCol = c.getColumnIndex(MediaStore.Images.Media.BUCKET_ID)
                val bucketNameCol = c.getColumnIndex(MediaStore.Images.Media.BUCKET_DISPLAY_NAME)
                val idCol = c.getColumnIndex(MediaStore.Files.FileColumns._ID)
                val typeCol = c.getColumnIndex(MediaStore.Files.FileColumns.MEDIA_TYPE)

                while (c.moveToNext()) {
                    val bucketId = if (bucketIdCol >= 0) c.getString(bucketIdCol) else null ?: "unknown"
                    val bucketName = if (bucketNameCol >= 0) c.getString(bucketNameCol) else null ?: "Media"
                    val rowId = if (idCol >= 0) c.getLong(idCol) else -1L
                    val mediaType = if (typeCol >= 0) c.getInt(typeCol) else MediaStore.Files.FileColumns.MEDIA_TYPE_IMAGE

                    val accum = albumMap.getOrPut(bucketId) {
                        val coverUri = if (mediaType == MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO) {
                            ContentUris.withAppendedId(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, rowId).toString()
                        } else {
                            ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, rowId).toString()
                        }
                        AlbumAccumulator(bucketId, bucketName, coverUri)
                    }
                    accum.count++
                }
            }
        } catch (e: Exception) {
            // Graceful return of whatever albums were found
        } finally {
            cursor?.close()
        }

        return albumMap.values.map { accum ->
            AlbumInfoDto(
                id = accum.id,
                name = accum.name,
                type = "NATIVE_SYSTEM",
                itemCount = accum.count,
                isReadOnly = true,
                coverAssetRef = accum.coverAssetRef
            )
        }
    }

    private class AlbumAccumulator(
        val id: String,
        val name: String,
        val coverAssetRef: String
    ) {
        var count: Int = 0
    }
}
