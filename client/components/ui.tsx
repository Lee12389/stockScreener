import { LinearGradient } from 'expo-linear-gradient';
import { PropsWithChildren, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';

export const palette = {
  background: '#f5efe4',
  panel: '#fffaf1',
  panelAlt: '#efe4cf',
  ink: '#102a35',
  inkSoft: '#4d6770',
  accent: '#ef6a2e',
  accentDeep: '#bd4413',
  teal: '#0f766e',
  mint: '#8ad7c8',
  sky: '#a7d6f5',
  rose: '#f6b7c4',
  success: '#1f8f62',
  warn: '#c3781c',
  danger: '#c24632',
  border: '#dcc9a9',
};

/** Wraps a screen in the shared gradient hero and scrolling layout. */
export function ScreenScroll({
  title,
  subtitle,
  rightAction,
  children,
}: PropsWithChildren<{ title: string; subtitle?: string; rightAction?: ReactNode }>) {
  return (
    <ScrollView
      contentContainerStyle={styles.screenContent}
      style={styles.screen}
      showsVerticalScrollIndicator={false}>
      <LinearGradient colors={['#12384a', '#1f5b58', '#ef6a2e']} style={styles.hero}>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroEyebrow}>Cross-Platform Trading Workspace</Text>
          <Text style={styles.heroTitle}>{title}</Text>
          {subtitle ? <Text style={styles.heroSubtitle}>{subtitle}</Text> : null}
        </View>
        {rightAction ? <View style={styles.heroAction}>{rightAction}</View> : null}
      </LinearGradient>
      {children}
    </ScrollView>
  );
}

/** Renders a reusable elevated content card with header copy. */
export function SectionCard({
  title,
  subtitle,
  children,
  style,
}: PropsWithChildren<{ title: string; subtitle?: string; style?: StyleProp<ViewStyle> }>) {
  return (
    <View style={[styles.card, style]}>
      <View style={styles.cardHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{title}</Text>
          {subtitle ? <Text style={styles.cardSubtitle}>{subtitle}</Text> : null}
        </View>
      </View>
      {children}
    </View>
  );
}

/** Displays a responsive grid of headline metrics. */
export function MetricGrid({ items }: { items: Array<{ label: string; value: string; tone?: 'default' | 'good' | 'warn' | 'danger' }> }) {
  return (
    <View style={styles.metricGrid}>
      {items.map((item) => (
        <View key={item.label} style={styles.metricTile}>
          <Text style={styles.metricLabel}>{item.label}</Text>
          <Text
            style={[
              styles.metricValue,
              item.tone === 'good' ? { color: palette.success } : null,
              item.tone === 'warn' ? { color: palette.warn } : null,
              item.tone === 'danger' ? { color: palette.danger } : null,
            ]}>
            {item.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Wraps a form control with its label. */
export function Field({
  label,
  children,
}: PropsWithChildren<{ label: string }>) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

/** Renders the shared text input style used across forms. */
export function AppInput(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor="#7b8c92"
      {...props}
      style={[styles.input, props.multiline ? styles.inputMultiline : null, props.style]}
    />
  );
}

/** Renders the shared primary, secondary, or danger button styles. */
export function AppButton({
  label,
  onPress,
  tone = 'primary',
  disabled,
}: {
  label: string;
  onPress?: () => void;
  tone?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}) {
  const toneStyle =
    tone === 'secondary'
      ? styles.secondaryButton
      : tone === 'danger'
        ? styles.dangerButton
        : styles.primaryButton;

  return (
    <Pressable disabled={disabled} onPress={onPress} style={[styles.button, toneStyle, disabled ? styles.buttonDisabled : null]}>
      <Text style={[styles.buttonLabel, tone === 'secondary' ? styles.secondaryButtonLabel : null]}>{label}</Text>
    </Pressable>
  );
}

/** Renders a pill-style toggle button. */
export function ChipButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active ? styles.chipActive : null]}>
      <Text style={[styles.chipLabel, active ? styles.chipLabelActive : null]}>{label}</Text>
    </Pressable>
  );
}

/** Lays out chip buttons with wrapping support. */
export function ChipRow({ children }: PropsWithChildren) {
  return <View style={styles.chipRow}>{children}</View>;
}

/** Shows contextual feedback such as success, warning, or error messages. */
export function InlineMessage({
  tone = 'default',
  text,
}: {
  tone?: 'default' | 'good' | 'warn' | 'danger';
  text: string;
}) {
  return (
    <View
      style={[
        styles.inlineMessage,
        tone === 'good' ? styles.inlineMessageGood : null,
        tone === 'warn' ? styles.inlineMessageWarn : null,
        tone === 'danger' ? styles.inlineMessageDanger : null,
      ]}>
      <Text style={styles.inlineMessageText}>{text}</Text>
    </View>
  );
}

/** Displays a compact labeled metric pill. */
export function DataPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.dataPill}>
      <Text style={styles.dataPillLabel}>{label}</Text>
      <Text style={styles.dataPillValue}>{value}</Text>
    </View>
  );
}

