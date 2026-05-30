import { $, createElement } from '../utils/dom.js';
import { api } from '../api.js';
import { emit } from '../utils/events.js';

class Uploader {
  constructor() {
    this.dropzone = $('#dropzone');
    this.fileInput = $('#file-input');
    this.btnBrowse = $('#btn-browse');
    this.statusText = this.dropzone.querySelector('p');
    
    if (this.dropzone && this.fileInput && this.btnBrowse) {
      this.bindEvents();
    }
  }

  bindEvents() {
    // Browse button click triggers file input
    this.btnBrowse.addEventListener('click', (e) => {
      e.preventDefault();
      this.fileInput.click();
    });

    // File input change
    this.fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.handleFile(e.target.files[0]);
      }
    });

    // Drag events
    this.dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.dropzone.classList.add('drag-active');
    });

    this.dropzone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      this.dropzone.classList.remove('drag-active');
    });

    this.dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dropzone.classList.remove('drag-active');
      
      if (e.dataTransfer.files.length > 0) {
        this.handleFile(e.dataTransfer.files[0]);
      }
    });
  }

  async handleFile(file) {
    // Basic validation
    if (!file.type.startsWith('video/')) {
      alert('Please upload a valid video file.');
      return;
    }

    // UI Update
    this.statusText.textContent = `Uploading ${file.name}...`;
    this.btnBrowse.disabled = true;
    this.dropzone.style.pointerEvents = 'none';

    try {
      const data = await api.uploadVideo(file);
      
      // Notify app that video is loaded
      emit('videoLoaded', data);
      
    } catch (err) {
      this.statusText.textContent = `Upload failed: ${err.message}`;
      this.btnBrowse.disabled = false;
      this.dropzone.style.pointerEvents = 'auto';
    }
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  new Uploader();
});
