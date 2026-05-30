export const api = {
  /**
   * Upload video to server
   * @param {File} file 
   * @returns {Promise<{fileId: string, filename: string, duration: number, url: string}>}
   */
  async uploadVideo(file) {
    const formData = new FormData();
    formData.append('video', file);

    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Upload failed');
    }

    return response.json();
  },

  /**
   * Request transcription
   * @param {string} fileId 
   * @param {string} provider
   * @returns {Promise<{words: Array<{id: number, text: string, start: number, end: number, deleted: boolean}>}>}
   */
  async transcribeVideo(fileId, provider = 'google') {
    const response = await fetch('/api/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId, provider })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Transcription failed');
    }

    return response.json();
  },

  /**
   * Resume transcription by reconnecting to an existing Google Cloud operation
   * @param {string} operationName - The Google Cloud operation name
   * @returns {Promise<{jobId: string}>}
   */
  async resumeTranscription(operationName) {
    const response = await fetch('/api/transcribe/resume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operationName })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Resume failed');
    }

    return response.json();
  },

  /**
   * Start export job
   * @param {string} fileId 
   * @param {Array<{start: number, end: number}>} segments 
   * @returns {Promise<{jobId: string}>}
   */
  async exportVideo(fileId, segments) {
    const response = await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId, segments })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to start export');
    }

    return response.json();
  },

  /**
   * Get all projects
   * @returns {Promise<Array>}
   */
  async getProjects() {
    const response = await fetch('/api/projects');
    if (!response.ok) throw new Error('Failed to load projects');
    return response.json();
  },

  /**
   * Get specific project by ID
   * @param {string} id
   * @returns {Promise<Object>}
   */
  async getProject(id) {
    const response = await fetch(`/api/projects/${id}`);
    if (!response.ok) throw new Error('Failed to load project');
    return response.json();
  },

  /**
   * Save project state
   * @param {string} id Optional project ID to update
   * @param {Object} state The project state
   * @returns {Promise<Object>}
   */
  async saveProject(id, state) {
    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, state })
    });
    if (!response.ok) throw new Error('Failed to save project');
    return response.json();
  },

  /**
   * Delete a project
   * @param {string} id
   */
  async deleteProject(id) {
    const response = await fetch(`/api/projects/${id}`, {
      method: 'DELETE'
    });
    if (!response.ok) throw new Error('Failed to delete project');
    return response.json();
  }
};
