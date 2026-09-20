# 스페인어(es) 번역 어조 가이드·용어집 — 중남미 중립형(es-419) 기반 + 스페인식(es-ES) 차이표

두 벌을 따로 번역하지 않는다. **`es.ts`가 중남미 중립형 본문이고, `es-ES.ts`는 스페인에서 다르게 쓰는 키만 덮어쓴다.**
i18next 계층이 `es-419 → es → en`, `es-ES → es → en`이라(실측) 공통 키는 한 곳에만 둔다.
현지인 검수는 중남미 1명·스페인 1명이 필요하고, 피드백은 **이 문서를 먼저 고친 뒤** 리소스에 반영한다.

## 1. 문체

| 자리 | 문체 | 예 |
|---|---|---|
| 버튼·탭·칩·메뉴 | 동사 원형(infinitivo) 또는 명사. 마침표 없음 | Guardar · Cerrar · Siguiente · Países visitados |
| 안내문·설명 | 평서문, 마침표 | Tu ubicación solo se usa para rellenar este campo y no se guarda. |
| 사용자에게 시키는 안내 | **tú 명령형**(imperativo) | Elige un país de la lista. |
| 질문형 확인창 제목 | ¿…? 양쪽 물음표 | ¿Volver a la pantalla de inicio de sesión? |
| 오류·실패 | 「No se pudo…」 / 「No pudimos…」. 사과 안 붙임 | No pudimos detectar tu ubicación. |
| 접근성 라벨(a11y) | 짧은 동사 원형·명사구 | Mes anterior · Borrar búsqueda |
| 온보딩 슬라이드 제목 | 짧은 카피, tú 명령형 허용 | El viaje termina, los recuerdos quedan. |

- **2인칭은 tú.** usted는 은행·관공서 어감. 스페인식도 tú(vosotros는 복수 2인칭이 UI에 거의 안 나와 문제 없음).
- 앱이 주어인 문장은 「Buscamos…」「Analizamos…」 1인칭 복수, 또는 무인칭 「se guarda」.
- 버튼은 원형(Guardar), 사용자 지시는 명령형(Guarda tu…). 섞지 않는다.
- **성별 중립**: 사용자를 가리킬 때 형용사 성 일치가 필요한 문장은 피해 쓴다(「Bienvenido/a」 금지 → 「Te damos la bienvenida」). 「usuarios」 같은 총칭 복수는 그대로 허용(현지 관례).

## 2. 표기 규칙

- 문장 첫 글자만 대문자(sentence case). 영어식 Title Case 금지: 「Países visitados」(○) 「Países Visitados」(×).
- ¿ ¡ 를 반드시 연다. 느낌표는 완료 축하 한 곳 정도.
- 숫자 반각. 천 단위 구분은 UI에 안 나옴. 날짜 `{{d}}/{{m}}/{{y}}`, 요일 3자(Dom Lun Mar Mié Jue Vie Sáb), 월 3자(Ene … Dic, 「Sep」).
- **복수형은 i18next 접미사**로: `clave_one` / `clave_other`. 「1 viajes」가 나오면 결함. `{{count}}`가 든 키는 전부 두 벌.
- 박·일: `{{d}}D / {{n}}N`(여행사 표기 「4D/3N」 관례). 당일치기: Un día.
- 시간: **es-419는 12시간 「9:05 a. m.」**(RAE 표기, 점·공백), **es-ES는 24시간 「9:05」**.
- 악센트 필수(á é í ó ú ñ). 대문자에도 붙인다(「Álbum」).
- 영문 고유명사(eOrth, ID, STEP 1 / 2)는 그대로. 「app」은 소문자 여성명사(la app).

## 3. 용어집 (앱 고유어 — 반드시 이 표기)

