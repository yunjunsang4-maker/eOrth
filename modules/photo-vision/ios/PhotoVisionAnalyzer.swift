//
//  PhotoVisionAnalyzer.swift
//  Step 2 — iOS Vision 기반 기술적 품질 평가 (순수 분석 로직)
//
//  ⚠️ OOM 방지 원칙:
//   - 원본 전체를 디코딩하지 않고 CGImageSource 썸네일 API로 '축소본'만 메모리에 올린다.
//   - 흔들림/노출 계산은 256px 작은 그레이스케일 버퍼에서만 수행한다.
//   - 호출부(Module)에서 사진 1장마다 autoreleasepool로 감싸 즉시 해제한다.
//

import Foundation
import CoreGraphics
import ImageIO
import Vision

/// 사진 1장 분석 결과 (JS로 그대로 직렬화)
struct PhotoAnalysis {
    var uri: String
    var blurVariance: Double      // 라플라시안 분산. 클수록 선명 (흐림이면 작음)
    var meanLuminance: Double     // 0~1 평균 밝기 (노출 판단용)
    var aestheticsScore: Double   // 0~1 미학 점수. 미지원(iOS<18)/실패 시 -1
    var isUtility: Bool           // 영수증/문서/스크린샷류 여부 (Vision 판정)
    // ─ 의미 분석 (Step 5) ─
    var hasFace: Bool = false     // 인물 포함 여부
    var isSmiling: Bool = false   // 웃는 얼굴 (iOS Vision은 미지원 → 항상 false, Android에서만 채움)
    var isFood: Bool = false      // 음식
    var isLandscape: Bool = false // 풍경/자연
    var isLandmark: Bool = false  // 건축물/랜드마크
    var error: String?

    func toDict() -> [String: Any] {
        return [
            "uri": uri,
            "blurVariance": blurVariance,
            "meanLuminance": meanLuminance,
            "aestheticsScore": aestheticsScore,
            "isUtility": isUtility,
            "hasFace": hasFace,
            "isSmiling": isSmiling,
            "isFood": isFood,
            "isLandscape": isLandscape,
            "isLandmark": isLandmark,
            "error": error as Any
        ]
    }
}

enum PhotoVisionAnalyzer {

    /// 분석용 최대 변(픽셀). 호출부가 이미 썸네일을 넘기더라도 방어적으로 한 번 더 축소.
    private static let maxAnalysisPixel = 512
    /// 흔들림/노출 계산용 그레이스케일 버퍼 한 변 크기.
    private static let grayEdge = 256

    /// 파일 경로(uri)를 받아 품질 지표를 계산한다.
    static func analyze(uri: String) -> [String: Any] {
        var result = PhotoAnalysis(
            uri: uri,
            blurVariance: 0,
            meanLuminance: 0,
            aestheticsScore: -1,
            isUtility: false,
            error: nil
        )

        guard let url = fileURL(from: uri) else {
            result.error = "INVALID_URI"
            return result.toDict()
        }

        // 1) 축소본(CGImage) 로드 — 원본 풀디코딩 회피
        guard let cgImage = downsampledImage(at: url, maxPixel: maxAnalysisPixel) else {
            result.error = "DECODE_FAILED"
            return result.toDict()
        }

        // 2) 그레이스케일 작은 버퍼 → 흔들림/노출 계산
        if let gray = grayscaleBuffer(from: cgImage, edge: grayEdge) {
            result.meanLuminance = meanLuminance(gray.pixels)
            result.blurVariance = laplacianVariance(gray.pixels, width: gray.width, height: gray.height)
        } else {
            result.error = "GRAYSCALE_FAILED"
        }

        // 3) Vision 미학 점수 + 유틸리티(문서) 판정 — iOS 18+
        if #available(iOS 18.0, *) {
            let aesthetics = aestheticsScore(for: cgImage)
            result.aestheticsScore = aesthetics.score
            result.isUtility = aesthetics.isUtility
        }

        // 4) 의미 분석 (Step 5) — 문서가 아닐 때만 (영수증/지도엔 불필요)
        if !result.isUtility {
            result.hasFace = detectFace(in: cgImage)
            let cls = classify(image: cgImage)
            result.isFood = cls.food
            result.isLandscape = cls.landscape
            result.isLandmark = cls.landmark
        }

