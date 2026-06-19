//
//  PhotoVisionModule.swift
//  Step 2 — Expo Modules API 브릿지
//
//  JS의 analyzePhotos(uris) 호출을 백그라운드 큐에서 1장씩 처리하고,
//  각 장을 autoreleasepool로 감싸 메모리를 즉시 회수한다(OOM 방지).
//

import ExpoModulesCore

public class PhotoVisionModule: Module {
    public func definition() -> ModuleDefinition {
        Name("PhotoVision")

        // 이 모듈이 동작 가능한 환경인지 (iOS 18+ 미학 점수 가용 여부 포함)
        Constants([
            "aestheticsAvailable": {
                if #available(iOS 18.0, *) { return true } else { return false }
            }()
        ])

        // file:// 썸네일 경로 배열을 받아 품질 지표 배열을 돌려준다.
        AsyncFunction("analyzePhotos") { (uris: [String], promise: Promise) in
            DispatchQueue.global(qos: .utility).async {
                var results: [[String: Any]] = []
                results.reserveCapacity(uris.count)
                for uri in uris {
                    autoreleasepool {
                        results.append(PhotoVisionAnalyzer.analyze(uri: uri))
                    }
                }
                promise.resolve(results)
            }
        }
    }
}
