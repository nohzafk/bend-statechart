// Model module for examples/player, a media player with two parts that change on their own.
//   <skill-dir>/scripts/statechart <skill-dir>/examples/player \
//     --model <skill-dir>/examples/player.model.ts \
//     --view <skill-dir>/examples/player.view.ts --out /tmp/player-chart
const EVENTS = [
  "YouPressPlay",
  "EnoughDataArrives",
  "TheNetworkSlows",
  "YouPressPause",
  "ACallComesIn",
  "TheTrackEnds",
  "YouPressStop",
  "YouTurnItUp",
  "YouTurnItDown",
  "YouPressMute",
  "TheCallEnds",
];

export const init = (C: any) => [C.start()];
export const events = () => EVENTS.map(($) => ({ $ }));
export const invariants = (C: any) => ({
  quiet_when_stopped: (s: any) => C.quiet_when_stopped(s) === true,
});
// step() returns the next state itself, with no command.
export const nextOf = (o: any) => o;
export const cmdOf = () => undefined;
export const action = (e: any) => e.$;
