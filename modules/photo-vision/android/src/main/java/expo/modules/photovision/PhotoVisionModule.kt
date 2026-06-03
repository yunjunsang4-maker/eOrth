package expo.modules.photovision

//
//  Step 3 — Expo Modules API 브릿지 (Android)
//
//  iOS(PhotoVisionModule.swift)와 동일한 모듈명/함수 시그니처를 제공.
//  단일 스레드 Executor에서 1장씩 순차 처리하여 메모리 피크를 억제한다.
//

import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.Executors

class PhotoVisionModule : Module() {

    // 사진 분석 전용 백그라운드 스레드 (발열/메모리 제어)
    private val executor = Executors.newSingleThreadExecutor()

    override fun definition() = ModuleDefinition {
        Name("PhotoVision")

        // Android에는 OS 미학 점수 API가 없음
        Constants("aestheticsAvailable" to false)

        AsyncFunction("analyzePhotos") { uris: List<String>, promise: Promise ->
            executor.execute {
                try {
                    val results = uris.map { PhotoVisionAnalyzer.analyze(it) }
                    promise.resolve(results)
                } catch (e: Exception) {
                    promise.reject("ANALYZE_FAILED", e.message ?: "사진 분석 실패", e)
                }
            }
        }
    }
}
