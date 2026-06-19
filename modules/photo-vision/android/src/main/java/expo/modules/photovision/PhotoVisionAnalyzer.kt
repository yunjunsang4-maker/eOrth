package expo.modules.photovision

//
//  Step 3 — Android ML Kit + 비트맵 기반 기술적 품질 평가 (순수 분석 로직)
//
//  iOS(PhotoVisionAnalyzer.swift)와 동일한 출력 스키마를 반환하여
//  JS 레이어가 플랫폼을 구분하지 않도록 한다.
//
//  ⚠️ OOM 방지:
//   - BitmapFactory inSampleSize 로 축소 디코딩(원본 풀디코딩 회피)
//   - 흔들림/노출은 256px 그레이스케일 버퍼에서만 계산
//   - 사용한 Bitmap 은 즉시 recycle()
//

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import com.google.mlkit.vision.label.ImageLabeling
import com.google.mlkit.vision.label.defaults.ImageLabelerOptions
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.io.File
import kotlin.math.max
import kotlin.math.min

object PhotoVisionAnalyzer {

    private const val MAX_ANALYSIS_PIXEL = 512   // 분석용 최대 변
    private const val GRAY_EDGE = 256            // 흔들림/노출 계산용 한 변
    private const val UTILITY_TEXT_LEN = 120     // 공백 제외 텍스트가 이 길이 이상이면 문서/스크린샷류로 추정
    private const val SMILE_PROB = 0.6f          // 웃음 확률 임계값
    private const val LABEL_CONFIDENCE = 0.6f    // 이미지 라벨 신뢰도 임계값

    // 이미지 라벨 → 카테고리 매핑 키워드 (소문자 contains 매칭)
    private val FOOD_KEYWORDS = listOf("food", "meal", "dish", "fruit", "vegetable",
        "dessert", "drink", "coffee", "cake", "bread")
    private val LANDSCAPE_KEYWORDS = listOf("mountain", "beach", "sky", "sea", "ocean",
        "sunset", "sunrise", "nature", "forest", "lake", "river", "cloud", "tree",
        "snow", "waterfall", "landscape")
    private val LANDMARK_KEYWORDS = listOf("building", "tower", "skyscraper", "monument",
        "castle", "temple", "church", "bridge", "statue", "palace", "landmark")

