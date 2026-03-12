/**
 * EventEmitter.js — Bus d'événements léger pour la communication inter-modules.
 *
 * Pattern Pub/Sub simple, sans dépendances externes.
 * Les modules émettent des événements nommés avec des données,
 * et les modules abonnés réagissent en conséquence.
 *
 * Utilisation :
 *   const emitter = new EventEmitter();
 *   emitter.on('xp:added', (data) => console.log(data));
 *   emitter.emit('xp:added', { amount: 5 });
 */
(function (global) {
  'use strict';

  class EventEmitter {
    constructor() {
      /** @type {Object.<string, Function[]>} Carte des événements -> listeners */
      this._listeners = {};
    }

    /**
     * Abonne un listener à un événement.
     * @param {string} event - Nom de l'événement (ex: 'xp:added')
     * @param {Function} listener - Fonction appelée avec (payload)
     * @returns {Function} Fonction de désabonnement
     */
    on(event, listener) {
      if (!this._listeners[event]) {
        this._listeners[event] = [];
      }
      this._listeners[event].push(listener);

      // Retourne une fonction pour se désabonner facilement
      return () => this.off(event, listener);
    }

    /**
     * Désabonne un listener d'un événement.
     * @param {string} event
     * @param {Function} listener
     */
    off(event, listener) {
      if (!this._listeners[event]) return;
      this._listeners[event] = this._listeners[event].filter(l => l !== listener);
    }

    /**
     * Abonne un listener qui ne se déclenche qu'une seule fois.
     * @param {string} event
     * @param {Function} listener
     */
    once(event, listener) {
      const wrapper = (payload) => {
        listener(payload);
        this.off(event, wrapper);
      };
      this.on(event, wrapper);
    }

    /**
     * Émet un événement vers tous les listeners abonnés.
     * @param {string} event - Nom de l'événement
     * @param {*} payload - Données transmises aux listeners
     */
    emit(event, payload) {
      const listeners = this._listeners[event];
      if (!listeners || listeners.length === 0) return;
      // Copie pour éviter les mutations pendant l'itération
      listeners.slice().forEach(listener => {
        try {
          listener(payload);
        } catch (err) {
          console.error(`[EventEmitter] Erreur dans listener "${event}":`, err);
        }
      });
    }

    /**
     * Supprime tous les listeners d'un événement (ou tous si pas d'argument).
     * @param {string} [event]
     */
    removeAllListeners(event) {
      if (event) {
        delete this._listeners[event];
      } else {
        this._listeners = {};
      }
    }
  }

  // Exposition : global (navigateur) ou module (Node.js/Jest)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EventEmitter;
  } else {
    global.EventEmitter = EventEmitter;
  }
})(typeof window !== 'undefined' ? window : global);
