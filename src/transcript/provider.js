export class TranscriptionProvider {
  /**
   * Transcribe a video file
   * @param {string} fileId 
   * @returns {Promise<Array<{id: number, text: string, start: number, end: number, deleted: boolean}>>}
   */
  async transcribe(fileId) {
    throw new Error('Not implemented');
  }
}
