module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Reanimated 4: worklets 플러그인은 반드시 마지막에 위치
    plugins: ['react-native-worklets/plugin'],
  };
};
