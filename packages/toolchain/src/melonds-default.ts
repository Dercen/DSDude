/**
 * The melonDS.toml melonDS 1.1 writes when it starts without one (captured 2026-09-26), minus the machine-specific
 * `RecentROM` list and `Instance0.Window0.Geometry`. melonDS 1.1 fail-fasts (exit 0xC0000409) on a partial file and
 * truncates it to 0 bytes, so writeMelonDsConfig seeds a missing or empty melonDS.toml with this text before it
 * patches DSDude's keys in (WS3's report of 2026-09-26). melonDS rewrites the file in its own order on exit.
 */
export const MELONDS_DEFAULT_TOML = `UITheme = ""
FastForwardFPS = 1000.0
AudioSync = false
PauseLostFocus = false
TargetFPS = 60.0
LimitFPS = true
SlowmoFPS = 30.0

[Audio]
Interpolation = 0
BitDepth = 0

[DLDI]
Enable = false

[Mouse]
Hide = false
HideSeconds = 5

[DSi]
NANDPath = ""

[DSi.Camera1]
DeviceName = ""
ImagePath = ""
InputType = 0
XFlip = false

[DSi.Camera0]
DeviceName = ""
ImagePath = ""
InputType = 0
XFlip = false

[3D]
Renderer = 0

[3D.Soft]
Threaded = true

[MP]
AudioMode = 1
RecvTimeout = 25

[Savestate]
RelocSRAM = false

[LAN]
DirectMode = false

[Instance0]
EnableCheats = false
SaveFilePath = ""
SavestatePath = ""
JoystickID = 0
CheatFilePath = ""

[Instance0.RTC]
Offset = 0

[Instance0.DS]
[Instance0.DS.Battery]
LevelOkay = true

[Instance0.Keyboard]
HK_GuitarGripBlue = -1
HK_GuitarGripYellow = -1
HK_GuitarGripGreen = -1
HK_SlowMoToggle = -1
HK_Lid = -1
Y = -1
HK_FrameStep = -1
HK_SolarSensorIncrease = -1
HK_GuitarGripRed = -1
L = -1
R = -1
Up = -1
HK_FullscreenToggle = -1
HK_SlowMo = -1
HK_Pause = -1
Right = -1
Start = -1
Select = -1
X = -1
B = -1
Down = -1
A = -1
HK_Mic = -1
HK_FastForward = -1
HK_FrameLimitToggle = -1
Left = -1
HK_SwapScreens = -1
HK_SwapScreenEmphasis = -1
HK_Reset = -1
HK_PowerButton = -1
HK_VolumeDown = -1
HK_SolarSensorDecrease = -1
HK_VolumeUp = -1
HK_FastForwardToggle = -1

[Instance0.Window2]
Enabled = false

[Instance0.Joystick]
HK_GuitarGripBlue = -1
HK_GuitarGripYellow = -1
HK_GuitarGripGreen = -1
HK_SlowMoToggle = -1
HK_Lid = -1
Y = -1
HK_FrameStep = -1
HK_SolarSensorIncrease = -1
HK_GuitarGripRed = -1
L = -1
R = -1
Up = -1
HK_FullscreenToggle = -1
HK_SlowMo = -1
HK_Pause = -1
Right = -1
Start = -1
Select = -1
X = -1
B = -1
Down = -1
A = -1
HK_Mic = -1
HK_FastForward = -1
HK_FrameLimitToggle = -1
Left = -1
HK_SwapScreens = -1
HK_SwapScreenEmphasis = -1
HK_Reset = -1
HK_PowerButton = -1
HK_VolumeDown = -1
HK_SolarSensorDecrease = -1
HK_VolumeUp = -1
HK_FastForwardToggle = -1

[Instance0.Window0]
Enabled = true
ScreenFilter = false
ScreenAspectTop = 0
IntegerScaling = false
ScreenSizing = 0
ScreenSwap = false
ScreenGap = 0
ScreenAspectBot = 0
ScreenRotation = 0
ScreenLayout = 0
ShowOSD = true

[Instance0.Audio]
DSiVolumeSync = false
Volume = 256

[Instance0.Window3]
Enabled = false

[Instance0.Firmware]
MAC = ""
Message = ""
BirthdayDay = 1
BirthdayMonth = 1
FavouriteColour = 0
Language = 1
Username = "melonDS"

[Instance0.Window1]
Enabled = false

[Instance0.Gdb]
Enabled = false

[Instance0.Gdb.ARM9]
BreakOnStartup = false
Port = 3333

[Instance0.Gdb.ARM7]
BreakOnStartup = false
Port = 3334

[Emu]
DirectBoot = true
ExternalBIOSEnable = false
ConsoleType = 0

[JIT]
Enable = false
FastMemory = true
BranchOptimisations = true
LiteralOptimisations = true
MaxBlockSize = 32

[Screen]
UseGL = false

[Mic]
WavPath = ""
Device = ""
InputType = 1
`;
