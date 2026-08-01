# App Store 스토어 등록 문구 (초안)

작성 기준: 실제 구현된 기능만 기재한다. 비활성 기능(방문한 나라 시트 `SHOW_VISITED_SHEET=false`,
지구본 광고 `SHOW_GLOBE_ADS=false`)과 외부 SNS 공유(스토어 링크만 나감)는 넣지 않는다.
프리미엄은 현재 `LAUNCH_FREE_PREMIUM=true`로 전 기능이 열려 있으므로 "유료" 표현을 쓰지 않는다.

---

## 프로모션 텍스트 (170자, 심사 없이 수정 가능)

```
출시 기념 — 프리미엄 기능을 모두 무료로 열었어요.
다녀온 나라가 사진으로 채워지는 나만의 지구본, 지금 만들어 보세요.
```

> 유료 전환 시 이 문구만 지우면 된다(새 빌드 불필요). "출시 기념"이라는 한정 표현을 유지할 것.

---

## 앱 설명 (Description) — 한국어

```
갤러리에 잠자던 여행 사진이, 나만의 지구본이 됩니다.

eOrth는 다녀온 나라를 사진으로 채워가는 여행 기록 앱이에요.
갤러리 속 사진을 분석해 지난 해외여행을 자동으로 찾아주니,
처음 켜는 순간부터 내 지구본이 채워지기 시작합니다.


■ 지난 여행을 자동으로 찾아드려요

거주 국가 밖에서 찍은 사진을 날짜와 위치로 묶어 여행 단위로 정리해요.
몇 년 전 여행도 사진만 남아 있다면 그대로 되살아납니다.


■ 다녀온 나라가 사진으로 채워지는 지구본

방문한 나라마다 대표 사진이 입혀져요.
네온 지구본과 유리 지구본, 원하는 모습으로 바꿔 볼 수 있어요.
나라 안에서 다녀온 지역까지 지도에 표시됩니다.


■ 기록하는 방식은 취향대로

피드, 블로그, 스트립, 모먼트 중에서 고르세요.
한 번의 여행이 카드 하나로 묶여 프로필에 차곡차곡 쌓입니다.


■ 추억이 쌓여 업적이 돼요

방문한 나라와 도시, 여행 스타일에 따라 배지를 모을 수 있어요.


■ 메이트와 나누기

아이디로 친구를 찾고, 여행 취향이 비슷한 사람을 추천받아요.
마음에 든 기록은 메시지로 바로 나눌 수 있어요.


■ 오래 머무는 여행도

한 나라에 길게 머무는 장기 체류는 따로 기록할 수 있어요.


---

위치와 알림 권한은 선택입니다.
허용하지 않아도 국가를 직접 입력해 모든 기능을 그대로 사용할 수 있어요.
```

---

## 앱 설명 (Description) — English

```
The travel photos sitting in your gallery become your own globe.

eOrth is a travel journal that fills in the countries you've been to
with your own photos. It reads your gallery and finds your past trips
automatically, so your globe starts filling in from day one.


■ Your past trips, found for you

Photos taken outside your home country are grouped by date and place
into trips. A journey from years ago comes back as long as the photos
are still there.


■ A globe that fills in with your photos

Every country you've visited gets one of your photos.
Switch between the neon globe and the glass globe,
and see the regions you've been to marked on the map.


■ Record it your way

Choose from Feed, Blog, Strip, and Moment.
Each trip becomes a single card that stacks up on your profile.


■ Memories become milestones

Collect badges based on the countries and cities you've visited
and how you travel.


■ Share with mates

Find friends by username, or get suggestions from people
whose travel taste is close to yours. Send a record you liked
straight into a message.


■ For longer stays

Staying somewhere for a while? Log it as a long stay.


---

Location and notification permissions are optional.
You can enter countries by hand and use every feature without them.
```

---

## 키워드 (100자, 쉼표 구분 · 공백 없이)

한국어 (96자):
```
여행기록,여행일기,여행일지,여행앨범,해외여행,세계지도,방문국가,여행스탬프,다이어리,트래블로그,갤러리정리,가본나라,여행플래너,여행지도,세계여행,배낭여행,자유여행,여행수첩,여권
```

영문 로케일 (98자):
```
travel,journal,map,trip,diary,album,countries,visited,memories,logbook,passport,stamp,world,places
```

### 규칙
- **쉼표 뒤 공백 금지** — 공백도 100자에 포함된다.
- **앱 이름·부제 단어는 넣지 않는다.** Apple이 이미 색인한다. 부제가
  `사진으로 채우는 나만의 지구본` 이므로 `사진`·`지구본` 은 제외했고,
  영문 부제 `Fill your globe with photos` 때문에 `globe`·`photo` 도 뺐다.
- **영어는 낱말 단위, 한국어는 복합어 단위.** Apple 이 키워드를 조합하므로
  영어는 `travel` + `journal` 로 "travel journal" 이 잡힌다. 한국어는 조합 매칭이
  그만큼 확실하지 않아 사용자가 실제로 치는 복합어를 그대로 넣는 편이 안전하다.
- `앱`·`무료` 같은 군더더기, 카테고리명 단독, 경쟁 앱 이름(정책 위반 소지)은 금지.

### 선정 의도
- `갤러리정리` — 이 앱의 최대 강점(갤러리에서 지난 여행 자동 발견)을 찾는 사람은
  "여행 앱"이 아니라 "사진 정리"로 검색한다. 경쟁이 덜한 진입로.
- `여행스탬프` / `passport` / `stamp` — 여권에 도장 찍듯 나라를 모으는 앱을
  찾는 사용자층의 어휘.

> ⚠️ 이름·부제·키워드는 **함께** 정해야 한다. 부제를 바꾸면 중복 단어가 달라져
> 키워드도 다시 짜야 한다.

---

## 부제 (Subtitle, 30자)

```
사진으로 채우는 나만의 지구본
```

영문:
```
Fill your globe with photos
```

---

## 작성 시 주의

- **"무료"를 영구적으로 표현하지 말 것.** 프리미엄 유료화 시 리뷰 불만으로 돌아온다.
- **다른 플랫폼·경쟁 앱 언급 금지.** 심사 지적 대상이다.
- 설명 앞 2~3줄이 "더 보기" 전에 노출되는 유일한 구간이다 — 훅을 여기에 둘 것.
- 스크린샷이 설명보다 전환에 크게 작용한다. 지구본이 사진으로 채워진 화면을 1번에 둘 것.
