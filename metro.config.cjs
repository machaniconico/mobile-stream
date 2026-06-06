const { getDefaultConfig, mergeConfig } = require("@react-native/metro-config");

const config = {
  resolver: {
    useWatchman: false
  }
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