/** Displays an empty-state message when a section has no data. */
export function EmptyState({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle ? <Text style={styles.emptySubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

/** Displays a centered loading indicator and message. */
export function LoadingBlock({ label }: { label: string }) {
  return (
    <View style={styles.loadingBlock}>
      <ActivityIndicator color={palette.accentDeep} />
      <Text style={styles.loadingText}>{label}</Text>
    </View>
  );
}

/** Lays out left and right row content for list-like screens. */
export function Row({ left, right }: { left: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>{left}</View>
      {right ? <View style={{ marginLeft: 12 }}>{right}</View> : null}
    </View>
  );
}

/** Renders a thin divider between repeated list items. */
export function ListDivider() {
  return <View style={styles.divider} />;
}

/** Maps signals and message tones to shared palette colors. */
export function toneColor(signal: string) {
  if (signal.includes('STRONG_BUY') || signal === 'BUY') {
    return palette.success;
  }
  if (signal.includes('STRONG_SELL') || signal === 'SELL') {
    return palette.danger;
  }
  if (signal === 'WATCH') {
    return palette.warn;
  }
  return palette.inkSoft;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.background,
  },
  screenContent: {
    padding: 16,
    gap: 14,
  },
  hero: {
    borderRadius: 28,
    padding: 20,
    minHeight: 148,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },
  heroEyebrow: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 12,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  heroTitle: {
    color: '#fffaf1',
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
  },
  heroSubtitle: {
    color: 'rgba(255,250,241,0.88)',
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 720,
  },
  heroAction: {
    minWidth: 120,
    alignSelf: 'flex-start',
  },
  card: {
    backgroundColor: palette.panel,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 16,
    gap: 12,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: palette.ink,
  },
  cardSubtitle: {
    marginTop: 4,
    color: palette.inkSoft,
    fontSize: 13,
    lineHeight: 18,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricTile: {
    minWidth: 132,
    flexGrow: 1,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: '#ead9bb',
  },
  metricLabel: {
    fontSize: 12,
    color: palette.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  metricValue: {
    marginTop: 6,
    fontSize: 22,
    fontWeight: '800',
    color: palette.ink,
  },
  fieldWrap: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: palette.ink,
  },
  input: {
    minHeight: 46,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#dbc8a3',
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    color: palette.ink,
    fontSize: 15,
  },
  inputMultiline: {
    minHeight: 118,
    paddingTop: 14,
    textAlignVertical: 'top',
  },
  button: {
    minHeight: 46,
    borderRadius: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: palette.accent,
  },
  secondaryButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: palette.border,
  },
  dangerButton: {
    backgroundColor: palette.danger,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonLabel: {
    color: '#fffaf1',
    fontWeight: '800',
    fontSize: 14,
  },
  secondaryButtonLabel: {
    color: palette.ink,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: palette.panelAlt,
    borderWidth: 1,
    borderColor: palette.border,
  },
  chipActive: {
    backgroundColor: palette.ink,
    borderColor: palette.ink,
  },
  chipLabel: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: '700',
  },
  chipLabelActive: {
    color: '#fffaf1',
  },
  inlineMessage: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e3d7bf',
  },
  inlineMessageGood: {
    backgroundColor: '#edf9f4',
    borderColor: '#b8e3cf',
  },
  inlineMessageWarn: {
    backgroundColor: '#fff5e8',
    borderColor: '#efc991',
  },
  inlineMessageDanger: {
    backgroundColor: '#feefec',
    borderColor: '#f0b3a9',
  },
  inlineMessageText: {
    color: palette.ink,
    fontSize: 14,
    lineHeight: 20,
  },
  dataPill: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ead9bb',
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 96,
  },
  dataPillLabel: {
    color: palette.inkSoft,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  dataPillValue: {
    marginTop: 4,
    color: palette.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  emptyState: {
    borderRadius: 22,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: palette.border,
    padding: 22,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: palette.ink,
  },
  emptySubtitle: {
    marginTop: 6,
    color: palette.inkSoft,
    lineHeight: 20,
  },
  loadingBlock: {
    minHeight: 120,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e6d8bb',
  },
  loadingText: {
    color: palette.inkSoft,
    fontSize: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  divider: {
    height: 1,
    backgroundColor: '#ead9bb',
  },
});

export const uiStyles = styles;