        return result.toDict()
    }

    // MARK: - 의미 분석

    /// 얼굴 포함 여부 (iOS 13+). 웃음 판정 API는 없어 hasFace만 반환.
    private static func detectFace(in image: CGImage) -> Bool {
        let request = VNDetectFaceRectanglesRequest()
        let handler = VNImageRequestHandler(cgImage: image, options: [:])
        do {
            try handler.perform([request])
            return (request.results?.isEmpty == false)
        } catch {
            return false
        }
    }

    // VNClassifyImageRequest 식별자(taxonomy)를 키워드로 매핑
    private static let foodKeywords = ["food", "meal", "dish", "fruit", "vegetable",
        "dessert", "drink", "beverage", "coffee", "cake", "pizza", "bread"]
    private static let landscapeKeywords = ["outdoor", "landscape", "mountain", "beach",
        "sky", "sea", "ocean", "sunset", "sunrise", "nature", "field", "forest",
        "lake", "river", "cloud", "tree", "valley", "desert", "snow", "waterfall"]
    private static let landmarkKeywords = ["building", "architecture", "tower",
        "skyscraper", "monument", "castle", "temple", "church", "cathedral",
        "bridge", "statue", "palace", "landmark", "structure"]

    /// 이미지 분류로 음식/풍경/랜드마크 추정 (iOS 13+).
    private static func classify(image: CGImage) -> (food: Bool, landscape: Bool, landmark: Bool) {
        let request = VNClassifyImageRequest()
        let handler = VNImageRequestHandler(cgImage: image, options: [:])
        do {
            try handler.perform([request])
            guard let observations = request.results else { return (false, false, false) }
            let labels = observations
                .filter { $0.confidence > 0.6 }
                .map { $0.identifier.lowercased() }

            let hit = { (keys: [String]) -> Bool in
                labels.contains { id in keys.contains { id.contains($0) } }
            }
            return (hit(foodKeywords), hit(landscapeKeywords), hit(landmarkKeywords))
        } catch {
            return (false, false, false)
        }
    }

    // MARK: - 파일 경로 처리

    private static func fileURL(from uri: String) -> URL? {
        if uri.hasPrefix("file://") {
            return URL(string: uri)
        }
        if uri.hasPrefix("ph://") || uri.hasPrefix("assets-library://") {
            // PHAsset 경로는 미지원: 호출부에서 file:// 썸네일을 넘겨야 함
            return nil
        }
        return URL(fileURLWithPath: uri)
    }

    // MARK: - 메모리 효율적 다운샘플 로드

    private static func downsampledImage(at url: URL, maxPixel: Int) -> CGImage? {
        let srcOptions = [kCGImageSourceShouldCache: false] as CFDictionary
        guard let src = CGImageSourceCreateWithURL(url as CFURL, srcOptions) else { return nil }

        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixel
        ]
        return CGImageSourceCreateThumbnailAtIndex(src, 0, options as CFDictionary)
    }

    // MARK: - 그레이스케일 버퍼

    private struct GrayBuffer {
        let pixels: [UInt8]
        let width: Int
        let height: Int
    }

    /// CGImage를 한 변 `edge` 이하의 8bit 그레이스케일 버퍼로 변환.
    private static func grayscaleBuffer(from image: CGImage, edge: Int) -> GrayBuffer? {
        let ratio = min(1.0, Double(edge) / Double(max(image.width, image.height)))
        let w = max(1, Int(Double(image.width) * ratio))
        let h = max(1, Int(Double(image.height) * ratio))

        var pixels = [UInt8](repeating: 0, count: w * h)
        let colorSpace = CGColorSpaceCreateDeviceGray()

        guard let ctx = CGContext(
            data: &pixels,
            width: w,
            height: h,
            bitsPerComponent: 8,
            bytesPerRow: w,
            space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.none.rawValue
        ) else { return nil }

        ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
        return GrayBuffer(pixels: pixels, width: w, height: h)
    }

    // MARK: - 노출 (평균 밝기 0~1)

    private static func meanLuminance(_ pixels: [UInt8]) -> Double {
        guard !pixels.isEmpty else { return 0 }
        var sum = 0
        for p in pixels { sum += Int(p) }
        return (Double(sum) / Double(pixels.count)) / 255.0
    }

    // MARK: - 흔들림 (라플라시안 분산)

    /// 3x3 라플라시안 커널을 적용한 응답의 분산. 선명할수록 고주파 성분↑ → 분산↑.
    private static func laplacianVariance(_ pixels: [UInt8], width: Int, height: Int) -> Double {
        guard width > 2, height > 2 else { return 0 }

        var responses = [Double]()
        responses.reserveCapacity((width - 2) * (height - 2))

        for y in 1..<(height - 1) {
            for x in 1..<(width - 1) {
                let c = Int(pixels[y * width + x])
                let up = Int(pixels[(y - 1) * width + x])
                let down = Int(pixels[(y + 1) * width + x])
                let left = Int(pixels[y * width + (x - 1)])
                let right = Int(pixels[y * width + (x + 1)])
                // ∇² = 4*center - (상하좌우 합)
                let lap = Double(4 * c - up - down - left - right)
                responses.append(lap)
            }
        }

        let n = Double(responses.count)
        guard n > 0 else { return 0 }
        let mean = responses.reduce(0, +) / n
        var variance = 0.0
        for r in responses { variance += (r - mean) * (r - mean) }
        return variance / n
    }

    // MARK: - Vision 미학 점수 (iOS 18+)

    @available(iOS 18.0, *)
    private static func aestheticsScore(for image: CGImage) -> (score: Double, isUtility: Bool) {
        let request = VNGenerateImageAestheticsScoresRequest()
        let handler = VNImageRequestHandler(cgImage: image, options: [:])
        do {
            try handler.perform([request])
            if let obs = request.results?.first {
                // overallScore: -1.0 ~ 1.0 → 0~1 정규화
                let normalized = (Double(obs.overallScore) + 1.0) / 2.0
                return (normalized, obs.isUtility)
            }
        } catch {
            // 무시: 점수 미산출(-1)로 폴백
        }
        return (-1, false)
    }
}
