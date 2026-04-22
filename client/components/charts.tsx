import Svg, { Line, Polyline, Rect } from 'react-native-svg';
import { StyleSheet, Text, View } from 'react-native';

import { Candle } from '@/lib/types';
import { palette } from '@/components/ui';

/** Renders a lightweight line sparkline for scanner cards. */
export function Sparkline({
  values,
  color = palette.teal,
  height = 42,
}: {
  values: number[];
  color?: string;
  height?: number;
}) {
  const points = buildPoints(values, 120, height);
  return (
    <View style={{ height, width: '100%' }}>
      <Svg width="100%" height={height} viewBox={`0 0 120 ${height}`}>
        <Polyline fill="none" stroke={color} strokeWidth="3" points={points} />
      </Svg>
    </View>
  );
}

/** Renders the expanded multi-line price chart used in scanner detail views. */
export function PriceChart({
  candles,
  close,
  ema20,
  ema50,
  ema200,
  support,
  resistance,
  title,
}: {
  candles: Candle[];
  close: number[];
  ema20: number[];
  ema50: number[];
  ema200: number[];
  support: number;
  resistance: number;
  title: string;
}) {
  const width = 340;
  const height = 210;
  const padding = 12;
  const values = close.concat(ema20).concat(ema50).concat(ema200).concat([support, resistance]).filter(Number.isFinite);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const scaleY = (value: number) => {
    const span = max - min || 1;
    return height - padding - ((value - min) / span) * (height - padding * 2);
  };

  const buildSeries = (series: number[]) =>
    series
      .map((value, index) => {
        const x = padding + (index / Math.max(series.length - 1, 1)) * (width - padding * 2);
        const y = scaleY(value);
        return `${x},${y}`;
      })
      .join(' ');

  const up = close.length > 1 ? close[close.length - 1] >= close[0] : true;

  return (
    <View style={styles.chartCard}>
      <Text style={styles.chartTitle}>{title} Price Map</Text>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <Rect x={0} y={0} width={width} height={height} rx={18} fill="#102a35" />
        <Line x1={padding} y1={scaleY(support)} x2={width - padding} y2={scaleY(support)} stroke="#7dd3fc" strokeDasharray="6 5" strokeWidth="1.5" />
        <Line x1={padding} y1={scaleY(resistance)} x2={width - padding} y2={scaleY(resistance)} stroke="#fb923c" strokeDasharray="6 5" strokeWidth="1.5" />
        <Polyline fill="none" stroke={up ? '#8ad7c8' : '#fda4af'} strokeWidth="3" points={buildSeries(close)} />
        <Polyline fill="none" stroke="#ffd166" strokeWidth="2" points={buildSeries(ema20)} />
        <Polyline fill="none" stroke="#86efac" strokeWidth="2" points={buildSeries(ema50)} />
        <Polyline fill="none" stroke="#93c5fd" strokeWidth="2" points={buildSeries(ema200)} />
      </Svg>
      <View style={styles.legendRow}>
        <LegendDot color={up ? '#8ad7c8' : '#fda4af'} label="Close" />
        <LegendDot color="#ffd166" label="EMA20" />
        <LegendDot color="#86efac" label="EMA50" />
        <LegendDot color="#93c5fd" label="EMA200" />
      </View>
    </View>
  );
}

/** Renders a small legend swatch and label pair. */
function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

/** Converts numeric series values into SVG point coordinates. */
function buildPoints(values: number[], width: number, height: number) {
  if (!values.length) {
    return '0,0';
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * width;
      const y = height - ((value - min) / span) * height;
      return `${x},${y}`;
    })
    .join(' ');
}

const styles = StyleSheet.create({
  chartCard: {
    backgroundColor: '#17333c',
    borderRadius: 24,
    padding: 14,
    gap: 10,
  },
  chartTitle: {
    color: '#fffaf1',
    fontSize: 16,
    fontWeight: '800',
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendSwatch: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  legendLabel: {
    color: '#dce7e3',
    fontSize: 12,
    fontWeight: '700',
  },
});
