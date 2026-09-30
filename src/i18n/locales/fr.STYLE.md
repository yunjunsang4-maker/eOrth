# 프랑스어(fr) 번역 어조 가이드·용어집

언어 코드는 **`'fr'` 하나**다(프랑스 표준). 캐나다(fr-CA)·벨기에(fr-BE)·스위스(fr-CH) 변형은 만들지 않았다.
스페인어처럼 두 벌로 갈라야 할 만큼 UI 어휘가 벌어지지 않았다는 판단이고, 필요해지면 그때
`es-ES.ts` 같은 덮어쓰기 리소스를 더한다(이 문서 4절에 차이표를 먼저 적을 것).

현지인 검수 1명이 필요하고, 피드백은 **이 문서를 먼저 고친 뒤** `fr.ts`에 반영한다.

## 0. 검수 확인 1순위 — vous / tu

지금 전부 **vous 체**다. 프랑스 소비자 앱의 기본값이고 Apple·Google·Instagram 프랑스어판 관례다.
젊은 층 대상 SNS 계열은 tu 로 가는 경우도 있어, **검수자가 뒤집고 싶으면 여기서 결정하고
한 번에 전량 교체한다.** 섞이는 것이 가장 나쁘다.

뒤집을 때 바뀌는 것: 동사 활용(`Choisissez` → `Choisis`), 소유형용사(`votre` → `ton/ta`),
대명사(`vous` → `tu/te`). 버튼의 동사 원형(`Enregistrer`)은 둘 다 그대로다.

## 1. 문체

| 자리 | 문체 | 예 |
|---|---|---|
| 버튼·탭·칩·메뉴 | 동사 원형(infinitif) 또는 명사. 마침표 없음 | Enregistrer · Fermer · Suivant · Pays visités |
| 안내문·설명 | 평서문, 마침표 | Votre position sert uniquement à remplir ce champ. |
| 사용자에게 시키는 안내 | **vous 명령형**(impératif) | Choisissez un pays dans la liste. |
| 질문형 확인창 제목 | `… ?` (물음표 앞 NBSP) | Revenir à l’écran de connexion ? |
| 오류·실패 | 「Impossible de…」 / 「Nous n’avons pas pu…」. 사과 안 붙임 | Le partage a échoué. |
| 접근성 라벨(a11y) | 짧은 동사 원형·명사구 | Mois précédent · Effacer la recherche |
| 온보딩 슬라이드 제목 | 짧은 카피, vous 명령형 허용 | Le voyage se termine, les souvenirs restent. |

- 앱이 주어인 문장은 「Nous analysons…」「Nous utilisons…」 1인칭 복수, 또는 무인칭 수동태.
- **성별 중립**: 사용자를 가리킬 때 과거분사·형용사의 성 일치가 필요한 문장을 피해 쓴다.
  「Vous serez déconnecté(e)」 같은 괄호 표기 금지 → 「Votre session sera fermée」처럼 주어를 바꾼다.
  환영 문구는 「Bienvenue」(성 중립).
- 「S’il vous plaît」 남발 금지. 명령형 자체가 충분히 공손하다.

## 2. 표기 규칙

### 2-1. 띄어쓰기(NBSP) — 이 언어의 핵심 규칙

프랑스어는 **이중 구두점(`?` `!` `:` `;`) 앞과 `«` 뒤·`»` 앞에 공백을 넣는다.** 그 공백은 반드시
**U+00A0(NBSP, 줄바꿈 없는 공백)** 이어야 한다. 일반 공백(U+0020)을 쓰면 줄바꿈이 일어날 때
물음표만 다음 줄로 떨어진다.

- **리터럴에는 `\u00A0` 이스케이프로 적는다.** 실제 NBSP 문자를 직접 넣으면 에디터에서 일반
  공백과 구분이 안 되고, 나중에 누가 포매터를 돌리면 조용히 일반 공백으로 바뀐다.
- U+202F(가는 NBSP)는 **쓰지 않는다.** 조판상 더 정확하지만 RN 폰트 폴백에서 렌더링이 불확실하다.
- 검사는 `src/i18n/localeParity.verify.ts` 5-4)가 한다 — `?!:;` 앞이 NBSP가 아니면 실패다.
- 해당 없는 것: `{{d}}J / {{n}}N` 의 슬래시, 목록 구분 중점(`·`), 이모지.

### 2-2. 그 밖의 표기

- 문장 첫 글자만 대문자(sentence case). 영어식 Title Case 금지: 「Pays visités」(○) 「Pays Visités」(×).
- **대문자에도 악센트를 붙인다**: 「À」「É」「État」「ÉTAPE」. 프랑스에서 흔히 생략하지만 정서법은 붙이는 쪽이다.
- 아포스트로피는 **타이포그래피 ’(U+2019)** 로 쓴다(`l’écran`). 곧은 `'` 는 쓰지 않는다.
- 날짜 `{{d}}/{{m}}/{{y}}`(일/월/년). **공지 목록(NoticeScreen)만 0 패딩** 「21/09/2026」 —
  프랑스 관례다. 스페인어는 무패딩(「21/9/2026」)이라 화면 분기가 따로 있다.
- 시각: **24시간 「9:05」**(`dmShareLogic.nowTimeString`). 공식 표기 「9 h 05」는 조판용이라
  메시지 타임스탬프에는 쓰지 않는다(폭이 넓어지고 검색·정렬 어감이 깨진다).
