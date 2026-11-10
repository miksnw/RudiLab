/** Корень интерфейса: выбирает экран по состоянию и перерисовывает при go(). */
import { $ } from '../core/dom.js';
import { byId } from '../data/patterns.js';
import { S, setRenderer, runCleanups } from './state.js';
import { Nav } from './nav.js';
import { PatternScreen } from './pattern/pattern.js';
import { PracticeScreen } from './screens/practice.js';
import { TodayScreen } from './screens/today.js';
import { ChallengesScreen } from './screens/challenges.js';
import { RecordsScreen } from './screens/records.js';

const TAB_SCREENS = { practice: PracticeScreen, today: TodayScreen, challenges: ChallengesScreen, records: RecordsScreen };

export function render() {
  runCleanups();
  const app = $('#app');
  app.replaceChildren(...(S.pat ? [PatternScreen(byId[S.pat], S.challenge)] : [TAB_SCREENS[S.tab](), Nav()]));
}

setRenderer(render);
