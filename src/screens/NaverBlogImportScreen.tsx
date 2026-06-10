import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  ActivityIndicator,
  Alert,
  Keyboard,
} from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { DeviceEventEmitter } from 'react-native';
import {
  isNaverBlogUrl,
  toMobileNaverUrl,
  parseNaverHtml,
  NAVER_BLOG_EXTRACT_JS,
  BlogData,
} from '../utils/naverBlogConverter';

const C = {
  bg:         '#0A0A0F',
  card:       '#2E2E3B',
  cardLight:  '#1E1B33',
  purpleNeon: '#BF85FC',
  purpleDeep: '#6B21A8',
  purpleBg:   'rgba(107,33,168,0.25)',
  purpleBorder: 'rgba(191,133,252,0.3)',
  white:      '#FFFFFF',
  dim:        '#A1A1B0',
  muted:      '#4A4A59',
  divider:    '#1A1A26',
  green:      '#34C759',
  red:        '#FF3B30',
};

interface Props {
  navigation: any;
  route?: any;
}

type Step = 'input' | 'loading' | 'preview';

export default function NaverBlogImportScreen({ navigation, route }: Props) {
  const [url, setUrl] = useState('');
  const [step, setStep] = useState<Step>('input');
  const [blogData, setBlogData] = useState<BlogData | null>(null);
  const [webviewUrl, setWebviewUrl] = useState('');
  const [extractAttempted, setExtractAttempted] = useState(false);
  const webviewRef = useRef<WebView>(null);

  // ─── URL 유효성 확인 후 WebView 로드 ───
  const handleLoadUrl = () => {
    Keyboard.dismiss();
    const trimmed = url.trim();
    if (!trimmed) {
      Alert.alert('URL 입력', '네이버 블로그 URL을 입력해주세요.');
      return;
    }
    if (!isNaverBlogUrl(trimmed)) {
      Alert.alert(
        '잘못된 URL',
        '네이버 블로그 URL만 지원합니다.\n예: https://blog.naver.com/아이디/글번호',
      );
      return;
    }
    setStep('loading');
    setExtractAttempted(false);
    // 모바일 URL로 변환 (iframe 우회)
    setWebviewUrl(toMobileNaverUrl(trimmed));
  };

  // ─── WebView 로드 완료 → JS 인젝션 ───
  const extractTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageReceived = useRef(false);
  const injectionCount = useRef(0);
  const handleWebViewLoad = () => {
    messageReceived.current = false;
    injectionCount.current = 0;
    // 폴링 방식: 1초 간격으로 콘텐츠가 로드될 때까지 반복 주입 (최대 20초)
    const pollInterval = setInterval(() => {
      injectionCount.current += 1;
      if (messageReceived.current || injectionCount.current > 20) {
        clearInterval(pollInterval);
        if (!messageReceived.current) {
          setExtractAttempted(true);
        }
        return;
      }
      webviewRef.current?.injectJavaScript(NAVER_BLOG_EXTRACT_JS);
      if (injectionCount.current >= 3) setExtractAttempted(true);
    }, 1000);
    // 안전장치: 25초 후에도 응답 없으면 타임아웃
    if (extractTimeout.current) clearTimeout(extractTimeout.current);
    extractTimeout.current = setTimeout(() => {
      clearInterval(pollInterval);
      if (!messageReceived.current) {
        Alert.alert('시간 초과', '블로그 내용을 불러오지 못했어요.\n다시 시도해주세요.');
        setStep('input');
      }
    }, 25000);
  };

  // ─── WebView 메시지 수신 ───
  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'naverBlogData' || data.type === 'naverBlogError') {
        messageReceived.current = true;
        if (extractTimeout.current) clearTimeout(extractTimeout.current);
      }
      if (data.type === 'naverBlogData') {
        // HTML 파싱으로 BlogData 생성
        const parsed = parseNaverHtml(data.html || '');

        // WebView에서 직접 추출한 데이터로 보완
        if (data.title && !parsed.title) parsed.title = data.title;
        if (data.images && data.images.length > 0 && parsed.photos.length === 0) {
          parsed.photos = data.images;
        }
        if (data.tags && data.tags.length > 0 && (!parsed.keywords || parsed.keywords.length === 0)) {
          parsed.keywords = data.tags;
        }
        // 순서 보존 블록 전달
        if (data.orderedBlocks && data.orderedBlocks.length > 0) {
          parsed.orderedBlocks = data.orderedBlocks;
        }

        setBlogData(parsed);
        setStep('preview');
      } else if (data.type === 'naverBlogError') {
        Alert.alert('파싱 오류', '블로그 내용을 읽는 데 실패했어요.\n다시 시도해주세요.');
        setStep('input');
      }
    } catch {
      // JSON 파싱 실패 무시
    }
  };

  // ─── 가져오기 확정 → BlogRecordScreen으로 돌아가면서 데이터 전달 ───
  const handleConfirmImport = () => {
    if (!blogData) return;
    DeviceEventEmitter.emit('naverBlogImported', blogData);
    navigation.goBack();
  };

  // ─── 다시 시도 ───
  const handleRetry = () => {
    setStep('input');
    setBlogData(null);
    setWebviewUrl('');
    setExtractAttempted(false);
  };

  return (
    <SafeAreaView style={st.safe}>
      {/* 헤더 */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={st.headerBtn}>
          <Text style={st.headerBtnText}>닫기</Text>
        </TouchableOpacity>
        <Text style={st.headerTitle}>네이버 블로그 가져오기</Text>
        <View style={{ width: 50 }} />
      </View>

      {/* ─── STEP 1: URL 입력 ─── */}
      {step === 'input' && (
        <View style={st.inputContainer}>
          <View style={st.iconWrap}>
            <Text style={st.iconText}>N</Text>
          </View>
          <Text style={st.desc}>
            네이버 블로그 글의 URL을 붙여넣으면{'\n'}
            내용을 자동으로 가져올 수 있어요
          </Text>

          <View style={st.urlInputWrap}>
            <TextInput
              style={st.urlInput}
              placeholder="https://blog.naver.com/..."
              placeholderTextColor={C.muted}
              value={url}
              onChangeText={setUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="go"
              onSubmitEditing={handleLoadUrl}
            />
          </View>

          <TouchableOpacity style={st.loadBtn} onPress={handleLoadUrl} activeOpacity={0.8}>
            <Text style={st.loadBtnText}>블로그 불러오기</Text>
          </TouchableOpacity>

          <View style={st.tipBox}>
            <Text style={st.tipTitle}>이렇게 사용하세요</Text>
            <Text style={st.tipItem}>1. 네이버 블로그 앱에서 글 공유 → 링크 복사</Text>
            <Text style={st.tipItem}>2. 위 입력란에 붙여넣기</Text>
            <Text style={st.tipItem}>3. 제목, 본문, 사진, 해시태그가 자동으로 채워져요</Text>
          </View>
        </View>
      )}

      {/* ─── STEP 2: 로딩 (숨겨진 WebView) ─── */}
      {step === 'loading' && (
        <View style={st.loadingContainer}>
          <ActivityIndicator size="large" color={C.purpleNeon} />
          <Text style={st.loadingText}>블로그 내용을 불러오는 중...</Text>
          <Text style={st.loadingSubText}>잠시만 기다려주세요</Text>

          {/* 숨겨진 WebView */}
          <View style={st.hiddenWebview}>
            <WebView
              ref={webviewRef}
              source={{ uri: webviewUrl }}
              onLoadEnd={handleWebViewLoad}
              onMessage={handleMessage}
              onError={() => {
                Alert.alert('로드 실패', '블로그 페이지를 불러올 수 없어요.');
                setStep('input');
              }}
              onHttpError={(syntheticEvent) => {
                const { statusCode } = syntheticEvent.nativeEvent;
                if (statusCode >= 400) {
                  Alert.alert('로드 실패', `블로그 페이지를 불러올 수 없어요. (${statusCode})`);
                  setStep('input');
                }
              }}
              javaScriptEnabled
              domStorageEnabled
              thirdPartyCookiesEnabled
              sharedCookiesEnabled
              setSupportMultipleWindows={false}
              allowsInlineMediaPlayback
              userAgent="Mozilla/5.0 (Linux; Android 14; SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36"
            />
          </View>

          {/* 시간 초과 시 수동 재시도 */}
          {extractAttempted && (
            <TouchableOpacity style={st.retryBtn} onPress={() => {
              webviewRef.current?.injectJavaScript(NAVER_BLOG_EXTRACT_JS);
            }}>
              <Text style={st.retryBtnText}>콘텐츠 추출 재시도</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ─── STEP 3: 미리보기 ─── */}
      {step === 'preview' && blogData && (
        <View style={st.previewContainer}>
          <View style={st.previewHeader}>
            <Text style={st.previewIcon}>✓</Text>
            <Text style={st.previewTitle}>가져오기 완료!</Text>
            <Text style={st.previewSubtitle}>아래 내용을 확인해주세요</Text>
          </View>

          <View style={st.previewCard}>
            {/* 제목 */}
            <View style={st.previewRow}>
              <Text style={st.previewLabel}>제목</Text>
              <Text style={st.previewValue} numberOfLines={2}>
                {blogData.title || '(없음)'}
              </Text>
            </View>

            {/* 본문 미리보기 */}
            <View style={st.previewDivider} />
            <View style={st.previewRow}>
              <Text style={st.previewLabel}>본문</Text>
              <Text style={st.previewValue} numberOfLines={4}>
                {blogData.body ? blogData.body.substring(0, 200) + (blogData.body.length > 200 ? '...' : '') : '(없음)'}
              </Text>
            </View>

            {/* 사진 수 */}
            {blogData.photos.length > 0 && (
              <>
                <View style={st.previewDivider} />
                <View style={st.previewRow}>
                  <Text style={st.previewLabel}>사진</Text>
                  <Text style={st.previewValue}>{blogData.photos.length}장</Text>
                </View>
              </>
            )}



            {/* 키워드 */}
            {blogData.keywords && blogData.keywords.length > 0 && (
              <>
                <View style={st.previewDivider} />
                <View style={st.previewRow}>
                  <Text style={st.previewLabel}>태그</Text>
                  <Text style={st.previewValue}>
                    {blogData.keywords.map(k => `#${k}`).join(' ')}
                  </Text>
                </View>
              </>
            )}
          </View>

          <View style={st.previewActions}>
            <TouchableOpacity style={st.retryOutlineBtn} onPress={handleRetry}>
              <Text style={st.retryOutlineBtnText}>다시 시도</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.confirmBtn} onPress={handleConfirmImport} activeOpacity={0.8}>
              <Text style={st.confirmBtnText}>이 내용으로 작성하기</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },

  // 헤더
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.divider,
  },
  headerBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  headerBtnText: { color: C.purpleNeon, fontSize: 15, fontWeight: '600' },
  headerTitle: { color: C.white, fontSize: 16, fontWeight: '700' },

  // ─── STEP 1: URL 입력 ───
  inputContainer: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
    alignItems: 'center',
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#03C75A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  iconText: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '900',
  },
  desc: {
    color: C.dim,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  urlInputWrap: {
    width: '100%',
    marginBottom: 16,
  },
  urlInput: {
    width: '100%',
    height: 50,
    backgroundColor: C.cardLight,
    borderRadius: 12,
    paddingHorizontal: 16,
    color: C.white,
    fontSize: 14,
    borderWidth: 1,
    borderColor: C.purpleBorder,
  },
  loadBtn: {
    width: '100%',
    height: 50,
    borderRadius: 12,
    backgroundColor: C.purpleDeep,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  loadBtnText: {
    color: C.white,
    fontSize: 16,
    fontWeight: '700',
  },
  tipBox: {
    width: '100%',
    backgroundColor: C.cardLight,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: C.divider,
  },
  tipTitle: {
    color: C.purpleNeon,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
  },
  tipItem: {
    color: C.dim,
    fontSize: 12,
    lineHeight: 20,
  },

  // ─── STEP 2: 로딩 ───
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  loadingText: {
    color: C.white,
    fontSize: 16,
    fontWeight: '600',
    marginTop: 20,
  },
  loadingSubText: {
    color: C.dim,
    fontSize: 13,
    marginTop: 6,
  },
  hiddenWebview: {
    width: 390,
    height: 844,
    opacity: 0,
    position: 'absolute',
    left: -9999,
  },
  retryBtn: {
    marginTop: 24,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.purpleBorder,
  },
  retryBtnText: {
    color: C.purpleNeon,
    fontSize: 13,
    fontWeight: '600',
  },

  // ─── STEP 3: 미리보기 ───
  previewContainer: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 30,
  },
  previewHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  previewIcon: {
    fontSize: 32,
    color: C.green,
    marginBottom: 8,
  },
  previewTitle: {
    color: C.white,
    fontSize: 18,
    fontWeight: '700',
  },
  previewSubtitle: {
    color: C.dim,
    fontSize: 13,
    marginTop: 4,
  },
  previewCard: {
    backgroundColor: C.cardLight,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: C.purpleBorder,
    marginBottom: 24,
  },
  previewRow: {
    paddingVertical: 8,
  },
  previewLabel: {
    color: C.purpleNeon,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  previewValue: {
    color: C.white,
    fontSize: 14,
    lineHeight: 20,
  },
  previewDivider: {
    height: 1,
    backgroundColor: C.divider,
    marginVertical: 4,
  },
  previewActions: {
    flexDirection: 'row',
    gap: 12,
  },
  retryOutlineBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.purpleBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryOutlineBtnText: {
    color: C.dim,
    fontSize: 14,
    fontWeight: '600',
  },
  confirmBtn: {
    flex: 2,
    height: 48,
    borderRadius: 12,
    backgroundColor: C.purpleDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnText: {
    color: C.white,
    fontSize: 15,
    fontWeight: '700',
  },
});
