export async function generateWaveformData(audioUrl, samples = 100) {
  try {
    const response = await fetch(audioUrl);
    const arrayBuffer = await response.arrayBuffer();
    
    // We only need a low sample rate for waveform visualization
    const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 8000 });
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    const channelData = audioBuffer.getChannelData(0);
    const blockSize = Math.floor(channelData.length / samples);
    const waveform = [];
    
    for (let i = 0; i < samples; i++) {
      const start = i * blockSize;
      let sum = 0;
      
      for (let j = 0; j < blockSize; j++) {
        sum += Math.abs(channelData[start + j]);
      }
      
      waveform.push(sum / blockSize);
    }
    
    // Normalize to 0-1
    const max = Math.max(...waveform);
    return waveform.map(val => (max > 0 ? val / max : 0));
  } catch (error) {
    console.error("Waveform generation failed", error);
    return new Array(samples).fill(0);
  }
}
