// View module for player.model.ts. An object gives one parallel region for each key.
const WORDS: Record<string, string> = {
  YouPressPlay: "you press play",
  EnoughDataArrives: "enough data arrives",
  TheNetworkSlows: "the network slows",
  YouPressPause: "you press pause",
  ACallComesIn: "a call comes in",
  TheTrackEnds: "the track ends",
  YouPressStop: "you press stop",
  YouTurnItUp: "you turn it up",
  YouTurnItDown: "you turn it down",
  YouPressMute: "you press mute",
  TheCallEnds: "the call ends",
};
const LABEL: Record<string, string> = {
  Stopped: "Stopped",
  Buffering: "Buffering",
  Playing: "Playing",
  Paused: "Paused",
  Normal: "Normal volume",
  Loud: "Loud",
  Muted: "Muted",
};

export const title = "Media player";
export const state = (v: any) => ({ Playback: LABEL[v.play.$], Volume: LABEL[v.vol.$] });
export const step = (action: string) => WORDS[action];
