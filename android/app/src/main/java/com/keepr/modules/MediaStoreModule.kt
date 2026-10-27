package com.keepr.modules

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener
import com.keepr.media.AuthorizationState
import com.keepr.media.MediaStoreAdapter
import com.keepr.media.MediaQueryFilter
import java.util.concurrent.Executors

class MediaStoreModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val mediaStoreAdapter = MediaStoreAdapter(reactContext)
    private val executor = Executors.newSingleThreadExecutor()

    override fun getName(): String = "KeeprMediaStore"

    private fun authStateToMap(state: AuthorizationState): WritableMap {
        return Arguments.createMap().apply {
            putString("status", state.status)
            putString("scope", state.scope)
            putBoolean("canSelectMore", state.canSelectMore)
            state.details?.let { putString("details", it) }
        }
    }

    @ReactMethod
    fun getAuthorizationState(promise: Promise) {
        try {
            val state = mediaStoreAdapter.getAuthorizationState()
            promise.resolve(authStateToMap(state))
        } catch (e: Exception) {
            promise.reject("AUTH_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun requestAuthorization(types: ReadableArray, promise: Promise) {
        val typeList = mutableListOf<String>()
        for (i in 0 until types.size()) {
            types.getString(i)?.let { typeList.add(it) }
        }
        val mediaTypes = if (typeList.isNotEmpty()) typeList else listOf("IMAGE", "VIDEO")

        val permissions = MediaStoreAdapter.getRequiredPermissions(Build.VERSION.SDK_INT, mediaTypes)

        val activity = reactApplicationContext.currentActivity
        if (activity is PermissionAwareActivity) {
            activity.requestPermissions(
                permissions.toTypedArray(),
                1001,
                PermissionListener { _, _, _ ->
                    val newState = mediaStoreAdapter.getAuthorizationState(mediaTypes)
                    promise.resolve(authStateToMap(newState))
                    true
                }
            )
        } else {
            // No activity available, return current state
            val currentState = mediaStoreAdapter.getAuthorizationState(mediaTypes)
            promise.resolve(authStateToMap(currentState))
        }
    }

    @ReactMethod
    fun openSettings(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.fromParts("package", reactApplicationContext.packageName, null)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactApplicationContext.startActivity(intent)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("SETTINGS_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun queryMedia(options: ReadableMap?, promise: Promise) {
        executor.execute {
            try {
                val mediaTypes = options?.getArray("mediaTypes")?.let { arr ->
                    val list = mutableListOf<String>()
                    for (i in 0 until arr.size()) {
                        arr.getString(i)?.let { list.add(it) }
                    }
                    list
                }

                val filter = MediaQueryFilter(
                    pageSize = if (options?.hasKey("pageSize") == true) options.getInt("pageSize") else 50,
                    pageToken = if (options?.hasKey("pageToken") == true) options.getString("pageToken") else null,
                    mediaTypes = mediaTypes,
                    sortBy = if (options?.hasKey("sortBy") == true) options.getString("sortBy") ?: "date" else "date",
                    sortOrder = if (options?.hasKey("sortOrder") == true) options.getString("sortOrder") ?: "desc" else "desc",
                    albumId = if (options?.hasKey("albumId") == true) options.getString("albumId") else null,
                    minSizeBytes = if (options?.hasKey("minSizeBytes") == true) options.getDouble("minSizeBytes").toLong() else null,
                    maxSizeBytes = if (options?.hasKey("maxSizeBytes") == true) options.getDouble("maxSizeBytes").toLong() else null,
                    isScreenshot = if (options?.hasKey("isScreenshot") == true) options.getBoolean("isScreenshot") else null
                )

                val page = mediaStoreAdapter.queryMedia(filter)

                val itemsArray = Arguments.createArray()
                for (item in page.items) {
                    val map = Arguments.createMap().apply {
                        putString("id", item.id)
                        putString("mediaType", item.mediaType)
                        putString("assetRef", item.assetRef)
                        putDouble("sizeBytes", item.sizeBytes.toDouble())
                        item.capturedAt?.let { putDouble("capturedAt", it.toDouble()) }
                        item.width?.let { putInt("width", it) }
                        item.height?.let { putInt("height", it) }
                        item.durationSeconds?.let { putDouble("durationSeconds", it) }
                        item.isFavorite?.let { putBoolean("isFavorite", it) }
                        item.isProtected?.let { putBoolean("isProtected", it) }
                        item.mimeType?.let { putString("mimeType", it) }
                        item.filename?.let { putString("filename", it) }
                        item.sourceAlbumId?.let { putString("sourceAlbumId", it) }
                    }
                    itemsArray.pushMap(map)
                }

                val resultMap = Arguments.createMap().apply {
                    putArray("items", itemsArray)
                    if (page.nextPageToken != null) {
                        putString("nextPageToken", page.nextPageToken)
                    } else {
                        putNull("nextPageToken")
                    }
                    if (page.totalCount != null) {
                        putInt("totalCount", page.totalCount)
                    } else {
                        putNull("totalCount")
                    }
                    putBoolean("isLimitedScope", page.isLimitedScope)
                }

                promise.resolve(resultMap)
            } catch (e: Exception) {
                promise.reject("QUERY_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun getItemAvailability(idOrRef: String, promise: Promise) {
        executor.execute {
            try {
                val availability = mediaStoreAdapter.getItemAvailability(idOrRef)
                promise.resolve(availability)
            } catch (e: Exception) {
                promise.reject("AVAILABILITY_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun listAlbums(promise: Promise) {
        executor.execute {
            try {
                val albums = mediaStoreAdapter.listAlbums()
                val albumsArray = Arguments.createArray()
                for (album in albums) {
                    val map = Arguments.createMap().apply {
                        putString("id", album.id)
                        putString("name", album.name)
                        putString("type", album.type)
                        putInt("itemCount", album.itemCount)
                        putBoolean("isReadOnly", album.isReadOnly)
                        album.coverAssetRef?.let { putString("coverAssetRef", it) }
                    }
                    albumsArray.pushMap(map)
                }
                promise.resolve(albumsArray)
            } catch (e: Exception) {
                promise.reject("ALBUMS_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun presentLimitedLibraryPicker(promise: Promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            val activity = reactApplicationContext.currentActivity
            if (activity is PermissionAwareActivity) {
                val permissions = arrayOf(
                    android.Manifest.permission.READ_MEDIA_IMAGES,
                    android.Manifest.permission.READ_MEDIA_VIDEO,
                    "android.permission.READ_MEDIA_VISUAL_USER_SELECTED"
                )
                activity.requestPermissions(
                    permissions,
                    1002,
                    PermissionListener { _, _, _ ->
                        promise.resolve(null)
                        true
                    }
                )
                return
            }
        }
        promise.resolve(null)
    }
}
