import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HomeScreen } from '../src/components/HomeScreen.tsx';

describe('Poker HomeScreen', () => {
  it('renders a button linking back to the GundiGames dashboard', () => {
    const html = renderToString(
      <HomeScreen
        connected
        initialRoomCode=""
        errorMessage={null}
        onCreateRoom={async () => {}}
        onJoinRoom={async () => {}}
        onClearError={() => {}}
      />
    );

    expect(html).toContain('href="https://gundigame.vercel.app"');
    expect(html).toContain('Zurück zum Dashboard');
  });
});
