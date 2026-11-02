package expo.modules.photolocation

//
//  사진 GPS 좌표만 배치로 읽는다 — iOS(PhotoLocationModule.swift)와 같은 모듈명·시그니처.
//
//  iOS와 달리 안드로이드에는 값싼 경로가 없다. 안드로이드 10(API 29)부터 스코프 스토리지가
//  MediaStore의 위치 정보를 가려서, ACCESS_MEDIA_LOCATION 권한 + setRequireOriginal로
//  원본 파일을 열어 EXIF를 직접 읽어야 한다(LATITUDE/LONGITUDE 컬럼 경로는 사라졌다).
//  그래도 이득은 있다 — expo-media-library의 getAssetInfoAsync는 좌표 외에 localUri·크기·
//  exif 전체까지 만들고 사진 1장마다 JS↔네이티브를 왕복하는데, 여기서는 GPS 태그만 읽고
//  왕복도 배치당 1회다.
//
//  속도(2026-08-27 S21+ 실측 장당 ~5ms)를 줄이려고 한 배치를 고정 크기 스레드 풀에 나눠
//  병렬로 읽는다. 장당 비용 대부분이 파일 열기·MediaProvider IPC 대기라, 몇 개를 겹치면
//  그만큼 줄어든다.
//  ⚠️ openFileDescriptor + ExifInterface(FileDescriptor)로 바꿔도 빨라지지 않는다 —
//     androidx 1.4.1 바이트코드상 두 생성자가 같은 loadAttributes(InputStream) 경로를 탄다
//     (seek FD는 저장·썸네일에서만 쓰인다). 2026-10-17 QA 확인, 그래서 스트림을 유지한다.
//

import android.content.ContentResolver
import android.content.ContentUris
import android.os.Build
import android.provider.MediaStore
import androidx.exifinterface.media.ExifInterface
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger

// ponytail: 4는 실측 전 추정. S21+ logcat 계측(배치 250장 소요 시간)으로 조정할 것.
// 너무 키우면 MediaProvider 쪽 경합으로 오히려 느려질 수 있다.
private const val READ_THREADS = 4

class PhotoLocationModule : Module() {

    // 파일 I/O 전용 백그라운드 풀 (모듈 큐를 막지 않는다).
    //
    // 데드락이 없는 이유: 풀 안의 어떤 작업도 다른 작업을 기다리지 않는다. 배치를 청크로 나눠
    // 각각 제출만 하고, 청크가 끝날 때마다 AtomicInteger를 줄여 "마지막으로 끝난 청크"가
    // resolve한다. 조정자가 풀 스레드 하나를 쥔 채 나머지를 기다리는 구조(Future.get 등)였다면
    // 배치가 동시에 여러 개 들어올 때 풀이 조정자로만 꽉 차 멈출 수 있다 — 그 구조를 피한 것.
    // 배치가 겹쳐 들어와도(스캔 취소 직후 재시작, 다른 화면의 동시 조회) 청크들이 같은 큐에
    // 줄을 설 뿐이고, 배치마다 맵·카운터가 따로라 결과가 섞이지 않는다.
    private val executor = Executors.newFixedThreadPool(READ_THREADS)

    override fun definition() = ModuleDefinition {
        Name("PhotoLocation")

        // 리로드마다 스레드 4개가 새지 않게 모듈이 내려갈 때 풀을 닫는다
        OnDestroy { executor.shutdown() }

        // 자산 id 배열 → { id: [위도, 경도] }. 좌표가 없는 사진은 키 자체가 없다(희소 맵).
        // id는 expo-media-library가 주는 값 그대로 = MediaStore의 _ID(숫자 문자열).
        AsyncFunction("getLocations") { assetIds: List<String>, promise: Promise ->
            val resolver = appContext.reactContext?.contentResolver
            if (resolver == null || assetIds.isEmpty()) {
                // 컨텍스트가 없으면 좌표를 못 읽는다 — 빈 맵을 주면 호출부가 기존 경로로 폴백한다.
                // 빈 배열은 청크가 0개라 아래 카운트다운이 영영 resolve하지 않으므로 여기서 끝낸다.
                promise.resolve(HashMap<String, List<Double>>())
            } else {
                // 여러 스레드가 동시에 쓰므로 스레드 안전 맵에 모은다
                val out = ConcurrentHashMap<String, List<Double>>(assetIds.size / 2 + 1)
                val chunkSize = (assetIds.size + READ_THREADS - 1) / READ_THREADS
                val chunks = assetIds.chunked(chunkSize)
                val remaining = AtomicInteger(chunks.size)
                for (chunk in chunks) {
                    executor.execute {
                        try {
                            for (id in chunk) readOne(resolver, id)?.let { out[id] = it }
                        } finally {
                            // 사진별 예외는 readOne 안에서 삼키지만, 그 밖에서 예외가 새어도 카운트는
                            // 반드시 줄인다 — 안 그러면 JS의 await가 영원히 안 끝난다.
                            // decrementAndGet이 0이 되는 스레드는 정확히 하나라 resolve도 정확히 1회다.
                            if (remaining.decrementAndGet() == 0) {
                                // 반환 타입을 예전(HashMap)과 똑같이 맞춰 JS 변환 경로를 바꾸지 않는다
                                promise.resolve(HashMap(out))
                            }
                        }
                    }
                }
            }
        }
    }

    // 사진 1장의 [위도, 경도]. 좌표가 없거나 읽기에 실패하면 null(= 맵에 키를 넣지 않음).
    private fun readOne(resolver: ContentResolver, id: String): List<Double>? {
        val rowId = id.toLongOrNull() ?: return null
        return try {
            var uri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, rowId)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                // ACCESS_MEDIA_LOCATION이 없으면 아래 열기에서 예외 → 그 사진만 건너뛴다.
                // 빼면 파일은 열리지만 MediaProvider가 위치를 가린(redacted) 사본을 줘서 좌표가 사라진다.
                uri = MediaStore.setRequireOriginal(uri)
            }
            resolver.openInputStream(uri)?.use { stream ->
                val latLong = ExifInterface(stream).latLong
                if (latLong != null && latLong.size == 2) {
                    val lat = latLong[0]
                    val lon = latLong[1]
                    // (0,0)은 GPS 태그가 빈 값으로 박힌 사진 — 좌표 없음으로 본다
                    if (!(lat == 0.0 && lon == 0.0)) listOf(lat, lon) else null
                } else null
            }
        } catch (e: Exception) {
            // 권한 없음·파일 삭제됨·EXIF 없음 — 그 사진만 건너뛰고 계속한다.
            // 한 장의 실패가 배치 전체를 무너뜨리면 안 된다.
            null
        }
    }
}
