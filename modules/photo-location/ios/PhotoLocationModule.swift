//
//  PhotoLocationModule.swift
//  사진 GPS 좌표만 배치로 읽는다.
//
//  왜 필요한가: expo-media-library의 getAssetInfoAsync는 좌표(asset.location)와 함께
//  localUri와 exif까지 만든다. 그 두 개가 requestContentEditingInput + CIImage(contentsOf:)로
//  원본 파일을 여는 비용이라, 실측에서 회당 15.5ms가 걸렸다(1,383회 = 21.5초, 스캔의 69.6%).
//  우리가 필요한 건 좌표뿐이고, asset.location은 Photos DB 필드라 파일을 열지 않는다.
//  fetchAssets(withLocalIdentifiers:)로 한 번에 조회하면 사실상 공짜다.
//

import ExpoModulesCore
import Photos
// CLLocationCoordinate2DIsValid를 쓰므로 명시적으로 가져온다. asset.location의 타입(CLLocation)은
// Photos를 통해 보이지만, CoreLocation의 C 함수까지 재수출된다는 보장은 없다.
import CoreLocation

public class PhotoLocationModule: Module {
    public func definition() -> ModuleDefinition {
        Name("PhotoLocation")

        // 자산 id 배열 → { id: [위도, 경도] }. 좌표가 없는 사진은 키 자체가 없다(희소 맵).
        // id는 expo-media-library가 주는 값 그대로 = PHAsset.localIdentifier.
        AsyncFunction("getLocations") { (assetIds: [String], promise: Promise) in
            DispatchQueue.global(qos: .userInitiated).async {
                var out: [String: [Double]] = [:]
                // 좌표 있는 사진 비율이 실측 약 절반이라 절반만 잡아 둔다
                out.reserveCapacity(assetIds.count / 2 + 1)

                // 한 번의 Photos DB 조회. 없는 id는 결과에서 그냥 빠진다(에러 아님).
                let fetched = PHAsset.fetchAssets(withLocalIdentifiers: assetIds, options: nil)
                fetched.enumerateObjects { asset, _, _ in
                    if let loc = asset.location {
                        let c = loc.coordinate
                        // 좌표가 유효한지 확인 — 위치 없는 사진이 (0,0)으로 오는 경우를 막는다
                        if CLLocationCoordinate2DIsValid(c) && !(c.latitude == 0 && c.longitude == 0) {
                            out[asset.localIdentifier] = [c.latitude, c.longitude]
                        }
                    }
                }
                promise.resolve(out)
            }
        }
    }
}
