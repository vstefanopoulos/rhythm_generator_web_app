// Bjorklund/Euclidean rhythm algorithm
function euclidean(steps, beats) {
  if (beats <= 0) return Array(steps).fill(0);
  if (beats >= steps) return Array(steps).fill(1);

  let pattern = [];
  let counts = [];
  let remainders = [];

  let divisor = steps - beats;
  remainders.push(beats);

  let level = 0;
  while (remainders[level] > 1) {
    counts.push(Math.floor(divisor / remainders[level]));
    remainders.push(divisor % remainders[level]);
    divisor = remainders[level];
    level++;
  }
  counts.push(divisor);

  function build(lv) {
    if (lv === -1) {
      pattern.push(0);
    } else if (lv === -2) {
      pattern.push(1);
    } else {
      for (let i = 0; i < counts[lv]; i++) build(lv - 1);
      if (remainders[lv] !== 0) build(lv - 2);
    }
  }

  build(level);
  return pattern;
}

// Returns pattern as string: 'O'=kick, 'X'=snare, 'o'=empty.
// Beats alternate kick/snare starting with kick by default.
// Pass startWithSnare=true to start on snare instead.
function generatePattern(steps, beats, startWithSnare = false) {
  const pat = euclidean(steps, beats);
  const first = pat.indexOf(1);
  const aligned = first > 0 ? [...pat.slice(first), ...pat.slice(0, first)] : pat;
  let beatCount = 0;
  return aligned.map(b => {
    if (!b) return 'o';
    const isKick = startWithSnare ? (beatCount % 2 !== 0) : (beatCount % 2 === 0);
    beatCount++;
    return isKick ? 'O' : 'X';
  }).join('');
}

// Fill gaps: for each 'o'-only segment of length >= 2 after a beat (O or X),
// place fill beats ('x') at odd positions within the gap (1, 3, 5 …).
// This is the euclidean distribution rotated so fills never sit
// immediately after the main beat.
function fillGaps(pattern) {
  const result = pattern.split('');
  const n = result.length;

  let i = 0;
  while (i < n) {
    if (result[i] === 'O' || result[i] === 'X') {
      let j = i + 1;
      while (j < n && result[j] === 'o') j++;
      const segLen = j - i - 1;
      if (segLen >= 2) {
        for (let k = 1; k < segLen; k += 2) {
          result[i + 1 + k] = 'x';
        }
      }
      i = j;
    } else {
      i++;
    }
  }
  return result.join('');
}

// Rotate pattern left by 1 step
function rotateLeft(pattern) {
  if (!pattern.length) return pattern;
  return pattern.slice(1) + pattern[0];
}

// Rotate pattern right by 1 step
function rotateRight(pattern) {
  if (!pattern.length) return pattern;
  return pattern[pattern.length - 1] + pattern.slice(0, -1);
}
