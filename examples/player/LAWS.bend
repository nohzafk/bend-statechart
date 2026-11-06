import Base
import ./core.bend as C

def quiet.vol(v: C.Volume) -> Bool:
  match v:
    case C.Normal{}:
      True{}
    case C.Loud{}:
      False{}
    case C.Muted{}:
      True{}

def quiet_when_stopped.play(p: C.Playback, v: C.Volume) -> Bool:
  match p:
    case C.Stopped{}:
      quiet.vol(v)
    case C.Buffering{}:
      True{}
    case C.Playing{}:
      True{}
    case C.Paused{}:
      True{}

# When nothing plays, the volume is never above the safe level.
def quiet_when_stopped(s: C.State) -> Bool:
  match s:
    case C.State{p, v}:
      quiet_when_stopped.play(p, v)
