// A gradient fill rendered as an absolutely-positioned SVG layer behind its
// children. Lets us paint the maritime depth gradients (theme.gradients)
// without adding expo-linear-gradient's native module — react-native-svg is
// already in the tree (via react-native-qrcode-svg). Measures itself on layout
// so the SVG viewBox matches the container.
import { useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

type Props = {
  children?: ReactNode;
  colors: readonly string[];
  // Gradient direction. 'diagonal' (default) reads top-left -> bottom-right.
  direction?: 'vertical' | 'horizontal' | 'diagonal';
  style?: StyleProp<ViewStyle>;
};

export function GradientSurface({ children, colors, direction = 'diagonal', style }: Props) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  function onLayout(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  }

  const vector =
    direction === 'vertical'
      ? { x1: '0', y1: '0', x2: '0', y2: '1' }
      : direction === 'horizontal'
        ? { x1: '0', y1: '0', x2: '1', y2: '0' }
        : { x1: '0', y1: '0', x2: '1', y2: '1' };

  return (
    <View style={style} onLayout={onLayout}>
      {size.width > 0 ? (
        <Svg style={StyleSheet.absoluteFill} width={size.width} height={size.height} pointerEvents="none">
          <Defs>
            <LinearGradient id="grad" {...vector}>
              {colors.map((color, index) => (
                <Stop
                  key={`${color}-${index}`}
                  offset={colors.length === 1 ? 0 : index / (colors.length - 1)}
                  stopColor={color}
                  stopOpacity={1}
                />
              ))}
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={size.width} height={size.height} fill="url(#grad)" />
        </Svg>
      ) : null}
      {children}
    </View>
  );
}
