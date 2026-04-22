import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { palette } from '@/components/ui';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View style={styles.container}>
        <Text style={styles.title}>This route does not exist yet.</Text>

        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>Go to the trading desk</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: palette.background,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: palette.ink,
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
  linkText: {
    fontSize: 14,
    color: palette.accentDeep,
    fontWeight: '700',
  },
});
