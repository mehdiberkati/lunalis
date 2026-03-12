const EventEmitter = require('../modules/EventEmitter');
const DataManager = require('../modules/DataManager');
const ProjectManager = require('../modules/ProjectManager');

const localStorageMock = (() => {
  let store = {};
  return {
    getItem: jest.fn(key => store[key] || null),
    setItem: jest.fn((key, value) => { store[key] = value; }),
    removeItem: jest.fn(key => { delete store[key]; }),
    clear: jest.fn(() => { store = {}; })
  };
})();
global.localStorage = localStorageMock;

describe('ProjectManager', () => {
  let emitter, dm, pm;

  beforeEach(() => {
    localStorageMock.clear();
    jest.clearAllMocks();
    emitter = new EventEmitter();
    dm = new DataManager(emitter);
    pm = new ProjectManager(dm, emitter);
  });

  afterEach(() => {
    dm.stopAutoSave();
  });

  test('getAll() retourne un tableau vide au début', () => {
    expect(pm.getAll()).toEqual([]);
  });

  test('create() crée un projet et émet project:created', () => {
    const fn = jest.fn();
    emitter.on('project:created', fn);

    const project = pm.create({ name: 'Test Project', description: 'Desc', timeGoal: 50 });

    expect(project.name).toBe('Test Project');
    expect(project.description).toBe('Desc');
    expect(project.timeGoal).toBe(50);
    expect(project.totalTime).toBe(0);
    expect(pm.getAll()).toHaveLength(1);
    expect(fn).toHaveBeenCalledWith(project);
  });

  test('getById() retourne le bon projet', () => {
    const project = pm.create({ name: 'Find Me' });
    expect(pm.getById(project.id)).toBe(project);
  });

  test('getById() retourne null si non trouvé', () => {
    expect(pm.getById(99999)).toBeNull();
  });

  test('update() met à jour les champs', () => {
    const project = pm.create({ name: 'Original' });
    pm.update(project.id, { name: 'Updated', timeGoal: 100 });
    expect(pm.getById(project.id).name).toBe('Updated');
    expect(pm.getById(project.id).timeGoal).toBe(100);
  });

  test('delete() supprime le projet', () => {
    const project = pm.create({ name: 'To Delete' });
    const fn = jest.fn();
    emitter.on('project:deleted', fn);

    expect(pm.delete(project.id)).toBe(true);
    expect(pm.getAll()).toHaveLength(0);
    expect(fn).toHaveBeenCalledWith({ id: project.id });
  });

  test('delete() retourne false si non trouvé', () => {
    expect(pm.delete(99999)).toBe(false);
  });

  test('saveFromForm() crée un nouveau projet si pas en édition', () => {
    const result = pm.saveFromForm({ name: 'New', description: '', timeGoal: 0 });
    expect(result).not.toBeNull();
    expect(pm.getAll()).toHaveLength(1);
  });

  test('saveFromForm() met à jour si en édition', () => {
    const project = pm.create({ name: 'Original' });
    pm.startEditing(project.id);
    pm.saveFromForm({ name: 'Edited', description: 'Updated', timeGoal: 20 });
    expect(pm.getById(project.id).name).toBe('Edited');
  });

  test('saveFromForm() retourne null si nom vide', () => {
    expect(pm.saveFromForm({ name: '', description: '', timeGoal: 0 })).toBeNull();
  });

  test('getFocusStats() agrège les sessions par projet', () => {
    const project = pm.create({ name: 'My Project' });
    dm.data.focusSessions.push(
      { date: new Date().toISOString(), duration: 25, project: project.id },
      { date: new Date().toISOString(), duration: 45, project: project.id },
      { date: new Date().toISOString(), duration: 30, project: null }
    );
    const stats = pm.getFocusStats();
    const myStats = stats.find(s => s.name === 'My Project');
    expect(myStats.totalTime).toBe(70);
    expect(myStats.sessions).toBe(2);
  });
});
