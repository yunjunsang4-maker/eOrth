import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  TextInput,
  Image,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Modal,
  Animated,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useRecords } from '../../store/recordStore';
import { COUNTRIES } from '../../constants/countries';
import { SparkleIcon, CameraIcon } from '../../components/icons';

const { width: screenWidth } = Dimensions.get('window');

const COLORS = {
  bg: '#0A0A0F',
  card: '#2E2E3B',
  purpleNeon: '#BF85FC',
  purpleDeep: '#6B21A8',
  white: '#FFFFFF',
  textDim: '#A1A1B0',
  divider: '#1A1A26',
  red: '#FF3B30',
};

const { width: SCREEN_W } = Dimensions.get('window');
const CELL = Math.floor((SCREEN_W - 48 - 12) / 7);
const WEEK_DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const MONTH_NAMES = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

function toKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function sameDay(a: Date, b: Date) { return toKey(a) === toKey(b); }

function getTodayString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}.${m}.${d}`;
}

function parseDateString(s: string): Date {
  const [y, m, d] = s.split('.').map(Number);
  const date = new Date(y, m - 1, d);
  date.setHours(0, 0, 0, 0);
  return date;
}

// ── 단일 날짜 선택 캘린더 모달 ──
function DatePickerModal({
  visible,
  initialDate,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  initialDate: Date;
  onConfirm: (date: Date) => void;
  onClose: () => void;
}) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [viewYear,  setViewYear]  = useState(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth());
  const [selected,  setSelected]  = useState<Date>(initialDate);
  const translateY = useRef(new Animated.Value(600)).current;

  useEffect(() => {
    if (visible) {
      setSelected(initialDate);
      setViewYear(initialDate.getFullYear());
      setViewMonth(initialDate.getMonth());
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 60, friction: 12 }).start();
    } else {
      translateY.setValue(600);
    }
  }, [visible]);

  const handlePrev = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const handleNext = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const grid = useCallback(() => {
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(viewYear, viewMonth, d);
      date.setHours(0, 0, 0, 0);
      cells.push(date);
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewYear, viewMonth]);

  const fmtSel = (d: Date) =>
    `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
        <Animated.View style={[dpStyles.sheet, { transform: [{ translateY }] }]}>
          <View style={dpStyles.handle} />
          <Text style={dpStyles.selectedTxt}>{fmtSel(selected)}</Text>
          <View style={dpStyles.monthNav}>
            <TouchableOpacity onPress={handlePrev} style={dpStyles.navBtn}>
              <Text style={dpStyles.navArrow}>‹</Text>
            </TouchableOpacity>
            <Text style={dpStyles.monthTitle}>{viewYear}년 {MONTH_NAMES[viewMonth]}</Text>
            <TouchableOpacity onPress={handleNext} style={dpStyles.navBtn}>
              <Text style={dpStyles.navArrow}>›</Text>
            </TouchableOpacity>
          </View>
          <View style={dpStyles.weekRow}>
            {WEEK_DAYS.map((d, i) => (
              <Text key={d} style={[dpStyles.weekDay, { width: CELL }, i===0 && { color: '#FF6B6B' }, i===6 && { color: '#5B9BD5' }]}>{d}</Text>
            ))}
          </View>
          <View style={dpStyles.grid}>
            {grid().map((date, idx) => {
              if (!date) return <View key={`e-${idx}`} style={{ width: CELL, height: CELL }} />;
              const isSel = sameDay(date, selected);
              const isToday = sameDay(date, today);
              const dow = date.getDay();
              return (
                <TouchableOpacity
                  key={toKey(date)}
                  onPress={() => setSelected(date)}
                  activeOpacity={0.7}
                  style={[dpStyles.dayCell, { width: CELL, height: CELL }, isSel && dpStyles.selCell]}
                >
                  <Text style={[
                    dpStyles.dayText,
                    isToday && !isSel && { color: COLORS.purpleNeon },
                    dow === 0 && !isSel && { color: '#FF6B6B' },
                    dow === 6 && !isSel && { color: '#5B9BD5' },
                    isSel && { color: '#fff', fontWeight: '700' },
                  ]}>
                    {date.getDate()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity
            style={dpStyles.confirmBtn}
            onPress={() => { onConfirm(selected); onClose(); }}
            activeOpacity={0.85}
          >
            <Text style={dpStyles.confirmText}>확인</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const dpStyles = StyleSheet.create({
  sheet: {
    backgroundColor: '#13102A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingBottom: 32,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(191,133,252,0.2)',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#3A3A55',
    alignSelf: 'center',
    marginBottom: 16,
  },
  selectedTxt: {
    fontSize: 18, fontWeight: '700', color: '#fff',
    textAlign: 'center', marginBottom: 12,
  },
  monthNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 10,
  },
  navBtn: { padding: 8 },
  navArrow: { fontSize: 22, color: '#fff' },
  monthTitle: { fontSize: 15, fontWeight: '700', color: '#fff' },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekDay: { textAlign: 'center', fontSize: 12, color: '#A1A1B0', paddingVertical: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: {
    alignItems: 'center', justifyContent: 'center',
    borderRadius: CELL / 2,
  },
  selCell: { backgroundColor: '#6B21A8' },
  dayText: { fontSize: 14, color: '#E0E0EF' },
  confirmBtn: {
    backgroundColor: '#6B21A8',
    borderRadius: 14, height: 50,
    justifyContent: 'center', alignItems: 'center',
    marginTop: 16,
  },
  confirmText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

export default function MomentRecordScreen({ navigation, route }: { navigation: any; route: any }) {
  const { addRecord } = useRecords();

  const [step, setStep] = useState(1);
  const [photo, setPhoto] = useState<string | null>(null);
  const [countrySearch, setCountrySearch] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<{ flag: string; name: string } | null>(null);
  const [date, setDate] = useState(getTodayString());
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [sentence, setSentence] = useState('');

  useEffect(() => {
    const params = route?.params;
    if (params?.selectedCountry) {
      const name = params.selectedCountry.name?.toLowerCase() || '';
      const found = COUNTRIES.find(c => c.term.includes(name) || c.name === params.selectedCountry.name);
      if (found) {
        setSelectedCountry({ flag: found.flag, name: found.name });
      }
    }
  }, [route?.params]);

  const filtered = useMemo(
    () =>
      COUNTRIES.filter(c =>
        c.term.toLowerCase().includes(countrySearch.toLowerCase())
      ).slice(0, 20),
    [countrySearch]
  );

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: false,
      quality: 0.8,
    });
    if (!result.canceled && result.assets.length > 0) {
      setPhoto(result.assets[0].uri);
    }
  };

  const handleSave = () => {
    if (!selectedCountry || !photo) return;
    addRecord({
      viewType: 'moment',
      country: selectedCountry.flag,
      countryName: selectedCountry.name,
      countryFlag: selectedCountry.flag,
      countries: [selectedCountry],
      content: sentence,
      medias: [photo],
      date,
      visibility: 'friends',
      isVoyager: false,
      user: { name: '나', emoji: '✈️', handle: 'yunjunsung' },
      timestamp: Date.now(),
    } as any);
    navigation.goBack();
  };

  const photoSize = screenWidth - 32;

  // ── 상단 헤더 ──
  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.cancelBtn}>
        <Text style={styles.cancelTxt}>취소</Text>
      </TouchableOpacity>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><SparkleIcon size={16} color="#A1A1B0" /><Text style={styles.headerTitle}>모먼트</Text></View>
      <View style={{ width: 44 }} />
    </View>
  );

  // ── 스텝 도트 ──
  const renderDots = () => (
    <View style={styles.dotsRow}>
      {[1, 2, 3].map(n => (
        <View
          key={n}
          style={[
            styles.dot,
            n === step ? styles.dotActive : n < step ? styles.dotDone : styles.dotInactive,
          ]}
        />
      ))}
    </View>
  );

  const canNext = () => {
    if (step === 1) return !!photo;
    if (step === 2) return !!selectedCountry && sentence.trim().length > 0;
    return true;
  };

  const handleNext = () => {
    if (step < 3) setStep(s => s + 1);
  };

  const handlePrev = () => {
    if (step > 1) setStep(s => s - 1);
  };

  // ── 하단 NavBar ──
  const renderNavBar = () => (
    <View style={styles.navBar}>
      {step > 1 ? (
        <TouchableOpacity style={styles.prevBtn} onPress={handlePrev} activeOpacity={0.8}>
          <Text style={styles.prevTxt}>← 이전</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.prevPlaceholder} />
      )}
      {step < 3 ? (
        <TouchableOpacity
          style={[styles.nextBtn, !canNext() && styles.nextBtnDisabled]}
          onPress={handleNext}
          disabled={!canNext()}
          activeOpacity={0.85}
        >
          <Text style={styles.nextBtnText}>다음 →</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.85}>
          <Text style={styles.saveBtnText}>저장하기</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  // ── Step 1: 사진 선택 ──
  const renderStep1 = () => (
    <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      <TouchableOpacity style={[styles.photoArea, { width: photoSize, height: photoSize }]} onPress={pickPhoto} activeOpacity={0.85}>
        {photo ? (
          <Image source={{ uri: photo }} style={{ width: photoSize, height: photoSize, borderRadius: 12 }} resizeMode="cover" />
        ) : (
          <View style={styles.photoPlaceholder}>
            <CameraIcon size={48} color="#A1A1B0" />
            <Text style={styles.photoPlaceholderText}>한 장의 순간을 담아보세요</Text>
          </View>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.galleryBtn} onPress={pickPhoto} activeOpacity={0.85}>
        <Text style={styles.galleryBtnText}>갤러리에서 선택</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  // ── Step 2: 국가 + 한 문장 ──
  const renderStep2 = () => (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionLabel}>어느 나라에서였나요?</Text>

        {selectedCountry ? (
          <TouchableOpacity
            style={styles.selectedCountryRow}
            onPress={() => { setSelectedCountry(null); setCountrySearch(''); }}
          >
            <Text style={styles.selectedCountryFlag}>{selectedCountry.flag}</Text>
            <Text style={styles.selectedCountryName}>{selectedCountry.name}</Text>
            <Text style={[styles.textDim, { marginLeft: 'auto' }]}>변경</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TextInput
              style={styles.searchInput}
              placeholder="국가 검색..."
              placeholderTextColor={COLORS.textDim}
              value={countrySearch}
              onChangeText={setCountrySearch}
            />
            {countrySearch.length > 0 && (
              <View style={styles.searchResults}>
                {filtered.map(c => (
                  <TouchableOpacity
                    key={c.term}
                    style={styles.searchResultItem}
                    onPress={() => {
                      setSelectedCountry({ flag: c.flag, name: c.name });
                      setCountrySearch('');
                    }}
                  >
                    <Text style={styles.searchResultFlag}>{c.flag}</Text>
                    <Text style={styles.searchResultName}>{c.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        )}

        <Text style={[styles.sectionLabel, { marginTop: 24 }]}>날짜</Text>
        <TouchableOpacity
          style={styles.dateDisplay}
          onPress={() => setCalendarVisible(true)}
          activeOpacity={0.75}
        >
          <Text style={styles.dateText}>{date}</Text>
          <Text style={styles.dateEditHint}>✏️</Text>
        </TouchableOpacity>

        <View style={styles.sentenceLabelRow}>
          <Text style={styles.sectionLabel}>한 문장으로</Text>
          <Text style={styles.charCounter}>{sentence.length}/50</Text>
        </View>
        <TextInput
          style={styles.sentenceInput}
          placeholder="이 순간을 한 문장으로..."
          placeholderTextColor={COLORS.textDim}
          value={sentence}
          onChangeText={t => setSentence(t)}
          maxLength={50}
          multiline
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );

  // ── Step 3: 미리보기 + 저장 ──
  const renderStep3 = () => (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <Text style={styles.previewLabel}>이렇게 저장될 거예요</Text>

      <View style={styles.previewCard}>
        {photo && (
          <Image
            source={{ uri: photo }}
            style={styles.previewImage}
            resizeMode="cover"
          />
        )}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.75)']}
          style={styles.previewOverlay}
        >
          {selectedCountry && (
            <Text style={styles.previewCountry}>
              {selectedCountry.flag} {selectedCountry.name}
            </Text>
          )}
          <Text style={styles.previewSentence}>{sentence}</Text>
          <Text style={styles.previewDate}>{date}</Text>
        </LinearGradient>
      </View>
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.container}>
      {renderHeader()}
      {renderDots()}
      <View style={{ flex: 1 }}>
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
      </View>
      {renderNavBar()}
      <DatePickerModal
        visible={calendarVisible}
        initialDate={parseDateString(date)}
        onConfirm={(d) => {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          setDate(`${y}.${m}.${day}`);
        }}
        onClose={() => setCalendarVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  cancelBtn: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  cancelTxt: {
    color: COLORS.textDim,
    fontSize: 15,
    fontWeight: '500',
  },
  headerTitle: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: '700',
  },
  // ── 하단 NavBar ──
  navBar: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    paddingBottom: 24,
    backgroundColor: COLORS.bg,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  prevPlaceholder: { flex: 0 },
  prevBtn: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  prevTxt: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textDim,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginVertical: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    backgroundColor: COLORS.purpleNeon,
    width: 20,
    borderRadius: 4,
  },
  dotDone: {
    backgroundColor: COLORS.purpleDeep,
  },
  dotInactive: {
    backgroundColor: COLORS.card,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  photoArea: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: COLORS.card,
    alignSelf: 'center',
    marginBottom: 16,
  },
  photoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  photoEmoji: {
    fontSize: 48,
  },
  photoPlaceholderText: {
    color: COLORS.textDim,
    fontSize: 15,
  },
  galleryBtn: {
    backgroundColor: COLORS.purpleDeep,
    borderRadius: 12,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  galleryBtnText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '600',
  },
  nextBtn: {
    flex: 2,
    backgroundColor: COLORS.purpleDeep,
    borderRadius: 14,
    paddingVertical: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nextBtnDisabled: {
    opacity: 0.4,
  },
  nextBtnText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '700',
  },
  sectionLabel: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 8,
  },
  selectedCountryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    gap: 10,
  },
  selectedCountryFlag: {
    fontSize: 22,
  },
  selectedCountryName: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '600',
  },
  textDim: {
    color: COLORS.textDim,
    fontSize: 14,
  },
  searchInput: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 14,
    color: COLORS.white,
    fontSize: 15,
    marginBottom: 4,
  },
  searchResults: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    marginBottom: 8,
    overflow: 'hidden',
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  searchResultFlag: {
    fontSize: 20,
  },
  searchResultName: {
    color: COLORS.white,
    fontSize: 15,
  },
  dateDisplay: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '600',
  },
  dateEditHint: {
    color: COLORS.purpleNeon,
    fontSize: 13,
  },
  sentenceLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 0,
    marginBottom: 8,
  },
  charCounter: {
    color: COLORS.textDim,
    fontSize: 13,
  },
  sentenceInput: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 14,
    color: COLORS.white,
    fontSize: 15,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 8,
  },
  previewLabel: {
    color: COLORS.textDim,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  previewCard: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: COLORS.card,
    marginBottom: 24,
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  previewOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingTop: 32,
  },
  previewCountry: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  previewSentence: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  previewDate: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
  },
  saveBtn: {
    flex: 2,
    backgroundColor: COLORS.purpleDeep,
    borderRadius: 14,
    paddingVertical: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveBtnText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '700',
  },
});