    // 검출기는 배치 전체에서 재사용 (장마다 모델 재로딩 방지)
    private val faceDetector by lazy {
        FaceDetection.getClient(
            FaceDetectorOptions.Builder()
                .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_ALL) // 웃음 확률 필요
                .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
                .build()
        )
    }
    private val imageLabeler by lazy {
        ImageLabeling.getClient(ImageLabelerOptions.DEFAULT_OPTIONS)
    }
    private val textRecognizer by lazy {
        TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    }

    /** file:// 썸네일 경로 1건을 분석하여 iOS와 동일한 키 구조의 Map 반환 */
    fun analyze(uri: String): Map<String, Any?> {
        val result = hashMapOf<String, Any?>(
            "uri" to uri,
            "blurVariance" to 0.0,
            "meanLuminance" to 0.0,
            "aestheticsScore" to -1.0, // Android(ML Kit)에는 미학 점수 API 없음 → 미지원 센티넬
            "isUtility" to false,
            // ─ 의미 분석 (Step 5) ─
            "hasFace" to false,
            "isSmiling" to false,
            "isFood" to false,
            "isLandscape" to false,
            "isLandmark" to false,
            "error" to null
        )

        val path = filePath(uri)
        if (path == null) {
            result["error"] = "INVALID_URI"
            return result
        }

        val bitmap = decodeDownsampled(path, MAX_ANALYSIS_PIXEL)
        if (bitmap == null) {
            result["error"] = "DECODE_FAILED"
            return result
        }

        try {
            val gray = toGray(bitmap, GRAY_EDGE)
            result["meanLuminance"] = meanLuminance(gray.lum)
            result["blurVariance"] = laplacianVariance(gray.lum, gray.width, gray.height)

            val image = InputImage.fromBitmap(bitmap, 0)
            val isUtility = detectUtility(image)
            result["isUtility"] = isUtility

            // 의미 분석은 문서가 아닐 때만 (영수증/지도엔 불필요)
            if (!isUtility) {
                val face = detectFace(image)
                result["hasFace"] = face.first
                result["isSmiling"] = face.second
                val cls = classifyImage(image)
                result["isFood"] = cls.food
                result["isLandscape"] = cls.landscape
                result["isLandmark"] = cls.landmark
            }
        } catch (e: Exception) {
            result["error"] = e.message ?: "ANALYZE_ERROR"
        } finally {
            bitmap.recycle()
        }
        return result
    }

    // ─── 파일 경로 ───
    private fun filePath(uri: String): String? = when {
        uri.startsWith("file://") -> Uri.parse(uri).path
        uri.startsWith("content://") -> null // 호출부에서 file:// 썸네일을 넘겨야 함
        else -> uri
    }

    // ─── 다운샘플 디코딩 ───
    private fun decodeDownsampled(path: String, maxPixel: Int): Bitmap? {
        if (!File(path).exists()) return null

        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(path, bounds)
        val w = bounds.outWidth
        val h = bounds.outHeight
        if (w <= 0 || h <= 0) return null

        var sample = 1
        while (max(w, h) / sample > maxPixel) sample *= 2

        val opts = BitmapFactory.Options().apply {
            inSampleSize = sample
            inPreferredConfig = Bitmap.Config.ARGB_8888
        }
        return BitmapFactory.decodeFile(path, opts)
    }

    // ─── 그레이스케일 ───
    private data class Gray(val lum: IntArray, val width: Int, val height: Int)

    private fun toGray(bitmap: Bitmap, edge: Int): Gray {
        val ratio = min(1.0, edge.toDouble() / max(bitmap.width, bitmap.height))
        val w = max(1, (bitmap.width * ratio).toInt())
        val h = max(1, (bitmap.height * ratio).toInt())

        val scaled = Bitmap.createScaledBitmap(bitmap, w, h, true)
        val argb = IntArray(w * h)
        scaled.getPixels(argb, 0, w, 0, 0, w, h)
        if (scaled != bitmap) scaled.recycle()

        val lum = IntArray(w * h)
        for (i in argb.indices) {
            val c = argb[i]
            val r = (c shr 16) and 0xFF
            val g = (c shr 8) and 0xFF
            val b = c and 0xFF
            // ITU-R BT.601 가중치
            lum[i] = (r * 299 + g * 587 + b * 114) / 1000
        }
        return Gray(lum, w, h)
    }

    // ─── 노출 (평균 밝기 0~1) ───
    private fun meanLuminance(lum: IntArray): Double {
        if (lum.isEmpty()) return 0.0
        var sum = 0L
        for (p in lum) sum += p
        return (sum.toDouble() / lum.size) / 255.0
    }

    // ─── 흔들림 (라플라시안 분산) ───
    private fun laplacianVariance(lum: IntArray, w: Int, h: Int): Double {
        if (w <= 2 || h <= 2) return 0.0
        val n = (w - 2) * (h - 2)
        val resp = DoubleArray(n)
        var idx = 0
        for (y in 1 until h - 1) {
            for (x in 1 until w - 1) {
                val c = lum[y * w + x]
                val up = lum[(y - 1) * w + x]
                val down = lum[(y + 1) * w + x]
                val left = lum[y * w + (x - 1)]
                val right = lum[y * w + (x + 1)]
                resp[idx++] = (4 * c - up - down - left - right).toDouble()
            }
        }
        var mean = 0.0
        for (r in resp) mean += r
        mean /= n
        var variance = 0.0
        for (r in resp) variance += (r - mean) * (r - mean)
        return variance / n
    }

    // ─── 문서/스크린샷 판정 (ML Kit Text Recognition) ───
    private fun detectUtility(image: InputImage): Boolean {
        return try {
            // 백그라운드 스레드에서 호출되므로 Tasks.await 블로킹 사용 가능
            val visionText = Tasks.await(textRecognizer.process(image))
            visionText.text.replace(Regex("\\s"), "").length >= UTILITY_TEXT_LEN
        } catch (e: Exception) {
            false // 인식 실패 시 문서 아님으로 보수적 처리
        }
    }

    // ─── 얼굴/웃음 (ML Kit Face Detection) → (hasFace, isSmiling) ───
    private fun detectFace(image: InputImage): Pair<Boolean, Boolean> {
        return try {
            val faces = Tasks.await(faceDetector.process(image))
            val hasFace = faces.isNotEmpty()
            val smiling = faces.any { (it.smilingProbability ?: 0f) >= SMILE_PROB }
            Pair(hasFace, smiling)
        } catch (e: Exception) {
            Pair(false, false)
        }
    }

    // ─── 음식/풍경/랜드마크 (ML Kit Image Labeling) ───
    private data class ClassResult(val food: Boolean, val landscape: Boolean, val landmark: Boolean)

    private fun classifyImage(image: InputImage): ClassResult {
        return try {
            val labels = Tasks.await(imageLabeler.process(image))
                .filter { it.confidence >= LABEL_CONFIDENCE }
                .map { it.text.lowercase() }

            fun hit(keys: List<String>) = labels.any { label -> keys.any { label.contains(it) } }
            ClassResult(hit(FOOD_KEYWORDS), hit(LANDSCAPE_KEYWORDS), hit(LANDMARK_KEYWORDS))
        } catch (e: Exception) {
            ClassResult(false, false, false)
        }
    }
}
