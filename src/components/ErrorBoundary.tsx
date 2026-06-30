/**
 * 전역 에러 바운더리
 *
 * 하위 트리에서 렌더 중 예외가 발생하면 앱 전체가 죽는 대신
 * 복구 화면을 보여주고 "다시 시도"로 리렌더를 시도한다.
 * (이벤트 핸들러/비동기 코드의 예외는 React 에러 바운더리가 잡지 못한다)
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import i18n from '../i18n';

const COLORS = {
  bg: '#0A0A0F',
  card: '#2E2E3B',
  purpleNeon: '#BF85FC',
  purpleDeep: '#6B21A8',
  white: '#FFFFFF',
  textDim: '#A1A1B0',
};

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, errorMessage: '' };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View style={st.container}>
        <View style={st.card}>
          <Text style={st.emoji}>🌍</Text>
          <Text style={st.title}>{i18n.t('comp.errorTitle')}</Text>
          <Text style={st.desc}>
            {i18n.t('comp.errorDesc')}
          </Text>
          {this.state.errorMessage ? (
            <Text style={st.errorDetail} numberOfLines={3}>
              {this.state.errorMessage}
            </Text>
          ) : null}
          <TouchableOpacity style={st.retryBtn} activeOpacity={0.8} onPress={this.handleRetry}>
            <Text style={st.retryText}>{i18n.t('comp.retry')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }
}

const st = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    backgroundColor: 'rgba(46,46,59,0.45)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: 24,
  },
  emoji: {
    fontSize: 44,
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: 10,
  },
  desc: {
    fontSize: 13,
    color: COLORS.textDim,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  errorDetail: {
    fontSize: 10,
    color: COLORS.textDim,
    opacity: 0.6,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryBtn: {
    backgroundColor: 'rgba(107,33,168,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.3)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 36,
  },
  retryText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.purpleNeon,
  },
});
