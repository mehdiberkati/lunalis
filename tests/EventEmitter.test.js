const EventEmitter = require('../modules/EventEmitter');

describe('EventEmitter', () => {
  let emitter;

  beforeEach(() => {
    emitter = new EventEmitter();
  });

  test('on() and emit() — listener reçoit le payload', () => {
    const fn = jest.fn();
    emitter.on('test', fn);
    emitter.emit('test', { value: 42 });
    expect(fn).toHaveBeenCalledWith({ value: 42 });
  });

  test('on() retourne une fonction de désabonnement', () => {
    const fn = jest.fn();
    const unsub = emitter.on('test', fn);
    unsub();
    emitter.emit('test');
    expect(fn).not.toHaveBeenCalled();
  });

  test('off() désabonne un listener', () => {
    const fn = jest.fn();
    emitter.on('test', fn);
    emitter.off('test', fn);
    emitter.emit('test');
    expect(fn).not.toHaveBeenCalled();
  });

  test('once() ne se déclenche qu\'une seule fois', () => {
    const fn = jest.fn();
    emitter.once('test', fn);
    emitter.emit('test', 'a');
    emitter.emit('test', 'b');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('a');
  });

  test('removeAllListeners() supprime tous les listeners d\'un événement', () => {
    const fn1 = jest.fn();
    const fn2 = jest.fn();
    emitter.on('test', fn1);
    emitter.on('test', fn2);
    emitter.removeAllListeners('test');
    emitter.emit('test');
    expect(fn1).not.toHaveBeenCalled();
    expect(fn2).not.toHaveBeenCalled();
  });

  test('removeAllListeners() sans argument supprime tout', () => {
    const fn1 = jest.fn();
    const fn2 = jest.fn();
    emitter.on('a', fn1);
    emitter.on('b', fn2);
    emitter.removeAllListeners();
    emitter.emit('a');
    emitter.emit('b');
    expect(fn1).not.toHaveBeenCalled();
    expect(fn2).not.toHaveBeenCalled();
  });

  test('emit() ne plante pas si aucun listener', () => {
    expect(() => emitter.emit('unknown')).not.toThrow();
  });

  test('erreur dans un listener ne bloque pas les autres', () => {
    const fn1 = jest.fn(() => { throw new Error('boom'); });
    const fn2 = jest.fn();
    emitter.on('test', fn1);
    emitter.on('test', fn2);
    emitter.emit('test');
    expect(fn2).toHaveBeenCalled();
  });
});
