const { performance } = require('perf_hooks');

// Simulating the environment
class MockVideo {
  constructor() {
    this.paused = false;
    this.seeking = false;
    this.currentTime = 0;
  }
}

class MockStore {
  constructor(segments) {
    this.state = { segments };
  }
  getState() {
    return this.state;
  }
}

// Generate a large number of segments
const NUM_SEGMENTS = 10000;
const segments = [];
let currentStart = 0;
for (let i = 0; i < NUM_SEGMENTS; i++) {
  segments.push({ start: currentStart, end: currentStart + 1 });
  currentStart += 1.5; // leaving gaps
}

const video = new MockVideo();
const store = new MockStore(segments);

let currentSegmentIndex = 0;

// The original checkSegments logic
function checkSegmentsOriginal() {
  if (video.paused || video.seeking) return;

  const time = video.currentTime;
  const state = store.getState();
  const segments = state.segments;

  if (!segments || segments.length === 0) return;

  let inSegIndex = -1;
  for (let i = 0; i < segments.length; i++) {
      if (time >= segments[i].start && time < segments[i].end) {
          inSegIndex = i;
          break;
      }
  }

  if (inSegIndex !== -1) {
      currentSegmentIndex = inSegIndex;
  } else {
      let nextSegIndex = -1;
      for (let i = 0; i < segments.length; i++) {
          if (segments[i].start >= time) {
              nextSegIndex = i;
              break;
          }
      }

      if (nextSegIndex !== -1) {
          if (Math.abs(time - segments[nextSegIndex].start) < 0.05) {
              return;
          }
          currentSegmentIndex = nextSegIndex;
          video.currentTime = segments[nextSegIndex].start;
      } else {
          video.paused = true; // pause
          if (segments.length > 0) {
              video.currentTime = segments[segments.length - 1].end;
          }
      }
  }
}

// The optimized checkSegments logic (combining O(1) current/next check + O(log N) binary search)
function checkSegmentsOptimized() {
  if (video.paused || video.seeking) return;

  const time = video.currentTime;
  const state = store.getState();
  const segments = state.segments;

  if (!segments || segments.length === 0) return;

  // O(1) Check: Are we in the current segment?
  let csi = currentSegmentIndex;
  if (csi >= 0 && csi < segments.length) {
    if (time >= segments[csi].start && time < segments[csi].end) {
      return; // Already in current segment, nothing to do. (Actually current logic just sets currentSegmentIndex)
    }
    // Also common: sequential playback moved into the gap between csi and csi+1, or into csi+1
    // We can do a quick check for csi+1
    if (csi + 1 < segments.length) {
      if (time >= segments[csi + 1].start && time < segments[csi + 1].end) {
        currentSegmentIndex = csi + 1;
        return;
      }
    }
  }

  // Binary search to find segment or next segment
  let low = 0;
  let high = segments.length - 1;
  let inSegIndex = -1;
  let nextSegIndex = -1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const seg = segments[mid];

    if (time >= seg.start && time < seg.end) {
      inSegIndex = mid;
      break;
    } else if (time < seg.start) {
      nextSegIndex = mid;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  if (inSegIndex !== -1) {
      currentSegmentIndex = inSegIndex;
  } else {
      // Find the next segment (binary search gave us an approximation, but we need exact)
      // Actually binary search above will find the smallest mid where time < seg.start if it exists
      // But let's be safe. We know `nextSegIndex` could have been updated, but since we are looking for the FIRST segment > time,
      // The binary search loop with `nextSegIndex = mid; high = mid - 1` exactly finds the FIRST segment that starts after `time`.
      if (nextSegIndex !== -1 && segments[nextSegIndex].start >= time) {
          // Verify
          // nextSegIndex is correct
      } else {
         nextSegIndex = -1;
         // fallback or it means no segment after time
         // actually if time > all segments, high becomes -1 and low becomes length
      }

      if (nextSegIndex !== -1) {
          if (Math.abs(time - segments[nextSegIndex].start) < 0.05) {
              return;
          }
          currentSegmentIndex = nextSegIndex;
          video.currentTime = segments[nextSegIndex].start;
      } else {
          video.paused = true;
          if (segments.length > 0) {
              video.currentTime = segments[segments.length - 1].end;
          }
      }
  }
}

// Benchmark
const NUM_ITERATIONS = 10000;

function runBenchmark(fn, name) {
  video.currentTime = 0;
  currentSegmentIndex = 0;
  video.paused = false;

  const start = performance.now();
  for (let i = 0; i < NUM_ITERATIONS; i++) {
    // Simulate time moving forward
    video.currentTime += 0.05;

    // Simulate random jumps 5% of the time
    if (i % 20 === 0) {
      video.currentTime = Math.random() * (segments[segments.length - 1].end + 10);
    }

    fn();
  }
  const end = performance.now();
  console.log(`${name}: ${(end - start).toFixed(2)} ms`);
}

runBenchmark(checkSegmentsOriginal, "Original");
runBenchmark(checkSegmentsOptimized, "Optimized");
