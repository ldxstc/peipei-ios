import { HStack, Text, VStack } from '@expo/ui/swift-ui';
import {
  font,
  foregroundStyle,
  lineLimit,
  monospacedDigit,
  padding,
} from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity } from 'expo-widgets';

type PeiPeiRaceWeekActivityProps = {
  daysToRace: string;
  headline: string;
  trainingStatus: string;
};

function PeiPeiRaceWeekActivity(props: PeiPeiRaceWeekActivityProps) {
  'widget';

  return {
    banner: (
      <VStack modifiers={[padding({ all: 14 })]} spacing={6}>
        <Text
          modifiers={[
            font({ size: 13, weight: 'medium' }),
            foregroundStyle('#8B3A3A'),
          ]}
        >
          Race week
        </Text>
        <Text
          modifiers={[
            font({ size: 20, weight: 'bold' }),
            foregroundStyle('#F2EDE4'),
            monospacedDigit(),
          ]}
        >
          {props.daysToRace}
        </Text>
        <Text
          modifiers={[
            font({ size: 14, weight: 'medium' }),
            foregroundStyle('#F2EDE4'),
            lineLimit(1),
          ]}
        >
          {props.trainingStatus}
        </Text>
        <Text
          modifiers={[
            font({ size: 12 }),
            foregroundStyle('#6B6B66'),
            lineLimit(2),
          ]}
        >
          {props.headline}
        </Text>
      </VStack>
    ),
    compactLeading: (
      <Text
        modifiers={[
          font({ size: 12, weight: 'medium' }),
          foregroundStyle('#8B3A3A'),
        ]}
      >
        PP
      </Text>
    ),
    compactTrailing: (
      <Text
        modifiers={[
          font({ size: 12, weight: 'bold' }),
          foregroundStyle('#F2EDE4'),
          monospacedDigit(),
        ]}
      >
        {props.daysToRace}
      </Text>
    ),
    expandedBottom: (
      <HStack modifiers={[padding({ all: 12 })]}>
        <VStack spacing={4}>
          <Text
            modifiers={[
              font({ size: 13, weight: 'medium' }),
              foregroundStyle('#8B3A3A'),
            ]}
          >
            Training status
          </Text>
          <Text
            modifiers={[
              font({ size: 16, weight: 'bold' }),
              foregroundStyle('#F2EDE4'),
              lineLimit(1),
            ]}
          >
            {props.trainingStatus}
          </Text>
        </VStack>
      </HStack>
    ),
    expandedCenter: (
      <VStack modifiers={[padding({ all: 12 })]} spacing={4}>
        <Text
          modifiers={[
            font({ size: 12, weight: 'medium' }),
            foregroundStyle('#6B6B66'),
          ]}
        >
          Countdown
        </Text>
        <Text
          modifiers={[
            font({ size: 24, weight: 'bold' }),
            foregroundStyle('#F2EDE4'),
            monospacedDigit(),
          ]}
        >
          {props.daysToRace}
        </Text>
      </VStack>
    ),
    minimal: (
      <Text
        modifiers={[
          font({ size: 11, weight: 'bold' }),
          foregroundStyle('#F2EDE4'),
        ]}
      >
        PP
      </Text>
    ),
  };
}

export default createLiveActivity('PeiPeiRaceWeekActivity', PeiPeiRaceWeekActivity);
