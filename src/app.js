import { store } from './state.js';
import { api } from './api.js';
import { $, $$ } from './utils/dom.js';
import { emit, on } from './utils/events.js';

// We'll import modules here as we create them
import './video/upload.js';
import './video/player.js';
import './transcript/transcriber.js';
import './transcript/editor.js';
import './timeline/timeline.js';
import './timeline/waveform.js';

class App {
  constructor() {
    this.init();
  }

  init() {
    this.bindEvents();
    this.setupStateListeners();
    this.loadProjects();
  }

  async loadProjects() {
    try {
      const projects = await api.getProjects();
      this.renderProjects(projects);
    } catch (err) {
      console.error('Failed to load projects:', err);
      $('#projects-list').innerHTML = '<div class="empty-projects">Failed to load projects.</div>';
    }
  }

  renderProjects(projects) {
    const container = $('#projects-list');
    if (!projects || projects.length === 0) {
      container.innerHTML = '<div class="empty-projects">No recent projects found.</div>';
      return;
    }

    container.innerHTML = '';
    projects.forEach(project => {
      const card = document.createElement('div');
      card.className = 'project-card';
      
      const date = new Date(project.lastModified).toLocaleDateString();
      const duration = Math.round(project.duration) + 's';
      
      card.innerHTML = `
        <div class="project-info">
          <span class="project-name">${project.name}</span>
          <span class="project-meta">Last edited: ${date} • ${duration}</span>
        </div>
        <div class="project-actions">
          <button class="btn-delete-project" data-id="${project.id}" title="Delete project">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      `;
      
      // Load project on click
      card.addEventListener('click', async (e) => {
        if (e.target.closest('.btn-delete-project')) return;
        
        try {
          const fullProject = await api.getProject(project.id);
          store.dispatch('LOAD_PROJECT', fullProject.state);
          store.dispatch('SET_PROJECT_ID', fullProject.id);
          
          $('#upload-view').classList.add('hidden');
          $('#player-view').classList.remove('hidden');
          
          if (fullProject.state.words && fullProject.state.words.length > 0) {
            $('#btn-transcribe').classList.add('hidden');
            $('#transcript-empty').classList.add('hidden');
            // Trigger transcript render by emitting words
            emit('words-changed', fullProject.state.words);
          } else {
            $('#btn-transcribe').classList.remove('hidden');
            $('#transcript-empty').classList.remove('hidden');
          }
          
          // Trigger video load
          $('#video-preview').src = fullProject.state.videoUrl;
        } catch (err) {
          console.error('Failed to load project details:', err);
          alert('Failed to load project details.');
        }
      });
      
      // Delete project
      const deleteBtn = card.querySelector('.btn-delete-project');
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm('Are you sure you want to delete this project?')) {
          try {
            await api.deleteProject(project.id);
            this.loadProjects(); // Reload list
          } catch (err) {
            console.error('Failed to delete project:', err);
            alert('Failed to delete project.');
          }
        }
      });
      
      container.appendChild(card);
    });
  }

  bindEvents() {
    // Toolbar buttons
    $('#btn-undo').addEventListener('click', () => {
      store.dispatch('UNDO');
    });

    $('#btn-redo').addEventListener('click', () => {
      store.dispatch('REDO');
    });

    $('#btn-export').addEventListener('click', () => {
      this.handleExport();
    });

    // Custom events
    on('videoLoaded', async (data) => {
      store.dispatch('SET_VIDEO', data);
      
      // Automatically create a new project on first upload
      try {
        const state = store.getState();
        const saved = await api.saveProject(null, state);
        store.dispatch('SET_PROJECT_ID', saved.id);
      } catch (err) {
        console.error('Failed to create project:', err);
      }
      
      $('#upload-view').classList.add('hidden');
      $('#player-view').classList.remove('hidden');
      $('#btn-transcribe').classList.remove('hidden');
      $('#transcript-empty').classList.add('hidden');
    });
  }

  setupStateListeners() {
    let saveTimeout = null;

    store.subscribe((state) => {
      // Update toolbar buttons
      $('#btn-undo').disabled = state.undoStack.length === 0;
      $('#btn-redo').disabled = state.redoStack.length === 0;
      $('#btn-export').disabled = !state.fileId;
      
      // Auto-save logic
      if (state.projectId) {
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(async () => {
          try {
            // Create a clean copy to save, excluding UI-only state if needed
            const stateToSave = { ...state };
            delete stateToSave.isPlaying;
            delete stateToSave.currentTime;
            await api.saveProject(state.projectId, stateToSave);
          } catch (err) {
            console.error('Auto-save failed:', err);
          }
        }, 2000); // Debounce 2 seconds
      }
    });
  }

  async handleExport() {
    const state = store.getState();
    if (!state.fileId || state.segments.length === 0) return;

    $('#export-modal').classList.remove('hidden');
    $('#export-progress').style.width = '0%';
    $('#export-status-text').textContent = 'Starting export...';

    try {
      const { jobId } = await api.exportVideo(state.fileId, state.segments);
      
      // Connect to SSE for progress
      const eventSource = new EventSource(`/api/export/${jobId}/progress`);
      
      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.status === 'processing') {
          $('#export-progress').style.width = `${data.progress}%`;
          $('#export-status-text').textContent = `Exporting... ${Math.round(data.progress)}%`;
        } else if (data.status === 'completed') {
          eventSource.close();
          $('#export-progress').style.width = '100%';
          $('#export-status-text').textContent = 'Export complete! Downloading...';
          
          setTimeout(() => {
            $('#export-modal').classList.add('hidden');
            // Trigger download
            const a = document.createElement('a');
            a.href = data.url;
            a.download = data.filename;
            a.click();
          }, 1500);
        } else if (data.status === 'error' || data.status === 'failed') {
          eventSource.close();
          $('#export-status-text').textContent = `Error: ${data.error}`;
          setTimeout(() => $('#export-modal').classList.add('hidden'), 3000);
        }
      };
      
      eventSource.onerror = () => {
        eventSource.close();
        $('#export-status-text').textContent = `Connection lost. Check server logs.`;
        setTimeout(() => $('#export-modal').classList.add('hidden'), 3000);
      };
      
    } catch (err) {
      $('#export-status-text').textContent = `Error: ${err.message}`;
      setTimeout(() => $('#export-modal').classList.add('hidden'), 3000);
    }
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
