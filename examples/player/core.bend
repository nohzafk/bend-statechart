import Base

# ---- player: a media player, after pstack's MediaPlayer example ----
#
# Playback and volume are two parts that change on their own, except that a
# call, the end of a track and the stop button touch both. An event that does
# not apply leaves the state as it is.

type Playback is Data:
  Stopped{}
  Buffering{}
  Playing{}
  Paused{}

type Volume is Data:
  Normal{}
  Loud{}
  Muted{}

type State is Data:
  State{play: Playback, vol: Volume}

type Ev is Data:
  YouPressPlay{}
  EnoughDataArrives{}
  TheNetworkSlows{}
  YouPressPause{}
  ACallComesIn{}
  TheTrackEnds{}
  YouPressStop{}
  YouTurnItUp{}
  YouTurnItDown{}
  YouPressMute{}
  TheCallEnds{}

def start() -> State:
  State{Stopped{}, Normal{}}

# you press play
def press_play(p: Playback) -> Playback:
  match p:
    case Stopped{}:
      Buffering{}
    case Buffering{}:
      Buffering{}
    case Playing{}:
      Playing{}
    case Paused{}:
      Playing{}

# enough data arrives
def data_arrives(p: Playback) -> Playback:
  match p:
    case Stopped{}:
      Stopped{}
    case Buffering{}:
      Playing{}
    case Playing{}:
      Playing{}
    case Paused{}:
      Paused{}

# the network slows
def network_slows(p: Playback) -> Playback:
  match p:
    case Stopped{}:
      Stopped{}
    case Buffering{}:
      Buffering{}
    case Playing{}:
      Buffering{}
    case Paused{}:
      Paused{}

# you press pause, or a call comes in
def pause(p: Playback) -> Playback:
  match p:
    case Stopped{}:
      Stopped{}
    case Buffering{}:
      Buffering{}
    case Playing{}:
      Paused{}
    case Paused{}:
      Paused{}

# the track ends
def track_ends(p: Playback) -> Playback:
  match p:
    case Stopped{}:
      Stopped{}
    case Buffering{}:
      Buffering{}
    case Playing{}:
      Stopped{}
    case Paused{}:
      Paused{}

# you press stop
def stop(p: Playback) -> Playback:
  match p:
    case Stopped{}:
      Stopped{}
    case Buffering{}:
      Stopped{}
    case Playing{}:
      Stopped{}
    case Paused{}:
      Stopped{}

# a call comes in
def call_comes_in(v: Volume) -> Volume:
  match v:
    case Normal{}:
      Muted{}
    case Loud{}:
      Muted{}
    case Muted{}:
      Muted{}

# the track ends, you press stop, or you turn it down
def quieter(v: Volume) -> Volume:
  match v:
    case Normal{}:
      Normal{}
    case Loud{}:
      Normal{}
    case Muted{}:
      Muted{}

# you turn it up
def turn_up(v: Volume) -> Volume:
  match v:
    case Normal{}:
      Loud{}
    case Loud{}:
      Loud{}
    case Muted{}:
      Muted{}

# you press mute
def press_mute(v: Volume) -> Volume:
  match v:
    case Normal{}:
      Muted{}
    case Loud{}:
      Muted{}
    case Muted{}:
      Normal{}

# the call ends
def call_ends(v: Volume) -> Volume:
  match v:
    case Normal{}:
      Normal{}
    case Loud{}:
      Loud{}
    case Muted{}:
      Normal{}

def play_after(e: Ev, p: Playback) -> Playback:
  match e:
    case YouPressPlay{}:
      press_play(p)
    case EnoughDataArrives{}:
      data_arrives(p)
    case TheNetworkSlows{}:
      network_slows(p)
    case YouPressPause{}:
      pause(p)
    case ACallComesIn{}:
      pause(p)
    case TheTrackEnds{}:
      track_ends(p)
    case YouPressStop{}:
      stop(p)
    case YouTurnItUp{}:
      p
    case YouTurnItDown{}:
      p
    case YouPressMute{}:
      p
    case TheCallEnds{}:
      p

def vol_after(e: Ev, v: Volume) -> Volume:
  match e:
    case YouPressPlay{}:
      v
    case EnoughDataArrives{}:
      v
    case TheNetworkSlows{}:
      v
    case YouPressPause{}:
      v
    case ACallComesIn{}:
      call_comes_in(v)
    case TheTrackEnds{}:
      quieter(v)
    case YouPressStop{}:
      quieter(v)
    case YouTurnItUp{}:
      turn_up(v)
    case YouTurnItDown{}:
      quieter(v)
    case YouPressMute{}:
      press_mute(v)
    case TheCallEnds{}:
      call_ends(v)

def step(s: State, +e: Ev) -> State:
  match s:
    case State{p, v}:
      State{play_after(e, p), vol_after(e, v)}
