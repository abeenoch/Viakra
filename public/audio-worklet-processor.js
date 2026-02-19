class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetSampleRate = 24000;
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input || input.length === 0) {
      return true;
    }

    const ratio = sampleRate / this.targetSampleRate;
    const downsampled = ratio === 1 ? input : this.downsample(input, ratio);
    const pcm = this.floatTo16BitPcm(downsampled);
    this.port.postMessage(pcm.buffer, [pcm.buffer]);
    return true;
  }

  downsample(buffer, ratio) {
    const newLength = Math.floor(buffer.length / ratio);
    const result = new Float32Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;

    while (offsetResult < result.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
      let sum = 0;
      let count = 0;

      for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i += 1) {
        sum += buffer[i];
        count += 1;
      }

      result[offsetResult] = count > 0 ? sum / count : 0;
      offsetResult += 1;
      offsetBuffer = nextOffsetBuffer;
    }

    return result;
  }

  floatTo16BitPcm(buffer) {
    const pcm = new Int16Array(buffer.length);
    for (let i = 0; i < buffer.length; i += 1) {
      const sample = Math.max(-1, Math.min(1, buffer[i]));
      pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    return pcm;
  }
}

registerProcessor("pcm-capture-processor", PcmCaptureProcessor);
