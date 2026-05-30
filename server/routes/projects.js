import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();
const PROJECTS_FILE = path.join(process.cwd(), 'projects.json');

// Helper to read projects
async function getProjectsData() {
  try {
    const data = await fs.readFile(PROJECTS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist yet, return empty list
      return [];
    }
    throw error;
  }
}

// Helper to write projects
async function saveProjectsData(projects) {
  await fs.writeFile(PROJECTS_FILE, JSON.stringify(projects, null, 2), 'utf-8');
}

// GET all projects (without large transcript data for lightweight listing)
router.get('/', async (req, res) => {
  try {
    const projects = await getProjectsData();
    // Return lightweight version
    const lightweight = projects.map(p => ({
      id: p.id,
      name: p.name || 'Untitled Video',
      videoUrl: p.state?.videoUrl,
      duration: p.state?.duration || 0,
      lastModified: p.lastModified,
      fileId: p.state?.fileId
    })).sort((a, b) => b.lastModified - a.lastModified);
    
    res.json(lightweight);
  } catch (error) {
    console.error('Error getting projects:', error);
    res.status(500).json({ error: 'Failed to retrieve projects' });
  }
});

// GET a specific project
router.get('/:id', async (req, res) => {
  try {
    const projects = await getProjectsData();
    const project = projects.find(p => p.id === req.params.id);
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    res.json(project);
  } catch (error) {
    console.error('Error getting project:', error);
    res.status(500).json({ error: 'Failed to retrieve project' });
  }
});

// POST to create or update a project
router.post('/', async (req, res) => {
  try {
    const { id, state } = req.body;
    let projects = await getProjectsData();
    
    let project;
    if (id) {
      const index = projects.findIndex(p => p.id === id);
      if (index >= 0) {
        // Update existing
        projects[index].state = state;
        projects[index].lastModified = Date.now();
        project = projects[index];
      } else {
        // ID provided but not found, create new with this ID
        project = {
          id: id,
          name: state.fileId || 'Untitled Video',
          state: state,
          createdAt: Date.now(),
          lastModified: Date.now()
        };
        projects.push(project);
      }
    } else {
      // Create new
      project = {
        id: uuidv4(),
        name: state.fileId || 'Untitled Video',
        state: state,
        createdAt: Date.now(),
        lastModified: Date.now()
      };
      projects.push(project);
    }
    
    await saveProjectsData(projects);
    res.json(project);
  } catch (error) {
    console.error('Error saving project:', error);
    res.status(500).json({ error: 'Failed to save project' });
  }
});

// DELETE a project
router.delete('/:id', async (req, res) => {
  try {
    const projects = await getProjectsData();
    const projectToDelete = projects.find(p => p.id === req.params.id);
    
    if (!projectToDelete) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const fileId = projectToDelete.state?.fileId;
    const filtered = projects.filter(p => p.id !== req.params.id);
    
    await saveProjectsData(filtered);
    
    // Clean up uploaded video file if not referenced by any other project
    if (fileId) {
      const isFileReferenced = filtered.some(p => p.state?.fileId === fileId);
      if (!isFileReferenced) {
        const uploadDir = process.env.UPLOAD_DIR || './uploads';
        const filePath = path.join(uploadDir, fileId);
        // Prevent path traversal
        if (!path.resolve(filePath).startsWith(path.resolve(uploadDir))) {
          console.warn(`Skipped file deletion — path traversal detected: ${fileId}`);
        } else {
          try {
            await fs.unlink(filePath);
            console.log(`Deleted source video file: ${filePath}`);
          } catch (err) {
            if (err.code !== 'ENOENT') {
              console.error(`Failed to delete source video file ${filePath}:`, err);
            }
          }
        }
      }
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

export default router;
