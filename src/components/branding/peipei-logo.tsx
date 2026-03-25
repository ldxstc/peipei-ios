import { memo, type ComponentProps } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Svg, {
  Defs,
  Ellipse,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

import { colors, fonts } from '../../design/tokens';

type LogoMarkProps = {
  size?: number;
  style?: StyleProp<ViewStyle>;
};

type LogoLockupProps = {
  markSize?: number;
  style?: StyleProp<ViewStyle>;
  wordmarkLetterSpacing?: number;
  wordmarkStyle?: StyleProp<TextStyle>;
  wordmarkSize?: number;
};

type LogoWordmarkProps = {
  letterSpacing?: number;
  size?: number;
  style?: StyleProp<TextStyle>;
};

const MARK_BACKGROUND = '#1A1A2E';
const MARK_STROKE = '#F2EDE4';

export const PeiPeiLogoMark = memo(function PeiPeiLogoMark({
  size = 48,
  style,
}: LogoMarkProps) {
  const gradientId = `dawn-${size}`;

  return (
    <View style={style}>
      <Svg height={size} viewBox="0 0 512 512" width={size}>
        <Rect fill={MARK_BACKGROUND} height="512" rx="112" width="512" />
        <Defs>
          <RadialGradient cx="52%" cy="58%" id={gradientId} r="42%">
            <Stop offset="0%" stopColor="#C4956A" stopOpacity="0.4" />
            <Stop offset="100%" stopColor={MARK_BACKGROUND} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Path
          d="M 155 380 L 155 170 C 155 110, 195 78, 260 78 C 335 78, 355 128, 355 180 C 355 232, 330 264, 288 274 C 315 270, 348 268, 385 267 L 440 267"
          fill="none"
          stroke={MARK_STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="15"
        />
        <Ellipse cx="268" cy="182" fill={`url(#${gradientId})`} rx="40" ry="52" />
      </Svg>
    </View>
  );
});

export const PeiPeiWordmark = memo(function PeiPeiWordmark({
  letterSpacing = 8,
  size = 16,
  style,
}: LogoWordmarkProps) {
  return (
    <Text
      style={[
        styles.wordmark,
        {
          fontSize: size,
          letterSpacing,
        },
        style,
      ]}
    >
      PEIPEI
    </Text>
  );
});

export const PeiPeiLogo = memo(function PeiPeiLogo({
  markSize = 48,
  style,
  wordmarkLetterSpacing = 8,
  wordmarkStyle,
  wordmarkSize = 16,
}: LogoLockupProps) {
  return (
    <View style={[styles.lockup, style]}>
      <PeiPeiLogoMark size={markSize} />
      <PeiPeiWordmark
        letterSpacing={wordmarkLetterSpacing}
        size={wordmarkSize}
        style={wordmarkStyle}
      />
    </View>
  );
});

type PeiPeiHeaderMarkProps = {
  animatedStyle?: ComponentProps<typeof View>['style'];
  size?: number;
};

export const PeiPeiHeaderMark = memo(function PeiPeiHeaderMark({
  animatedStyle,
  size = 28,
}: PeiPeiHeaderMarkProps) {
  return (
    <View style={animatedStyle}>
      <PeiPeiLogoMark size={size} />
    </View>
  );
});

const styles = StyleSheet.create({
  lockup: {
    alignItems: 'center',
    gap: 12,
  },
  wordmark: {
    color: colors.text,
    fontFamily: fonts.coach,
    fontWeight: '400',
    textAlign: 'center',
  },
});
