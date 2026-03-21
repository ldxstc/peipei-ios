import { HStack, Text, VStack } from '@expo/ui/swift-ui';
import {
  font,
  foregroundStyle,
  lineLimit,
  monospacedDigit,
  padding,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget } from 'expo-widgets';

type PeiPeiQuickViewProps = {
  daysToRace: string;
  lastCoachMessage: string;
  plannedWorkout: string;
  workoutDistance: string;
};

const WIDGET_URL = 'peipei:///';

function PeiPeiQuickView(
  props: PeiPeiQuickViewProps,
  environment: { widgetFamily?: string },
) {
  'widget';

  if (environment.widgetFamily === 'accessoryInline') {
    return (
      <Text
        modifiers={[
          font({ size: 12, weight: 'medium' }),
          foregroundStyle('#F2EDE4'),
          lineLimit(1),
          widgetURL(WIDGET_URL),
        ]}
      >
        {props.daysToRace} · {props.plannedWorkout}
      </Text>
    );
  }

  return (
    <VStack modifiers={[padding({ all: 12 }), widgetURL(WIDGET_URL)]} spacing={6}>
      <HStack>
        <Text
          modifiers={[
            font({ size: 12, weight: 'medium' }),
            foregroundStyle('#8B3A3A'),
          ]}
        >
          TODAY
        </Text>
        <Text
          modifiers={[
            font({ size: 12, weight: 'medium' }),
            foregroundStyle('#F2EDE4'),
            lineLimit(1),
          ]}
        >
          {' '}
          {props.plannedWorkout}
        </Text>
      </HStack>

      <Text
        modifiers={[
          font({ size: 14, weight: 'semibold' }),
          foregroundStyle('#F2EDE4'),
          lineLimit(1),
        ]}
      >
        {props.workoutDistance}
      </Text>

      <Text
        modifiers={[
          font({ size: 12, weight: 'medium' }),
          foregroundStyle('#6B6B66'),
          monospacedDigit(),
        ]}
      >
        {props.daysToRace}
      </Text>

      <Text
        modifiers={[
          font({ size: 11 }),
          foregroundStyle('#F2EDE4'),
          lineLimit(2),
        ]}
      >
        {props.lastCoachMessage}
      </Text>
    </VStack>
  );
}

export default createWidget('PeiPeiQuickView', PeiPeiQuickView);
