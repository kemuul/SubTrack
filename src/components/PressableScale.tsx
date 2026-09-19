import { useRef, type ReactNode } from 'react';
import {
  Animated,
  Pressable,
  type AccessibilityRole,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';

type Props = {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: AccessibilityRole;
  haptic?: boolean;
};

export function PressableScale({
  children,
  onPress,
  style,
  disabled = false,
  accessibilityLabel,
  accessibilityRole = 'button',
  haptic = true,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  const springTo = (toValue: number) => {
    Animated.spring(scale, {
      toValue,
      useNativeDriver: true,
      speed: 34,
      bounciness: 5,
    }).start();
  };

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      disabled={disabled}
      onPressIn={() => springTo(0.96)}
      onPressOut={() => springTo(1)}
      onPress={() => {
        if (haptic) void Haptics.selectionAsync();
        onPress?.();
      }}
    >
      <Animated.View
        style={[style, { transform: [{ scale }], opacity: disabled ? 0.55 : 1 }]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}
