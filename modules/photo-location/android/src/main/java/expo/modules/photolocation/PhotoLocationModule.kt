package expo.modules.photolocation

//
//  사진 GPS 좌표만 배치로 읽는다 — iOS(PhotoLocationModule.swift)와 같은 모듈명·시그니처.
//
//  iOS와 달리 안드로이드에는 값싼 경로가 없다. 안드로이드 10(API 29)부터 스코프 스토리지가
//  MediaStore의 위치 정보를 가려서, ACCESS_MEDIA_LOCATION 권한 + setRequireOriginal로
//  원본 스트림을 열어 EXIF를 직접 읽어야 한다(LATITUDE/LONGITUDE 컬럼 경로는 사라졌다).
//  그래도 이득은 있다 — expo-media-library의 getAssetInfoAsync는 좌표 외에 localUri·크기·
//  exif 전체까지 만들고 사진 1장마다 JS↔네이티브를 왕복하는데, 여기서는 GPS 태그만 읽고
//  왕복도 배치당 1회다.
//

import android.content.ContentUris
import android.os.Build
import android.provider.MediaStore
import androidx.exifinterface.media.ExifInterface
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.Executors

class PhotoLocationModule : Module() {

    // 파일 I/O 전용 백그라운드 스레드 (JS 스레드를 막지 않는다)
    private val executor = Executors.newSingleThreadExecutor()

    override fun definition() = ModuleDefinition {
        Name("PhotoLocation")

        // 자산 id 배열 → { id: [위도, 경도] }. 좌표가 없는 사진은 키 자체가 없다(희소 맵).
        // id는 expo-media-library가 주는 값 그대로 = MediaStore의 _ID(숫자 문자열).
        AsyncFunction("getLocations") { assetIds: List<String>, promise: Promise ->
            executor.execute {
                val out = HashMap<String, List<Double>>(assetIds.size / 2 + 1)
                val resolver = appContext.reactContext?.contentResolver
                if (resolver == null) {
                    // 컨텍스트가 없으면 좌표를 못 읽는다 — 빈 맵을 주면 호출부가 기존 경로로 폴백한다
                    promise.resolve(out)
                    return@execute
                }
                for (id in assetIds) {
                    val rowId = id.toLongOrNull() ?: continue
                    try {
                        var uri = ContentUris.withAppendedId(
                            MediaStore.Images.Media.EXTERNAL_CONTENT_URI, rowId
                        )
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                            // ACCESS_MEDIA_LOCATION이 없으면 여기서 예외 → 그 사진만 건너뛴다
                            uri = MediaStore.setRequireOriginal(uri)
                        }
                        resolver.openInputStream(uri)?.use { stream ->
                            val latLong = ExifInterface(stream).latLong
                            if (latLong != null && latLong.size == 2) {
                                val lat = latLong[0]
                                val lon = latLong[1]
                                // (0,0)은 GPS 태그가 빈 값으로 박힌 사진 — 좌표 없음으로 본다
                                if (!(lat == 0.0 && lon == 0.0)) {
                                    out[id] = listOf(lat, lon)
                                }
                            }
                        }
                    } catch (e: Exception) {
                        // 권한 없음·파일 삭제됨·EXIF 없음 — 그 사진만 건너뛰고 계속한다.
                        // 한 장의 실패가 배치 전체를 무너뜨리면 안 된다.
                    }
                }
                promise.resolve(out)
            }
        }
    }
}