- 요일 3자, 첫 글자만 대문자, 마침표 없음: `Dim Lun Mar Mer Jeu Ven Sam`.
- 월 축약은 CLDR 표기 그대로 **소문자**: `janv. févr. mars avr. mai juin juil. août sept. oct. nov. déc.`
  (프랑스어 월 이름은 고유명사가 아니라 소문자다. 마침표 있는 것과 없는 것이 섞인 게 정상이다.)
- 박·일: `{{d}}J / {{n}}N` — 여행사 「4J/3N」 관례. 당일치기는 `Une journée`.
- 숫자 반각. 천 단위 구분은 UI에 안 나온다.
- 영문 고유명사(eOrth, ID, Feed, Blog, Snap, Album)는 그대로 둔다.

### 2-3. 복수형 — 알려진 한계

복수형은 i18next 접미사 `clé_one` / `clé_other` 두 벌로 적는다.

⚠️ **프랑스어 CLDR은 0도 `one`이다**(「0 voyage」가 맞고 「0 voyages」는 틀림). 그런데 Hermes에는
`Intl.PluralRules`가 없어서 i18next가 내부 dummyRule(`count === 1`)로 떨어지고, 0이 `_other`로
간다 → 화면에 「0 voyages」가 나간다. **이번 배선에서는 고치지 않는다.** 폴리필 도입은 러시아어·
폴란드어·아랍어처럼 규칙이 더 복잡한 언어를 넣을 때 함께 결정한다(스페인어는 0이 `other`라
우연히 맞아떨어져 이 문제가 드러나지 않았다).

## 3. 용어집 (앱 고유어 — 반드시 이 표기)

| ko | fr | 메모 |
|---|---|---|
| 지구본 | globe | 「globe terrestre」로 늘리지 않는다(버튼 폭) |
| 대륙(모드) | continents | |
| 여행 기록 / 기록 | **carnet de voyage / carnet** | 개수는 「3 carnets」. 「enregistrement」 금지(파일 저장 어감) |
| 기록 형식 | format de carnet | |
| 피드 / 블로그 / 스트립 / 사진첩 / 스냅 | Feed / Blog / **Bande** / Album / Snap | 「Bande」= bande de photos(사진 스트립) |
| 메이트 | **compagnon** (복수 compagnons) | 앱 고유어. 「ami」로 풀지 않는다 |
| 메이트 추천 | suggestions de compagnons | |
| 서로이웃 | suivi mutuel | |
| 거주국가 | pays de résidence | |
| 장기체류 | long séjour | |
| 체류 국가 | pays de séjour | |
| 방문한 나라 | pays visités | |
| 방문 지역 | régions visitées | |
| 인기 지역 | lieux populaires | |
| 광역(주/도) | provinces / États | 「États」 대문자 É |
| 업적 / 배지 | succès / badges | |
| 퍼즐 | puzzle | |
| 영토 표시 설정 | affichage des pays | 「territoire」 금지(정치 어감) |
| 활성화 색 | couleur des pays visités | |
| 즐겨찾기(★) | favoris | |
| 아이디 | identifiant / 짧은 라벨은 ID | |
| 계정 공개 범위 | visibilité du compte | |
| 팔로워 | abonnés | 「followers」 금지 |
| 갤러리(권한·가져오기) | Photos | iOS 앱 이름 |
| 현재 위치 | position actuelle | 「localisation」은 권한 이름에만 |
| 스냅 기록 | carnet Snap | |
| 알림 | notifications / 확인창 제목은 **Information** | |
| 저장 / 완료 / 확인 / 취소 | Enregistrer / Terminé / **OK** / Annuler | 프랑스 UI는 OK가 관례(es와 다르다) |
| 다음 / 닫기 / 변경 | Suivant / Fermer / Modifier | |
| 시작하기 | Commencer | |
| 계속 | Continuer | |
| 공유하기 | Partager | |
| 초기화 | Réinitialiser | |
| 가져오기 | Importer | |
| 추가하다 | ajouter | |
| 탭하다 | **appuyer sur** | 「cliquer」 금지(웹 어감) |
| 입력하다 | saisir | |

## 4. 하지 말 것

- 영어 어순 직역(「Pays visités voir」 ×) → 「Voir les pays visités」.
- 이중 구두점 앞 일반 공백. NBSP(`\u00A0`)가 아니면 검증이 실패한다(2-1절).
- 곧은 아포스트로피 `'`. 전부 `’`.
- 대문자 Title Case, 악센트 없는 대문자(「Etat」 ×).
- 「{{country}}」 앞에 전치사를 붙이는 문장. 프랑스어는 나라마다 전치사가 갈린다
  (au Japon / en France / aux États-Unis / à Singapour). 나라 이름 데이터에 관사가 없어
  자동으로 고를 수 없으므로, `recordFormatPromptCountry`·`regionTagSub`는 전치사를 피한
  구조(`{{country}} — comment…`, `…visitées : {{country}}`)로 적었다. **검수자가 더 자연스러운
  안을 내면 데이터 쪽 변경이 필요한지 함께 판단할 것.**

## 5. 검수 순서

1. 0절(vous/tu) 먼저 확정. 뒤집을 거면 여기서 뒤집는다.
2. 3절 용어집과 대조. 특히 **carnet**(기록)·**compagnon**(메이트)·**Bande**(스트립)는
   직역이 아니라 앱 고유어 결정이므로, 어색하면 표를 고치고 전량 교체한다.
3. 2-1절 NBSP·2-2절 표기 확인. `npm test`가 `localeParity.verify.ts`로 기계 검사한다
   (고아 키·한글 누출·복수형 짝 누락·NBSP).
4. 4절 마지막 항목({{country}} 전치사)은 문장 구조 자체에 대한 판단이라 따로 답을 달 것.
