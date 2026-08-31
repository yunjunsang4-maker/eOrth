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
            // ─ 확장 신호 (형식 추천, 2026-08-31) ─
            "sceneLabels" to emptyList<Map<String, Any>>(),
            "faceCount" to 0,
            "hasText" to false,
            "colorStats" to emptyMap<String, Double>(),
            "dhash" to "",
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
            result["dhash"] = differenceHash(bitmap)
            result["colorStats"] = colorStatistics(bitmap)

            val image = InputImage.fromBitmap(bitmap, 0)
            val textLen = recognizedTextLength(image)
            val isUtility = textLen >= UTILITY_TEXT_LEN
            result["isUtility"] = isUtility

            // 의미 분석은 문서가 아닐 때만 (영수증/지도엔 불필요)
            if (!isUtility) {
                result["hasText"] = textLen >= 20   // 메뉴판/표지판 수준
                val faces = detectFaces(image)
                result["faceCount"] = faces.first
                result["hasFace"] = faces.first > 0
                result["isSmiling"] = faces.second
                val cls = classifyImageWithLabels(image)
                result["isFood"] = cls.food
                result["isLandscape"] = cls.landscape
                result["isLandmark"] = cls.landmark
                result["sceneLabels"] = cls.topLabels
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

    // ─── 인식된 텍스트 길이(공백 제외) — isUtility·hasText 공용 ───
    private fun recognizedTextLength(image: InputImage): Int {
        return try {
            // 백그라운드 스레드에서 호출되므로 Tasks.await 블로킹 사용 가능
            val visionText = Tasks.await(textRecognizer.process(image))
            visionText.text.replace(Regex("\\s"), "").length
        } catch (e: Exception) { 0 }
    }

    // ─── 얼굴 수 + 웃음 → (faceCount, isSmiling) ───
    private fun detectFaces(image: InputImage): Pair<Int, Boolean> {
        return try {
            val faces = Tasks.await(faceDetector.process(image))
            val smiling = faces.any { (it.smilingProbability ?: 0f) >= SMILE_PROB }
            Pair(faces.size, smiling)
        } catch (e: Exception) { Pair(0, false) }
    }

    // ─── 분류 1회 → 카테고리 + 상위 10 라벨 ───
    private data class ClassLabels(
        val food: Boolean, val landscape: Boolean, val landmark: Boolean,
        val topLabels: List<Map<String, Any>>
    )

    private fun classifyImageWithLabels(image: InputImage): ClassLabels {
        return try {
            val all = Tasks.await(imageLabeler.process(image))
            val topLabels = all
                .filter { it.confidence >= 0.3f }
                .sortedByDescending { it.confidence }
                .take(10)
                .map { mapOf<String, Any>("label" to it.text.lowercase(), "confidence" to it.confidence.toDouble()) }

            val strong = all.filter { it.confidence >= LABEL_CONFIDENCE }.map { it.text.lowercase() }
            fun hit(keys: List<String>) = strong.any { label -> keys.any { label.contains(it) } }
            ClassLabels(hit(FOOD_KEYWORDS), hit(LANDSCAPE_KEYWORDS), hit(LANDMARK_KEYWORDS), topLabels)
        } catch (e: Exception) {
            ClassLabels(false, false, false, emptyList())
        }
    }

    // ─── 색감 통계 — 64px 축소본에서 채도/색온도/대비/어두움 ───
    private fun colorStatistics(bitmap: Bitmap): Map<String, Double> {
        val edge = 64
        val ratio = min(1.0, edge.toDouble() / max(bitmap.width, bitmap.height))
        val w = max(1, (bitmap.width * ratio).toInt())
        val h = max(1, (bitmap.height * ratio).toInt())
        val scaled = Bitmap.createScaledBitmap(bitmap, w, h, true)
        val argb = IntArray(w * h)
        scaled.getPixels(argb, 0, w, 0, 0, w, h)
        if (scaled != bitmap) scaled.recycle()

        var satSum = 0.0; var warmSum = 0.0; var lumSum = 0.0; var lumSqSum = 0.0
        var darkCount = 0
        for (c in argb) {
            val r = ((c shr 16) and 0xFF) / 255.0
            val g = ((c shr 8) and 0xFF) / 255.0
            val b = (c and 0xFF) / 255.0
            val maxC = maxOf(r, g, b); val minC = minOf(r, g, b)
            satSum += if (maxC == 0.0) 0.0 else (maxC - minC) / maxC
            warmSum += (r - b + 1.0) / 2.0
            val lum = 0.299 * r + 0.587 * g + 0.114 * b
            lumSum += lum
            lumSqSum += lum * lum
            if (lum < 0.235) darkCount++
        }
        val n = argb.size.toDouble()
        val lumMean = lumSum / n
        val variance = max(0.0, lumSqSum / n - lumMean * lumMean)
        return mapOf(
            "saturation" to satSum / n,
            "warmth" to warmSum / n,
            "contrast" to min(1.0, Math.sqrt(variance) * 4.0),
            "darkness" to darkCount / n,
        )
    }

    // ─── dHash — 9x8 그레이스케일 가로 인접 비교, 64bit 16진수 16자 (iOS와 동일 알고리즘) ───
    private fun differenceHash(bitmap: Bitmap): String {
        val w = 9; val h = 8
        val scaled = Bitmap.createScaledBitmap(bitmap, w, h, true)
        val argb = IntArray(w * h)
        scaled.getPixels(argb, 0, w, 0, 0, w, h)
        if (scaled != bitmap) scaled.recycle()

        val lum = IntArray(w * h)
        for (i in argb.indices) {
            val c = argb[i]
            lum[i] = (((c shr 16) and 0xFF) * 299 + ((c shr 8) and 0xFF) * 587 + (c and 0xFF) * 114) / 1000
        }
        var bits = 0L
        for (y in 0 until h) {
            for (x in 0 until w - 1) {
                bits = bits shl 1
                if (lum[y * w + x] > lum[y * w + x + 1]) bits = bits or 1L
            }
        }
        return String.format("%016x", bits)
    }
}