| ko | es(공통) | 메모 |
|---|---|---|
| 지구본 | globo terráqueo / 토글·짧은 자리는 globo | |
| 대륙(모드) | continentes | en과 같음 |
| 여행 기록 / 기록 | registro de viaje / registro | 「récord」 금지(기록=성적 어감) |
| 기록 형식 | formato de registro | |
| 피드 / 블로그 / 스트립 / 사진첩 / 스냅 | Feed / Blog / Tira / Álbum / Snap | 「Tira」= tira de fotos |
| 컷 | corte → 화면에선 Tira로 통일 | |
| 메이트 | compañero | 앱 고유어. 「amigo」로 풀지 않는다. 복수 compañeros |
| 서로이웃 | seguimiento mutuo | |
| 메이트 추천 | sugerencias de compañeros | 「recomendación」보다 앱 관례 |
| 거주국가 | país de residencia | |
| 장기체류 | estadía larga (419) / **estancia larga (ES)** | 차이표 |
| 체류 국가 | país de estadía (419) / **país de estancia (ES)** | 차이표 |
| 방문한 나라 | países visitados | |
| 방문 지역 | regiones visitadas | |
| 인기 지역 | lugares populares | |
| 광역(주/도) | provincias / estados | |
| 업적 / 배지 | logros / insignias | |
| 퍼즐 | rompecabezas (419) / **puzle (ES)** | 차이표 |
| 영토 표시 설정 | visualización de países | 「territorio」 금지(정치 어감) |
| 활성화 색 | color de países visitados | |
| 즐겨찾기(★) | favoritos | |
| 아이디 | ID | |
| 계정 공개 범위 | visibilidad de la cuenta | |
| 팔로워 | seguidores | |
| 갤러리(권한·가져오기) | Fotos | iOS 앱 이름. 「Galería」는 안드로이드 어감 |
| 현재 위치 | ubicación actual | |
| 스냅 기록 | registro Snap | |
| 여행 DNA | ADN viajero | |
| 알림 | notificaciones / 확인창 제목은 Aviso | |
| 저장 / 완료 / 확인 / 취소 | Guardar / Listo / Aceptar / Cancelar | 「OK」 금지 |
| 다음 / 닫기 / 변경 | Siguiente / Cerrar / Cambiar | |
| 시작하기 | Empezar | 「Comenzar」보다 구어 |
| 계속 | Continuar | |
| 공유하기 | Compartir | |
| 초기화 | Restablecer | |
| 가져오기 | Importar | |
| 추가하다 | agregar (419) / **añadir (ES)** | 차이표 |
| 탭하다 | tocar | 「hacer clic」 금지(웹) |
| 입력하다 | ingresar (419) / **introducir (ES)** | 차이표 |

## 4. es-ES 차이표 (es-ES.ts에만 두는 키)

| 개념 | es-419 (es.ts) | es-ES (es-ES.ts) |
|---|---|---|
| 입력하다 | ingresa / ingresar | introduce / introducir |
| 추가하다 | agregar | añadir |
| 장기체류 | estadía | estancia |
| 퍼즐 | rompecabezas | puzle |
| 시간 표기 | 9:05 a. m. | 9:05 (24h) |
| 검색 예시 국가 | México | España |
| 휴대폰 (후속 섹션) | celular | móvil |
| 컴퓨터 (후속 섹션) | computadora | ordenador |
| 동영상 (후속 섹션) | video | vídeo |
| 자동차 (후속 섹션) | carro / auto | coche |
| 「coger」 | **양쪽 다 금지**(중남미 비속어) → tomar / agarrar | |

새 차이가 발견되면 이 표에 먼저 적고 es-ES.ts에 키를 더한다. 표에 없는 키를 es-ES.ts에 넣지 않는다.

## 5. 하지 말 것

- 영어 어순 직역(「Países visitados ver」 ×). 「Ver países visitados」.
- 「Por favor」 남발. 명령형 자체가 공손하다.
- 「usted」「vosotros」「vos」(리오플라텐세 voseo는 중립형에서 제외).
- 「Ok」「Okay」. 「Aceptar」.
- 대문자 Title Case.

## 6. 검수 순서

1. 이 문서 2·3·4절과 대조. 복수형 두 벌 확인.
2. `npm test` — localeParity.verify.ts가 고아 키·한글 누출·**복수형 짝 누락**·es-ES가 es.ts에 없는 키를 갖는지 잡는다.
3. 현지인 검수는 온보딩→메인 샘플로 먼저(중남미·스페인 각 1명), 반영 후 나머지.
