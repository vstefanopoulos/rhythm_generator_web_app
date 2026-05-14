# Euclidean Rhythm Generator

Create a web browser app that does the following

## UI
### Input: 
 - Accepts up to 128 steps
 - equal to steps or less amount of beats
 - BPM from 30 to 300
 - Pulse interval equal to steps or less amount of beats (default 2)

## Buttons: 
- Generate 
- Play/stop
- Export midi

## Tick boxes: 
- Fill gaps 
- fill empty steps
- invert pattern one step right/left
- click

## Sliders
- Individual Volumes for:
    - Master
    - Kick
    - Snare
    - Side stick
    - Click

## Info and semantics
- Prints on div the generated pattern as a string
- 'X' for on beat
- 'x' for filled gaps
- 'o' for empty steps

### Example
 8 steps 3 beats
 'XooXooXo'
 8 steps 3 beats with filed gaps
 'XoxXoxXo'
 

## Pattern generation
- On 'generate' it uses eucledean algorithm to create a pattern with given steps and beats (it could be in the form of a string or bytes for internal use or any other format)
- If 'fill empty steps' selected it should use the same algorithm for each sub string between beats that is bigger or equal to len 3 and fill the extra beats generated with fill gaps semantic
See example above

## Play back engine

- should probably have a master clock
- should have a beat duration based on master clock and BPM which signifies at what instance each play back event should be triggered
- On 'play' it should loop over the generated pattern and trigger samples in ./assets/wav according to play back event. 
- More than one play back events need to be triggered. For example if click is enabled this event will almost certainly overlap with some other. A minimal latency of a few miliseconds due to single threaded programming is acceptable.
- The engine should be polyphonic. The execution of each sample should be completed even if another sample is triggered mid flight. In other words sounds could overlap.

### Playback events
 - for 'X': Alternating between kick.wav and rim.wav starting from kick
 - for 'x': side.wav
 - for 'o' and if 'fill empty steps': hh.wav
 - if click selected and according to pulse interval: tambourine.wav
The playback engine should accept changes from input while play back. If anything changes in the pattern (including invert), bpm, click or fill empty steps enable disable it should take that and **SEAMLESSLY** execute on next itteration of the pattern.

## Midi file generation

If a pattern is present is should create a midi file of a single loop that maps 
'X': C1, D1 (alternating)
'x': A#1
'o' if fill gaps: F#1
'click' if opted: G#1 

